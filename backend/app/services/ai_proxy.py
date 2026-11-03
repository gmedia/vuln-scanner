from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException
from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import JSONResponse, StreamingResponse

from app.config import settings
from app.metrics import record_upstream_attempt
from app.models.ai_gateway import AiApiKey, AiModel, AiModelUpstream, AiProvider, AiUsageEvent
from app.services.ai_breaker import filter_available, record_failure, record_success
from app.services.ai_crypto import decrypt_credential
from app.services.ai_limits import acquire as acquire_limits
from app.services.ai_limits import release_concurrent
from app.services.ai_wallet import (
    PriceSnapshot,
    affordable_max_tokens,
    affordable_prompt_tokens,
    billed_idr,
    billed_usd,
    cogs_idr,
    cogs_usd,
    get_or_create_wallet,
    hold_idr,
    record_usage,
    release,
    reserve,
    resolve_snapshot,
    settle,
    snapshot_from_reservation,
)

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = frozenset({401, 403, 429, 500, 502, 503, 504})

STREAM_ERROR_EVENT = b'data: {"error":{"message":"Upstream provider error","type":"api_error"}}\n\n'


@dataclass(frozen=True, slots=True)
class UpstreamCandidate:
    provider_id: UUID
    upstream_id: str
    base_url: str
    auth_header: str
    credential_enc: str
    max_tokens_cap: int | None
    hpp_in: Decimal | None
    hpp_out: Decimal | None
    provider_status: str


@dataclass(frozen=True, slots=True)
class UpstreamResult:
    response: httpx.Response | None
    candidate: UpstreamCandidate | None
    error_kind: str | None


def openai_error(status_code: int, message: str, *, err_type: str, code: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"message": message, "type": err_type, "code": code}},
    )


def _generic_upstream_fail() -> JSONResponse:
    return openai_error(502, "Upstream provider error", err_type="api_error", code="upstream_error")


def _validate_body(body: dict[str, Any]) -> None:
    if body.get("n", 1) != 1:
        raise HTTPException(status_code=400, detail="n must be 1")
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=400, detail="messages required")


def _requested_max_tokens(body: dict[str, Any], model: AiModel) -> int:
    raw = body.get("max_tokens")
    if raw is None:
        raw = body.get("max_completion_tokens")
    if raw is None:
        return model.max_tokens_cap
    return int(raw)


