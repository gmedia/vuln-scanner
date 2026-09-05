from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import JSONResponse, StreamingResponse

from app.config import settings
from app.models.ai_gateway import AiApiKey, AiModel
from app.services.ai_crypto import decrypt_credential
from app.services.ai_wallet import billed_idr, cogs_idr, hold_idr, record_usage, release, reserve, settle

UPSTREAM_TIMEOUT = 120.0


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
    if body.get("tools") or body.get("functions") or body.get("function_call") or body.get("tool_choice"):
        raise HTTPException(status_code=400, detail="tools/functions are not supported")
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=400, detail="messages required")
    for msg in messages:
        content = msg.get("content") if isinstance(msg, dict) else None
        if isinstance(content, list):
            raise HTTPException(status_code=400, detail="multimodal content is not supported")


async def _load_model(db: AsyncSession, public_id: str) -> AiModel:
    row = (
        await db.execute(
            select(AiModel)
            .options(selectinload(AiModel.provider))
            .where(AiModel.public_id == public_id, AiModel.enabled.is_(True))
        )
    ).scalar_one_or_none()
    if row is None or not row.provider.enabled:
        raise HTTPException(status_code=404, detail="model_not_found")
    return row


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
    rows = list((await db.execute(select(AiModel).where(AiModel.enabled.is_(True)))).scalars().all())
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
    model = await _load_model(db, public_id)
    stream = bool(body.get("stream"))
    requested = int(body.get("max_tokens") or model.max_tokens_cap)
    hold = hold_idr(max_tokens=requested, model=model)
    reservation = await reserve(db, organization_id=key.organization_id, hold=hold, key_id=key.id)
    await db.commit()

    upstream_body = dict(body)
    upstream_body["model"] = model.upstream_id
    upstream_body["max_tokens"] = min(requested, model.max_tokens_cap)
    if stream:
        upstream_body["stream_options"] = {"include_usage": True}

    cred = decrypt_credential(model.provider.credential_enc)
    header_name = model.provider.auth_header or "Authorization"
    headers = {"Content-Type": "application/json"}
    if header_name.lower() == "authorization" and not cred.lower().startswith("bearer "):
        headers[header_name] = f"Bearer {cred}"
    else:
        headers[header_name] = cred

    url = model.provider.base_url.rstrip("/") + "/chat/completions"
    started = time.perf_counter()

    if stream:
        return StreamingResponse(
            _stream_and_settle(
                db,
                url=url,
                headers=headers,
                upstream_body=upstream_body,
                model=model,
                key=key,
                reservation_id=reservation.id,
                started=started,
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    try:
        async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, json=upstream_body)
    except httpx.HTTPError:
        await _fail_release(db, reservation.id, model, key)
        return _generic_upstream_fail()

    latency_ms = int((time.perf_counter() - started) * 1000)
    if resp.status_code in (401, 403) or resp.status_code >= 500:
        await _fail_release(db, reservation.id, model, key, http_status=resp.status_code)
        return _generic_upstream_fail()
    if resp.status_code >= 400:
        await _fail_release(db, reservation.id, model, key, http_status=resp.status_code)
        return openai_error(resp.status_code, "Request rejected", err_type="invalid_request_error")

    try:
        payload = resp.json()
    except json.JSONDecodeError:
        await _fail_release(db, reservation.id, model, key, http_status=resp.status_code)
        return _generic_upstream_fail()

    prompt_t, completion_t, finish = _usage_from_payload(payload if isinstance(payload, dict) else {})
    await _settle_usage(
        db,
        reservation_id=reservation.id,
        model=model,
        key=key,
        prompt_tokens=prompt_t,
        completion_tokens=completion_t,
        latency_ms=latency_ms,
        http_status=resp.status_code,
        finish_reason=finish,
        provider_request_id=payload.get("id") if isinstance(payload, dict) else None,
    )
    return JSONResponse(content=payload, status_code=200)


async def _fail_release(
    db: AsyncSession,
    reservation_id: UUID,
    model: AiModel,
    key: AiApiKey,
    http_status: int | None = None,
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
        reservation_id=reservation.id,
        http_status=http_status,
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
    latency_ms: int | None,
    http_status: int | None,
    finish_reason: str | None,
    provider_request_id: str | None,
) -> None:
    from app.models.ai_gateway import AiReservation

    reservation = await db.get(AiReservation, reservation_id)
    if reservation is None or reservation.status != "open":
        return
    billed = billed_idr(prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, model=model)
    cogs = cogs_idr(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        model=model,
        usd_idr=settings.ai_usd_idr,
    )
    await settle(db, reservation=reservation, billed=billed)
    await record_usage(
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
        reservation_id=reservation.id,
        latency_ms=latency_ms,
        http_status=http_status,
        finish_reason=finish_reason,
        provider_request_id=provider_request_id,
    )
    await db.commit()


async def _stream_and_settle(
    db: AsyncSession,
    *,
    url: str,
    headers: dict[str, str],
    upstream_body: dict[str, Any],
    model: AiModel,
    key: AiApiKey,
    reservation_id: UUID,
    started: float,
) -> AsyncIterator[bytes]:
    prompt_t = 0
    completion_t = 0
    finish: str | None = None
    req_id: str | None = None
    http_status = 200
    failed = False
    try:
        async with (
            httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT) as client,
            client.stream("POST", url, headers=headers, json=upstream_body) as resp,
        ):
            http_status = resp.status_code
            if resp.status_code in (401, 403) or resp.status_code >= 400:
                failed = True
                yield b"data: {\"error\":{\"message\":\"Upstream provider error\",\"type\":\"api_error\"}}\n\n"
                return
            async for chunk in resp.aiter_bytes():
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
                        if f:
                            finish = f
                yield chunk
    except httpx.HTTPError:
        failed = True
        yield b"data: {\"error\":{\"message\":\"Upstream provider error\",\"type\":\"api_error\"}}\n\n"
    finally:
        latency_ms = int((time.perf_counter() - started) * 1000)
        if failed:
            await _fail_release(db, reservation_id, model, key, http_status=http_status)
        else:
            await _settle_usage(
                db,
                reservation_id=reservation_id,
                model=model,
                key=key,
                prompt_tokens=prompt_t,
                completion_tokens=completion_t,
                latency_ms=latency_ms,
                http_status=http_status,
                finish_reason=finish,
                provider_request_id=req_id,
            )
        yield b"data: [DONE]\n\n"


def _upstream_headers(model: AiModel) -> tuple[str, dict[str, str]]:
    cred = decrypt_credential(model.provider.credential_enc)
    header_name = model.provider.auth_header or "Authorization"
    headers = {"Content-Type": "application/json"}
    if header_name.lower() == "authorization" and not cred.lower().startswith("bearer "):
        headers[header_name] = f"Bearer {cred}"
    else:
        headers[header_name] = cred
    url = model.provider.base_url.rstrip("/") + "/chat/completions"
    return url, headers


async def admin_trial_chat(
    db: AsyncSession,
    *,
    admin_id: UUID,
    body: dict[str, Any],
) -> JSONResponse:
    from datetime import UTC, datetime

    from sqlalchemy import func, select

    from app.models.ai_gateway import AiUsageEvent

    if body.get("stream"):
        raise HTTPException(status_code=400, detail="stream is not supported for admin trial")
    _validate_body(body)
    public_id = str(body.get("model") or "")
    model = await _load_model(db, public_id)

    month_start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    spent = (
        await db.execute(
            select(func.coalesce(func.sum(AiUsageEvent.billed_idr), 0)).where(
                AiUsageEvent.source == "admin_trial",
                AiUsageEvent.created_at >= month_start,
            )
        )
    ).scalar()
    spent_i = int(spent or 0)
    if spent_i >= settings.ai_trial_monthly_cap_idr:
        raise HTTPException(status_code=402, detail="Admin trial monthly cap reached")

    requested = int(body.get("max_tokens") or model.max_tokens_cap)
    upstream_body = dict(body)
    upstream_body["model"] = model.upstream_id
    upstream_body["max_tokens"] = min(requested, model.max_tokens_cap)
    url, headers = _upstream_headers(model)
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, json=upstream_body)
    except httpx.HTTPError:
        await record_usage(
            db,
            organization_id=None,
            user_id=admin_id,
            key_id=None,
            source="admin_trial",
            model=model,
            prompt_tokens=0,
            completion_tokens=0,
            billed=0,
            cogs=0,
            reservation_id=None,
            http_status=502,
        )
        await db.commit()
        return _generic_upstream_fail()

    latency_ms = int((time.perf_counter() - started) * 1000)
    if resp.status_code in (401, 403) or resp.status_code >= 500:
        await record_usage(
            db,
            organization_id=None,
            user_id=admin_id,
            key_id=None,
            source="admin_trial",
            model=model,
            prompt_tokens=0,
            completion_tokens=0,
            billed=0,
            cogs=0,
            reservation_id=None,
            http_status=resp.status_code,
        )
        await db.commit()
        return _generic_upstream_fail()
    if resp.status_code >= 400:
        await record_usage(
            db,
            organization_id=None,
            user_id=admin_id,
            key_id=None,
            source="admin_trial",
            model=model,
            prompt_tokens=0,
            completion_tokens=0,
            billed=0,
            cogs=0,
            reservation_id=None,
            http_status=resp.status_code,
        )
        await db.commit()
        return openai_error(resp.status_code, "Request rejected", err_type="invalid_request_error")

    try:
        payload = resp.json()
    except json.JSONDecodeError:
        await record_usage(
            db,
            organization_id=None,
            user_id=admin_id,
            key_id=None,
            source="admin_trial",
            model=model,
            prompt_tokens=0,
            completion_tokens=0,
            billed=0,
            cogs=0,
            reservation_id=None,
            http_status=resp.status_code,
        )
        await db.commit()
        return _generic_upstream_fail()

    prompt_t, completion_t, finish = _usage_from_payload(payload if isinstance(payload, dict) else {})
    billed = billed_idr(prompt_tokens=prompt_t, completion_tokens=completion_t, model=model)
    if spent_i + billed > settings.ai_trial_monthly_cap_idr:
        billed = 0
    cogs = cogs_idr(
        prompt_tokens=prompt_t,
        completion_tokens=completion_t,
        model=model,
        usd_idr=settings.ai_usd_idr,
    )
    await record_usage(
        db,
        organization_id=None,
        user_id=admin_id,
        key_id=None,
        source="admin_trial",
        model=model,
        prompt_tokens=prompt_t,
        completion_tokens=completion_t,
        billed=billed,
        cogs=cogs,
        reservation_id=None,
        latency_ms=latency_ms,
        http_status=resp.status_code,
        finish_reason=finish,
        provider_request_id=payload.get("id") if isinstance(payload, dict) else None,
    )
    await db.commit()
    return JSONResponse(content=payload, status_code=200)