def _estimate_prompt_tokens(body: dict[str, Any]) -> int:
    messages = body.get("messages")
    if not isinstance(messages, list):
        return 1
    chars = 0
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        content = msg.get("content")
        if isinstance(content, str):
            chars += len(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    chars += len(part["text"])
    return max(chars // 4, 1)


def _response_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return ""
    message = choices[0].get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content
    return ""


def _delta_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return ""
    delta = choices[0].get("delta")
    if isinstance(delta, dict):
        content = delta.get("content")
        if isinstance(content, str):
            return content
    return ""


def _billable_tokens(
    *, request: dict[str, Any], prompt_tokens: int, completion_tokens: int, content: str
) -> tuple[int, int, bool, bool]:
    """Fill in estimates for a 200 with missing/zero usage; never invent a charge when empty."""
    if prompt_tokens + completion_tokens > 0:
        return prompt_tokens, completion_tokens, False, False
    prompt_est = _estimate_prompt_tokens(request)
    completion_est = max(len(content) // 4, 0)
    if prompt_est + completion_est == 0:
        return 0, 0, True, False
    return prompt_est, completion_est, True, True


def trial_cap_usd() -> Decimal:
    """USD monthly cap; the deprecated IDR cap applies only when the USD knob is unset."""
    if "ai_trial_monthly_cap_usd" in settings.model_fields_set:
        return Decimal(settings.ai_trial_monthly_cap_usd)
    return Decimal(settings.ai_trial_monthly_cap_idr) / Decimal(settings.ai_usd_idr)


def _month_start() -> datetime:
    return datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def _admin_trial_spent_usd(db: AsyncSession) -> Decimal:
    legacy_in_usd = cast(AiUsageEvent.cogs_idr, Numeric) / Decimal(settings.ai_usd_idr)
    per_event = func.coalesce(AiUsageEvent.cogs_usd, legacy_in_usd)
    total = (
        await db.execute(
            select(func.coalesce(func.sum(per_event), 0)).where(
                AiUsageEvent.source == "admin_trial",
                AiUsageEvent.created_at >= _month_start(),
            )
        )
    ).scalar()
    return Decimal(str(total or 0))


def _provider_usable(provider: AiProvider) -> bool:
    return provider.enabled and provider.status != "disabled"


def _has_usable_candidate(model: AiModel) -> bool:
    # With failover off, routing only tries the primary, so a fallback cannot make the model callable.
    if _provider_usable(model.provider):
        return True
    if not settings.ai_upstream_failover_enabled:
        return False
    return any(row.enabled and _provider_usable(row.provider) for row in model.upstreams)


def _primary_candidate(model: AiModel) -> UpstreamCandidate:
    provider = model.provider
    return UpstreamCandidate(
        provider_id=provider.id,
        upstream_id=model.upstream_id,
        base_url=provider.base_url,
        auth_header=provider.auth_header or "Authorization",
        credential_enc=provider.credential_enc,
        max_tokens_cap=model.max_tokens_cap,
        hpp_in=model.hpp_usd_per_1m_in,
        hpp_out=model.hpp_usd_per_1m_out,
        provider_status=provider.status,
    )


def _fallback_candidate(row: AiModelUpstream) -> UpstreamCandidate:
    provider = row.provider
    return UpstreamCandidate(
        provider_id=provider.id,
        upstream_id=row.upstream_id,
        base_url=provider.base_url,
        auth_header=provider.auth_header or "Authorization",
        credential_enc=provider.credential_enc,
        max_tokens_cap=row.max_tokens_cap,
        hpp_in=row.hpp_usd_per_1m_in,
        hpp_out=row.hpp_usd_per_1m_out,
        provider_status=provider.status,
    )


async def _load_candidates(db: AsyncSession, public_id: str) -> tuple[AiModel, list[UpstreamCandidate]]:
    model = (
        await db.execute(
            select(AiModel)
            .options(
                selectinload(AiModel.provider),
                selectinload(AiModel.upstreams).selectinload(AiModelUpstream.provider),
            )
            .where(AiModel.public_id == public_id, AiModel.enabled.is_(True))
        )
    ).scalar_one_or_none()
    if model is None:
        raise HTTPException(status_code=404, detail="model_not_found")

    candidates: list[UpstreamCandidate] = []
    if _provider_usable(model.provider):
        candidates.append(_primary_candidate(model))
    else:
        logger.warning(
            "ai_upstream_candidate_skipped",
            extra={
                "model": public_id,
                "provider_id": str(model.provider.id),
                "reason": "provider_unusable",
            },
        )

    if settings.ai_upstream_failover_enabled:
        for row in model.upstreams:
            if not row.enabled:
                continue
            if not _provider_usable(row.provider):
                logger.warning(
                    "ai_upstream_candidate_skipped",
                    extra={
                        "model": public_id,
                        "provider_id": str(row.provider.id),
                        "reason": "provider_unusable",
                    },
                )
                continue
            candidates.append(_fallback_candidate(row))

    candidates.sort(key=lambda c: c.provider_status == "degraded")
    candidates = candidates[: settings.ai_upstream_max_candidates]
    if not candidates:
        raise HTTPException(status_code=404, detail="model_not_found")
    return model, candidates


def _candidate_target(candidate: UpstreamCandidate, capped: int) -> tuple[str, dict[str, str], int]:
    cred = decrypt_credential(candidate.credential_enc)
    header_name = candidate.auth_header or "Authorization"
    headers = {"Content-Type": "application/json"}
    if header_name.lower() == "authorization" and not cred.lower().startswith("bearer "):
        headers[header_name] = f"Bearer {cred}"
    else:
        headers[header_name] = cred
    url = candidate.base_url.rstrip("/") + "/chat/completions"
    max_tokens = min(capped, candidate.max_tokens_cap) if candidate.max_tokens_cap else capped
    return url, headers, max_tokens


def _retryable_status(code: int) -> bool:
    return code in RETRYABLE_STATUS


def _attempt_reason(status: int | None) -> str:
    if status is None:
        return "transport"
    if status in (401, 403):
        return "auth"
    if status == 429:
        return "rate_limit"
    if status >= 500:
        return "server_error"
    return "client_error"


def _can_retry(idx: int, candidates: Sequence[UpstreamCandidate], started: float) -> bool:
    if idx + 1 >= len(candidates):
        return False
    return _budget_left(started) >= settings.ai_upstream_min_attempt_seconds


def _budget_left(started: float) -> float:
    return settings.ai_upstream_failover_deadline_seconds - (time.monotonic() - started)


def _attempt_timeout(started: float, *, streaming: bool) -> httpx.Timeout:
    remaining = max(_budget_left(started), 0.001)
    hard_cap = min(remaining, settings.ai_upstream_timeout_seconds)
    read = min(hard_cap, settings.ai_upstream_stream_idle_timeout_seconds) if streaming else hard_cap
    connect = min(settings.ai_upstream_connect_timeout_seconds, remaining)
    return httpx.Timeout(connect=connect, read=read, write=hard_cap, pool=connect)


def _note_attempt_failure(
    *,
    public_id: str,
    idx: int,
    status: int | None,
    started: float,
    outcome: str,
) -> None:
    logger.warning(
        "ai_upstream_attempt_failed",
        extra={
            "model": public_id,
            "candidate_index": idx,
            "error_kind": "transport" if status is None else "status",
            "status": status,
            "latency_ms": int((time.monotonic() - started) * 1000),
        },
    )
    record_upstream_attempt(model=public_id, outcome=outcome, reason=_attempt_reason(status))


def _cogs_snapshot(candidate: UpstreamCandidate, locked: PriceSnapshot) -> PriceSnapshot:
    return replace(
        locked,
        hpp_usd_per_1m_in=candidate.hpp_in if candidate.hpp_in is not None else locked.hpp_usd_per_1m_in,
        hpp_usd_per_1m_out=candidate.hpp_out if candidate.hpp_out is not None else locked.hpp_usd_per_1m_out,
    )


async def _post_with_failover(
    candidates: Sequence[UpstreamCandidate],
    body: dict[str, Any],
    started: float,
    *,
    public_id: str,
) -> UpstreamResult:
    capped = int(body.get("max_tokens") or 0)
    async with httpx.AsyncClient(timeout=settings.ai_upstream_timeout_seconds) as client:
        for idx, candidate in enumerate(candidates):
            url, headers, max_tokens = _candidate_target(candidate, capped)
            attempt_body = {**body, "model": candidate.upstream_id, "max_tokens": max_tokens}
            try:
                resp = await client.post(
                    url,
                    headers=headers,
                    json=attempt_body,
                    timeout=_attempt_timeout(started, streaming=False),
                )
            except httpx.TransportError:
                retry = _can_retry(idx, candidates, started)
                await record_failure(candidate.provider_id, _attempt_reason(None))
                _note_attempt_failure(
                    public_id=public_id,
                    idx=idx,
                    status=None,
                    started=started,
                    outcome="retried" if retry else "failed",
                )
                if retry:
                    continue
                return UpstreamResult(None, candidate, "transport")
            if _retryable_status(resp.status_code):
                retry = _can_retry(idx, candidates, started)
                await record_failure(candidate.provider_id, _attempt_reason(resp.status_code))
                _note_attempt_failure(
                    public_id=public_id,
                    idx=idx,
                    status=resp.status_code,
                    started=started,
                    outcome="retried" if retry else "failed",
                )
                if retry:
                    continue
                return UpstreamResult(resp, candidate, None)
            served = resp.status_code < 400
            if served:
                await record_success(candidate.provider_id)
            record_upstream_attempt(
                model=public_id,
                outcome="served" if served else "rejected",
                reason="none" if served else "client_error",
            )
            return UpstreamResult(resp, candidate, None)
    return UpstreamResult(None, candidates[-1] if candidates else None, "transport")


def _usage_from_payload(payload: dict[str, Any]) -> tuple[int, int, str | None]:
    usage = payload.get("usage") if isinstance(payload, dict) else None
    if not isinstance(usage, dict):
        return 0, 0, payload.get("choices", [{}])[0].get("finish_reason") if isinstance(payload, dict) else None
    prompt = int(usage.get("prompt_tokens") or 0)
    completion = int(usage.get("completion_tokens") or 0)
    finish = None
    choices = payload.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        finish = choices[0].get("finish_reason")
    return prompt, completion, finish if isinstance(finish, str) else None


async def list_openai_models(db: AsyncSession, key: AiApiKey) -> dict[str, Any]:
    rows = list(
        (
            await db.execute(
                select(AiModel)
                .options(
                    selectinload(AiModel.provider),
                    selectinload(AiModel.upstreams).selectinload(AiModelUpstream.provider),
                )
                .where(AiModel.enabled.is_(True))
            )
        )
        .scalars()
        .all()
    )
    rows = [r for r in rows if _has_usable_candidate(r)]
    allow = key.allowed_model_ids or []
    if allow:
        rows = [r for r in rows if r.public_id in allow]
    return {
        "object": "list",
        "data": [{"id": r.public_id, "object": "model", "owned_by": "sinexis"} for r in rows],
    }


async def chat_completions(
    db: AsyncSession,
    *,
    key: AiApiKey,
    body: dict[str, Any],
) -> JSONResponse | StreamingResponse:
    _validate_body(body)
    public_id = str(body.get("model") or "")
    if key.allowed_model_ids and public_id not in key.allowed_model_ids:
        raise HTTPException(status_code=404, detail="model_not_found")
    model, candidates = await _load_candidates(db, public_id)
    candidates = await filter_available(candidates)
    snapshot = await resolve_snapshot(db, model)
    stream = bool(body.get("stream"))
    requested = _requested_max_tokens(body, model)
    prompt_est = _estimate_prompt_tokens(body)
    wallet = await get_or_create_wallet(db, key.organization_id)
    prompt_hold = affordable_prompt_tokens(balance_idr=wallet.balance_idr, snapshot=snapshot, prompt_tokens=prompt_est)
    if prompt_hold < 1:
        raise HTTPException(status_code=402, detail="Insufficient AI wallet balance")
    afford = affordable_max_tokens(
        balance_idr=wallet.balance_idr,
        snapshot=snapshot,
        max_tokens_cap=model.max_tokens_cap,
        prompt_tokens=prompt_hold,
    )
    if afford < 1:
        raise HTTPException(status_code=402, detail="Insufficient AI wallet balance")
    capped = min(requested, model.max_tokens_cap, afford)
    await acquire_limits(key, estimated_tokens=capped)
    hold = hold_idr(max_tokens=capped, snapshot=snapshot, prompt_tokens=prompt_hold)
    try:
        reservation = await reserve(
            db,
            organization_id=key.organization_id,
            hold=hold,
            snapshot=snapshot,
            key_id=key.id,
            model_public_id=model.public_id,
            prompt_tokens_est=prompt_hold,
            completion_tokens_max=capped,
            actor_user_id=key.created_by_user_id,
        )
        await db.commit()
    except Exception:
        await release_concurrent(key.id)
        raise

    upstream_body = dict(body)
    upstream_body["max_tokens"] = capped
    if stream:
        upstream_body["stream_options"] = {"include_usage": True}

    started = time.monotonic()

    if stream:
        return StreamingResponse(
            _stream_and_settle(
                db,
                candidates=candidates,
                body=upstream_body,
                capped=capped,
                model=model,
                key=key,
                reservation_id=reservation.id,
                locked=snapshot,
                started=started,
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    result = await _post_with_failover(candidates, upstream_body, started, public_id=model.public_id)
    served = result.candidate
    resp = result.response
    if resp is None or served is None:
        await release_concurrent(key.id)
        await _fail_release(
            db,
            reservation.id,
            model,
            key,
            snapshot,
            request_payload=body,
            provider_id=served.provider_id if served is not None else None,
        )
        return _generic_upstream_fail()

    latency_ms = int((time.monotonic() - started) * 1000)
    if resp.status_code in (401, 403) or resp.status_code >= 500:
        await release_concurrent(key.id)
        await _fail_release(
            db,
            reservation.id,
            model,
            key,
            snapshot,
            http_status=resp.status_code,
            request_payload=body,
            provider_id=served.provider_id,
        )
        return _generic_upstream_fail()
    if resp.status_code >= 400:
        await release_concurrent(key.id)
        await _fail_release(
            db,
            reservation.id,
            model,
            key,
            snapshot,
            http_status=resp.status_code,
            request_payload=body,
            provider_id=served.provider_id,
        )
        return openai_error(resp.status_code, "Request rejected", err_type="invalid_request_error")

    try:
        payload = resp.json()
    except json.JSONDecodeError:
        await release_concurrent(key.id)
        await _fail_release(
            db,
            reservation.id,
            model,
            key,
            snapshot,
            http_status=resp.status_code,
            request_payload=body,
            provider_id=served.provider_id,
        )
        return _generic_upstream_fail()

    payload_dict = payload if isinstance(payload, dict) else {}
    prompt_t, completion_t, finish = _usage_from_payload(payload_dict)
    prompt_t, completion_t, usage_missing, billed_estimated = _billable_tokens(
        request=body,
        prompt_tokens=prompt_t,
        completion_tokens=completion_t,
        content=_response_content(payload_dict),
    )
    await _settle_usage(
        db,
        reservation_id=reservation.id,
        model=model,
        key=key,
        prompt_tokens=prompt_t,
        completion_tokens=completion_t,
        usage_missing=usage_missing,
        billed_estimated=billed_estimated,
        latency_ms=latency_ms,
        http_status=resp.status_code,
        finish_reason=finish,
        provider_request_id=payload_dict.get("id"),
        request_payload=body,
        response_payload=payload_dict if isinstance(payload, dict) else None,
        provider_id=served.provider_id,
        cogs_snapshot=_cogs_snapshot(served, snapshot),
    )
    await release_concurrent(key.id)
    return JSONResponse(content=payload, status_code=200)


async def _fail_release(
    db: AsyncSession,
    reservation_id: UUID,
    model: AiModel,
    key: AiApiKey,
    snapshot: PriceSnapshot,
    http_status: int | None = None,
    request_payload: dict[str, Any] | None = None,
    response_payload: dict[str, Any] | None = None,
    *,
    provider_id: UUID | None = None,
) -> None:
    from app.models.ai_gateway import AiReservation

    reservation = await db.get(AiReservation, reservation_id)
    if reservation is None or reservation.status != "open":
        return
    await release(db, reservation)
    await record_usage(
        db,
        organization_id=key.organization_id,
        user_id=key.created_by_user_id,
        key_id=key.id,
        source="customer",
        model=model,
        prompt_tokens=0,
        completion_tokens=0,
        billed=0,
        cogs=0,
        billed_usd=billed_usd(prompt_tokens=0, completion_tokens=0, snapshot=snapshot),
        cogs_usd=cogs_usd(prompt_tokens=0, completion_tokens=0, snapshot=snapshot),
        snapshot=snapshot,
        reservation_id=reservation.id,
        http_status=http_status,
        request_payload=request_payload,
        response_payload=response_payload,
        provider_id=provider_id,
    )
    await db.commit()


async def _settle_usage(
    db: AsyncSession,
    *,
    reservation_id: UUID,
    model: AiModel,
    key: AiApiKey,
    prompt_tokens: int,
    completion_tokens: int,
    usage_missing: bool,
    billed_estimated: bool,
    latency_ms: int | None,
    http_status: int | None,
    finish_reason: str | None,
    provider_request_id: str | None,
    request_payload: dict[str, Any] | None = None,
    response_payload: dict[str, Any] | None = None,
    provider_id: UUID | None = None,
    cogs_snapshot: PriceSnapshot | None = None,
) -> None:
    from app.models.ai_gateway import AiReservation

    reservation = await db.get(AiReservation, reservation_id)
    if reservation is None or reservation.status != "open":
        return
    locked = snapshot_from_reservation(reservation)
    if locked is None:
        locked = await resolve_snapshot(db, model)
    effective = cogs_snapshot or locked
    billed = billed_idr(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, snapshot=locked)
    cogs = cogs_idr(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, snapshot=effective)
    event = await record_usage(
        db,
        organization_id=key.organization_id,
        user_id=key.created_by_user_id,
        key_id=key.id,
        source="customer",
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        billed=billed,
        cogs=cogs,
        billed_usd=billed_usd(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, snapshot=locked),
        cogs_usd=cogs_usd(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, snapshot=effective),
        snapshot=effective,
        usage_missing=usage_missing,
        billed_estimated=billed_estimated,
        reservation_id=reservation.id,
        latency_ms=latency_ms,
        http_status=http_status,
        finish_reason=finish_reason,
        provider_request_id=provider_request_id,
        request_payload=request_payload,
        response_payload=response_payload,
        provider_id=provider_id,
    )
    await settle(db, reservation=reservation, billed=billed, usage_event=event)
    await db.commit()


async def _stream_and_settle(
    db: AsyncSession,
    *,
    candidates: Sequence[UpstreamCandidate],
    body: dict[str, Any],
    capped: int,
    model: AiModel,
    key: AiApiKey,
    reservation_id: UUID,
    locked: PriceSnapshot,
    started: float,
) -> AsyncIterator[bytes]:
    prompt_t = 0
    completion_t = 0
    finish: str | None = None
    req_id: str | None = None
    http_status = 200
    failed = False
    first_byte_sent = False
    streamed_parts: list[str] = []
    served: UpstreamCandidate | None = None
    client = httpx.AsyncClient(timeout=settings.ai_upstream_timeout_seconds)
    try:
        for idx, candidate in enumerate(candidates):
            retry = False
            served = candidate
            url, headers, max_tokens = _candidate_target(candidate, capped)
            attempt_body = {**body, "model": candidate.upstream_id, "max_tokens": max_tokens}
            try:
                async with client.stream(
                    "POST",
                    url,
                    headers=headers,
                    json=attempt_body,
                    timeout=_attempt_timeout(started, streaming=True),
                ) as resp:
                    http_status = resp.status_code
                    if resp.status_code >= 400:
                        upstream_fault = _retryable_status(resp.status_code)
                        retry = upstream_fault and _can_retry(idx, candidates, started)
                        if upstream_fault:
                            await record_failure(candidate.provider_id, _attempt_reason(resp.status_code))
                        _note_attempt_failure(
                            public_id=model.public_id,
                            idx=idx,
                            status=resp.status_code,
                            started=started,
                            outcome="retried" if retry else ("failed" if upstream_fault else "rejected"),
                        )
                        if not retry:
                            failed = True
                            yield STREAM_ERROR_EVENT
                            return
                    else:
                        async for chunk in resp.aiter_bytes():
                            first_byte_sent = True
                            text = chunk.decode("utf-8", errors="replace")
                            for line in text.splitlines():
                                if not line.startswith("data:"):
                                    continue
                                data = line[5:].strip()
                                if data == "[DONE]":
                                    continue
                                try:
                                    payload = json.loads(data)
                                except json.JSONDecodeError:
                                    continue
                                if isinstance(payload, dict):
                                    if payload.get("id"):
                                        req_id = str(payload["id"])
                                    p, c, f = _usage_from_payload(payload)
                                    if p or c:
                                        prompt_t, completion_t = p, c
                                    else:
                                        piece = _delta_content(payload)
                                        if piece:
                                            streamed_parts.append(piece)
                                    if f:
                                        finish = f
                            yield chunk
            except httpx.TransportError:
                can_retry = not first_byte_sent and _can_retry(idx, candidates, started)
                await record_failure(candidate.provider_id, _attempt_reason(None))
                _note_attempt_failure(
                    public_id=model.public_id,
                    idx=idx,
                    status=None,
                    started=started,
                    outcome="retried" if can_retry else "failed",
                )
                if not can_retry:
                    failed = True
                    yield STREAM_ERROR_EVENT
                    return
                retry = True
            if retry:
                continue
            await record_success(candidate.provider_id)
            record_upstream_attempt(model=model.public_id, outcome="served", reason="none")
            break
    finally:
        await client.aclose()
        latency_ms = int((time.monotonic() - started) * 1000)
        await release_concurrent(key.id)
        stored_req = dict(body)
        stored_req["model"] = model.public_id
        if failed or served is None:
            await _fail_release(
                db,
                reservation_id,
                model,
                key,
                locked,
                http_status=http_status,
                request_payload=stored_req,
                provider_id=served.provider_id if served is not None else None,
            )
        else:
            prompt_t, completion_t, usage_missing, billed_estimated = _billable_tokens(
                request=stored_req,
                prompt_tokens=prompt_t,
                completion_tokens=completion_t,
                content="".join(streamed_parts),
            )
            await _settle_usage(
                db,
                reservation_id=reservation_id,
                model=model,
                key=key,
                prompt_tokens=prompt_t,
                completion_tokens=completion_t,
                usage_missing=usage_missing,
                billed_estimated=billed_estimated,
                latency_ms=latency_ms,
                http_status=http_status,
                finish_reason=finish,
                provider_request_id=req_id,
                request_payload=stored_req,
                provider_id=served.provider_id,
                cogs_snapshot=_cogs_snapshot(served, locked),
            )
        yield b"data: [DONE]\n\n"


async def _admin_trial_usage(
    db: AsyncSession,
    *,
    admin_id: UUID,
    model: AiModel,
    snapshot: PriceSnapshot,
    prompt_tokens: int,
    completion_tokens: int,
    billed: int,
    cogs: int,
    usage_missing: bool,
    billed_estimated: bool,
    http_status: int,
    latency_ms: int | None = None,
    finish_reason: str | None = None,
    provider_request_id: str | None = None,
    request_payload: dict[str, Any] | None = None,
    response_payload: dict[str, Any] | None = None,
    provider_id: UUID | None = None,
) -> AiUsageEvent:
    return await record_usage(
        db,
        organization_id=None,
        user_id=admin_id,
        key_id=None,
        source="admin_trial",
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        billed=billed,
        cogs=cogs,
        billed_usd=billed_usd(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, snapshot=snapshot),
        cogs_usd=cogs_usd(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, snapshot=snapshot),
        snapshot=snapshot,
        usage_missing=usage_missing,
        billed_estimated=billed_estimated,
        reservation_id=None,
        latency_ms=latency_ms,
        http_status=http_status,
        finish_reason=finish_reason,
        provider_request_id=provider_request_id,
        request_payload=request_payload,
        response_payload=response_payload,
        provider_id=provider_id,
    )


async def admin_trial_chat(
    db: AsyncSession,
    *,
    admin_id: UUID,
    body: dict[str, Any],
) -> JSONResponse:
    if body.get("stream"):
        raise HTTPException(status_code=400, detail="stream is not supported for admin trial")
    _validate_body(body)
    public_id = str(body.get("model") or "")
    model, candidates = await _load_candidates(db, public_id)
    candidates = await filter_available(candidates)
    snapshot = await resolve_snapshot(db, model)

    cap_usd = trial_cap_usd()
    spent_usd = await _admin_trial_spent_usd(db)
    if spent_usd >= cap_usd:
        raise HTTPException(status_code=402, detail="Admin trial monthly cap reached")

    requested = int(body.get("max_tokens") or model.max_tokens_cap)
    capped = min(requested, model.max_tokens_cap)
    upstream_body = dict(body)
    upstream_body["max_tokens"] = capped
    started = time.monotonic()
    result = await _post_with_failover(candidates, upstream_body, started, public_id=model.public_id)
    served = result.candidate
    resp = result.response
    effective = _cogs_snapshot(served, snapshot) if served is not None else snapshot
    served_provider_id = served.provider_id if served is not None else None

    if resp is None or served is None:
        await _admin_trial_usage(
            db,
            admin_id=admin_id,
            model=model,
            snapshot=effective,
            prompt_tokens=0,
            completion_tokens=0,
            billed=0,
            cogs=0,
            usage_missing=False,
            billed_estimated=False,
            http_status=502,
            request_payload=body,
            provider_id=served_provider_id,
        )
        await db.commit()
        return _generic_upstream_fail()

    latency_ms = int((time.monotonic() - started) * 1000)
    if resp.status_code in (401, 403) or resp.status_code >= 500:
        await _admin_trial_usage(
            db,
            admin_id=admin_id,
            model=model,
            snapshot=effective,
            prompt_tokens=0,
            completion_tokens=0,
            billed=0,
            cogs=0,
            usage_missing=False,
            billed_estimated=False,
            http_status=resp.status_code,
            request_payload=body,
            provider_id=served_provider_id,
        )
        await db.commit()
        return _generic_upstream_fail()
    if resp.status_code >= 400:
        await _admin_trial_usage(
            db,
            admin_id=admin_id,
            model=model,
            snapshot=effective,
            prompt_tokens=0,
            completion_tokens=0,
            billed=0,
            cogs=0,
            usage_missing=False,
            billed_estimated=False,
            http_status=resp.status_code,
            request_payload=body,
            provider_id=served_provider_id,
        )
        await db.commit()
        return openai_error(resp.status_code, "Request rejected", err_type="invalid_request_error")

    try:
        payload = resp.json()
    except json.JSONDecodeError:
        await _admin_trial_usage(
            db,
            admin_id=admin_id,
            model=model,
            snapshot=effective,
            prompt_tokens=0,
            completion_tokens=0,
            billed=0,
            cogs=0,
            usage_missing=False,
            billed_estimated=False,
            http_status=resp.status_code,
            request_payload=body,
            provider_id=served_provider_id,
        )
        await db.commit()
        return _generic_upstream_fail()

    payload_dict = payload if isinstance(payload, dict) else {}
    prompt_t, completion_t, finish = _usage_from_payload(payload_dict)
    prompt_t, completion_t, usage_missing, billed_estimated = _billable_tokens(
        request=body,
        prompt_tokens=prompt_t,
        completion_tokens=completion_t,
        content=_response_content(payload_dict),
    )
    billed = billed_idr(prompt_tokens=prompt_t, completion_tokens=completion_t, snapshot=snapshot)
    cogs = cogs_idr(prompt_tokens=prompt_t, completion_tokens=completion_t, snapshot=effective)
    cogs_usd_value = cogs_usd(prompt_tokens=prompt_t, completion_tokens=completion_t, snapshot=effective)
    if spent_usd + cogs_usd_value > cap_usd:
        billed = 0
    await _admin_trial_usage(
        db,
        admin_id=admin_id,
        model=model,
        snapshot=effective,
        prompt_tokens=prompt_t,
        completion_tokens=completion_t,
        billed=billed,
        cogs=cogs,
        usage_missing=usage_missing,
        billed_estimated=billed_estimated,
        http_status=resp.status_code,
        latency_ms=latency_ms,
        finish_reason=finish,
        provider_request_id=payload_dict.get("id"),
        request_payload=body,
        response_payload=payload_dict if isinstance(payload, dict) else None,
        provider_id=served_provider_id,
    )
    await db.commit()
    return JSONResponse(content=payload, status_code=200)
