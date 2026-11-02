from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.ai_gateway import PROVIDER_STATUSES, AiModel, AiModelUpstream, AiProvider, AiUsageEvent
from app.models.user import User
from app.schemas.ai_gateway import (
    AiAdminUsageList,
    AiAdminUsageOut,
    AiModelCreate,
    AiModelList,
    AiModelOut,
    AiModelUpdate,
    AiProviderCreate,
    AiProviderList,
    AiProviderOut,
    AiProviderUpdate,
    AiUpstreamCreate,
    AiUpstreamOut,
    AiUpstreamUpdate,
    AiWalletOut,
    AiWalletTopup,
)
from app.services import ai_fx
from app.services.ai_crypto import encrypt_credential
from app.services.ai_pricing import (
    canonical_hpp_usd,
    canonical_price_usd,
    legacy_idr_per_1k_to_usd_per_1m,
    legacy_usd_per_1k_to_usd_per_1m,
    usd_per_1m_to_idr_per_1k,
    usd_per_1m_to_legacy_per_1k,
)
from app.services.ai_proxy import admin_trial_chat
from app.services.ai_wallet import topup as wallet_topup
from app.services.auth import get_current_admin

router = APIRouter(prefix="/admin/ai", tags=["admin-ai"])

admin_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin",
)


async def _limit(request: Request) -> Response | None:
    return await admin_limiter(request)


def _disabled() -> None:
    if not settings.ai_gateway_enabled:
        raise HTTPException(status_code=404, detail="Not found")


def _provider_out(row: AiProvider) -> AiProviderOut:
    return AiProviderOut(
        id=row.id,
        name=row.name,
        base_url=row.base_url,
        auth_header=row.auth_header,
        credential_set=bool(row.credential_enc),
        enabled=row.enabled,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _upstream_out(row: AiModelUpstream) -> AiUpstreamOut:
    return AiUpstreamOut(
        id=row.id,
        provider_id=row.provider_id,
        provider_name=row.provider.name,
        provider_status=row.provider.status,
        provider_enabled=row.provider.enabled,
        upstream_id=row.upstream_id,
        hpp_usd_per_1m_in=float(row.hpp_usd_per_1m_in) if row.hpp_usd_per_1m_in is not None else None,
        hpp_usd_per_1m_out=float(row.hpp_usd_per_1m_out) if row.hpp_usd_per_1m_out is not None else None,
        max_tokens_cap=row.max_tokens_cap,
        rank=row.rank,
        enabled=row.enabled,
    )


def _model_out(row: AiModel, fx_rate: Decimal) -> AiModelOut:
    usd_in = canonical_price_usd(row.price_usd_per_1m_in, row.price_idr_per_1k_in, fx_rate)
    usd_out = canonical_price_usd(row.price_usd_per_1m_out, row.price_idr_per_1k_out, fx_rate)
    hpp_in = canonical_hpp_usd(row.hpp_usd_per_1m_in, row.hpp_usd_per_1k_in)
    hpp_out = canonical_hpp_usd(row.hpp_usd_per_1m_out, row.hpp_usd_per_1k_out)
    return AiModelOut(
        id=row.id,
        provider_id=row.provider_id,
        public_id=row.public_id,
        upstream_id=row.upstream_id,
        hpp_usd_per_1k_in=row.hpp_usd_per_1k_in,
        hpp_usd_per_1k_out=row.hpp_usd_per_1k_out,
        price_idr_per_1k_in=usd_per_1m_to_idr_per_1k(usd_in, fx_rate),
        price_idr_per_1k_out=usd_per_1m_to_idr_per_1k(usd_out, fx_rate),
        price_usd_per_1m_in=float(usd_in),
        price_usd_per_1m_out=float(usd_out),
        hpp_usd_per_1m_in=float(hpp_in),
        hpp_usd_per_1m_out=float(hpp_out),
        max_ctx=row.max_ctx,
        max_tokens_cap=row.max_tokens_cap,
        enabled=row.enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
        upstreams=[_upstream_out(u) for u in row.upstreams],
    )


_RANK_OFFSET = 1000


async def _load_model_for_admin(db: AsyncSession, model_id: uuid.UUID) -> AiModel:
    stmt = (
        select(AiModel)
        .options(selectinload(AiModel.upstreams).selectinload(AiModelUpstream.provider))
        .where(AiModel.id == model_id)
        .execution_options(populate_existing=True)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return row


async def _offset_ranks(db: AsyncSession, model_id: uuid.UUID) -> None:
    await db.execute(
        update(AiModelUpstream)
        .where(AiModelUpstream.model_id == model_id)
        .values(rank=AiModelUpstream.rank + _RANK_OFFSET)
        .execution_options(synchronize_session=False)
    )


async def _ordered_upstreams(db: AsyncSession, model_id: uuid.UUID) -> list[AiModelUpstream]:
    return list(
        (
            await db.execute(
                select(AiModelUpstream)
                .where(AiModelUpstream.model_id == model_id)
                .order_by(AiModelUpstream.rank)
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )


async def _resequence(db: AsyncSession, model_id: uuid.UUID) -> None:
    """Compact a model's fallback ranks to 1..n without writing a rank below 1."""
    await _offset_ranks(db, model_id)
    for position, upstream in enumerate(await _ordered_upstreams(db, model_id), start=1):
        upstream.rank = position
    await db.flush()


async def _move_upstream(
    db: AsyncSession,
    model_id: uuid.UUID,
    moved_id: uuid.UUID,
    target_rank: int,
) -> None:
    """Move one fallback to a 1-based position, shifting the others instead of rejecting."""
    await _offset_ranks(db, model_id)
    rows = await _ordered_upstreams(db, model_id)
    moved = next((row for row in rows if row.id == moved_id), None)
    if moved is None:
        return
    ordered = [row for row in rows if row.id != moved_id]
    ordered.insert(max(0, min(target_rank - 1, len(ordered))), moved)
    for position, upstream in enumerate(ordered, start=1):
        upstream.rank = position
    await db.flush()


async def _require_usable_provider(db: AsyncSession, provider_id: uuid.UUID) -> AiProvider:
    provider = await db.get(AiProvider, provider_id)
    if provider is None or not provider.enabled or provider.status == "disabled":
        raise HTTPException(status_code=422, detail="Unknown or disabled provider")
    return provider


def _created_price_usd(usd: Decimal | None, legacy_idr: int | None, fx_rate: Decimal) -> Decimal:
    if usd is not None:
        return usd
    return legacy_idr_per_1k_to_usd_per_1m(legacy_idr, fx_rate)


def _created_hpp_usd(usd: Decimal | None, legacy_usd: int) -> Decimal:
    if usd is not None:
        return usd
    return legacy_usd_per_1k_to_usd_per_1m(legacy_usd)


@router.get("/providers", response_model=AiProviderList)
async def list_providers(
    request: Request,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiProviderList | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    total = (await db.execute(select(func.count(AiProvider.id)))).scalar() or 0
    rows = list((await db.execute(select(AiProvider).order_by(AiProvider.name))).scalars().all())
    return AiProviderList(items=[_provider_out(r) for r in rows], total=total)


@router.post("/providers", response_model=AiProviderOut, status_code=status.HTTP_201_CREATED)
async def create_provider(
    request: Request,
    body: AiProviderCreate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiProviderOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    if body.status not in PROVIDER_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid status")
    row = AiProvider(
        name=body.name,
        base_url=str(body.base_url).rstrip("/"),
        auth_header=body.auth_header,
        credential_enc=encrypt_credential(body.credential),
        enabled=body.enabled,
        status=body.status,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _provider_out(row)


@router.patch("/providers/{provider_id}", response_model=AiProviderOut)
async def update_provider(
    provider_id: uuid.UUID,
    request: Request,
    body: AiProviderUpdate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiProviderOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    row = await db.get(AiProvider, provider_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    if body.status is not None and body.status not in PROVIDER_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid status")
    if body.name is not None:
        row.name = body.name
    if body.base_url is not None:
        row.base_url = str(body.base_url).rstrip("/")
    if body.auth_header is not None:
        row.auth_header = body.auth_header
    if body.credential is not None:
        row.credential_enc = encrypt_credential(body.credential)
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.status is not None:
        row.status = body.status
    await db.commit()
    await db.refresh(row)
    return _provider_out(row)


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_provider(
    provider_id: uuid.UUID,
    request: Request,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    row = await db.get(AiProvider, provider_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/models", response_model=AiModelList)
async def list_models(
    request: Request,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    provider_id: uuid.UUID | None = Query(default=None),
) -> AiModelList | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    stmt = (
        select(AiModel)
        .options(selectinload(AiModel.upstreams).selectinload(AiModelUpstream.provider))
        .execution_options(populate_existing=True)
    )
    count_stmt = select(func.count(AiModel.id))
    if provider_id is not None:
        stmt = stmt.where(AiModel.provider_id == provider_id)
        count_stmt = count_stmt.where(AiModel.provider_id == provider_id)
    total = (await db.execute(count_stmt)).scalar() or 0
    rows = list((await db.execute(stmt.order_by(AiModel.public_id))).scalars().all())
    fx_rate, _, _ = await ai_fx.effective_rate(db)
    return AiModelList(items=[_model_out(r, fx_rate) for r in rows], total=total)


@router.post("/models", response_model=AiModelOut, status_code=status.HTTP_201_CREATED)
async def create_model(
    request: Request,
    body: AiModelCreate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiModelOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    provider = await db.get(AiProvider, body.provider_id)
    if provider is None:
        raise HTTPException(status_code=422, detail="Unknown provider")
    existing = (await db.execute(select(AiModel).where(AiModel.public_id == body.public_id))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="public_id already exists")
    fx_rate, _, _ = await ai_fx.effective_rate(db)
    usd_in = _created_price_usd(body.price_usd_per_1m_in, body.price_idr_per_1k_in, fx_rate)
    usd_out = _created_price_usd(body.price_usd_per_1m_out, body.price_idr_per_1k_out, fx_rate)
    hpp_in = _created_hpp_usd(body.hpp_usd_per_1m_in, body.hpp_usd_per_1k_in)
    hpp_out = _created_hpp_usd(body.hpp_usd_per_1m_out, body.hpp_usd_per_1k_out)
    row = AiModel(
        provider_id=body.provider_id,
        public_id=body.public_id,
        upstream_id=body.upstream_id,
        hpp_usd_per_1k_in=usd_per_1m_to_legacy_per_1k(hpp_in),
        hpp_usd_per_1k_out=usd_per_1m_to_legacy_per_1k(hpp_out),
        price_idr_per_1k_in=usd_per_1m_to_idr_per_1k(usd_in, fx_rate),
        price_idr_per_1k_out=usd_per_1m_to_idr_per_1k(usd_out, fx_rate),
        price_usd_per_1m_in=usd_in,
        price_usd_per_1m_out=usd_out,
        hpp_usd_per_1m_in=hpp_in,
        hpp_usd_per_1m_out=hpp_out,
        max_ctx=body.max_ctx,
        max_tokens_cap=body.max_tokens_cap,
        enabled=body.enabled,
    )
    db.add(row)
    await db.flush()
    new_model_id = row.id
    await db.commit()
    fresh = await _load_model_for_admin(db, new_model_id)
    return _model_out(fresh, fx_rate)


@router.patch("/models/{model_id}", response_model=AiModelOut)
async def update_model(
    model_id: uuid.UUID,
    request: Request,
    body: AiModelUpdate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiModelOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    row = await _load_model_for_admin(db, model_id)
    data = body.model_dump(exclude_unset=True)
    if "public_id" in data:
        clash = (
            await db.execute(select(AiModel).where(AiModel.public_id == data["public_id"], AiModel.id != model_id))
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(status_code=409, detail="public_id already exists")
    new_provider_id: uuid.UUID | None = data.pop("provider_id", None)
    new_upstream_id: str | None = data.get("upstream_id")
    if new_provider_id is not None or new_upstream_id is not None:
        target_provider_id: uuid.UUID = new_provider_id if new_provider_id is not None else row.provider_id
        target_upstream_id: str = new_upstream_id if new_upstream_id is not None else row.upstream_id
        if new_provider_id is not None and new_provider_id != row.provider_id:
            await _require_usable_provider(db, new_provider_id)
        if (target_provider_id, target_upstream_id) != (row.provider_id, row.upstream_id) and any(
            u.provider_id == target_provider_id and u.upstream_id == target_upstream_id for u in row.upstreams
        ):
            raise HTTPException(status_code=409, detail="target already exists as a fallback upstream")
    if new_provider_id is not None:
        row.provider_id = new_provider_id
    fx_rate, _, _ = await ai_fx.effective_rate(db)
    usd_in: Decimal | None = data.pop("price_usd_per_1m_in", None)
    usd_out: Decimal | None = data.pop("price_usd_per_1m_out", None)
    legacy_in: int | None = data.pop("price_idr_per_1k_in", None)
    legacy_out: int | None = data.pop("price_idr_per_1k_out", None)
    hpp_usd_in: Decimal | None = data.pop("hpp_usd_per_1m_in", None)
    hpp_usd_out: Decimal | None = data.pop("hpp_usd_per_1m_out", None)
    legacy_hpp_in: int | None = data.pop("hpp_usd_per_1k_in", None)
    legacy_hpp_out: int | None = data.pop("hpp_usd_per_1k_out", None)
    if usd_in is not None:
        row.price_usd_per_1m_in = usd_in
        row.price_idr_per_1k_in = usd_per_1m_to_idr_per_1k(usd_in, fx_rate)
    elif legacy_in is not None:
        converted_in = legacy_idr_per_1k_to_usd_per_1m(legacy_in, fx_rate)
        row.price_usd_per_1m_in = converted_in
        row.price_idr_per_1k_in = usd_per_1m_to_idr_per_1k(converted_in, fx_rate)
    if usd_out is not None:
        row.price_usd_per_1m_out = usd_out
        row.price_idr_per_1k_out = usd_per_1m_to_idr_per_1k(usd_out, fx_rate)
    elif legacy_out is not None:
        converted_out = legacy_idr_per_1k_to_usd_per_1m(legacy_out, fx_rate)
        row.price_usd_per_1m_out = converted_out
        row.price_idr_per_1k_out = usd_per_1m_to_idr_per_1k(converted_out, fx_rate)
    if hpp_usd_in is not None:
        row.hpp_usd_per_1m_in = hpp_usd_in
        row.hpp_usd_per_1k_in = usd_per_1m_to_legacy_per_1k(hpp_usd_in)
    elif legacy_hpp_in is not None:
        row.hpp_usd_per_1m_in = legacy_usd_per_1k_to_usd_per_1m(legacy_hpp_in)
        row.hpp_usd_per_1k_in = legacy_hpp_in
    if hpp_usd_out is not None:
        row.hpp_usd_per_1m_out = hpp_usd_out
        row.hpp_usd_per_1k_out = usd_per_1m_to_legacy_per_1k(hpp_usd_out)
    elif legacy_hpp_out is not None:
        row.hpp_usd_per_1m_out = legacy_usd_per_1k_to_usd_per_1m(legacy_hpp_out)
        row.hpp_usd_per_1k_out = legacy_hpp_out
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    fresh = await _load_model_for_admin(db, model_id)
    return _model_out(fresh, fx_rate)


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_model(
    model_id: uuid.UUID,
    request: Request,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    row = await db.get(AiModel, model_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/models/{model_id}/upstreams", response_model=AiModelOut, status_code=status.HTTP_201_CREATED)
async def create_model_upstream(
    model_id: uuid.UUID,
    request: Request,
    body: AiUpstreamCreate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiModelOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    model = await _load_model_for_admin(db, model_id)
    await _require_usable_provider(db, body.provider_id)
    if body.provider_id == model.provider_id and body.upstream_id == model.upstream_id:
        raise HTTPException(status_code=409, detail="target is the primary upstream")
    if any(u.provider_id == body.provider_id and u.upstream_id == body.upstream_id for u in model.upstreams):
        raise HTTPException(status_code=409, detail="upstream target already exists")
    if body.rank is not None and any(u.rank == body.rank for u in model.upstreams):
        raise HTTPException(status_code=409, detail="rank already in use")
    if len(model.upstreams) + 1 >= settings.ai_upstream_max_candidates:
        raise HTTPException(status_code=422, detail="candidate limit reached")
    rank = body.rank if body.rank is not None else max((u.rank for u in model.upstreams), default=0) + 1
    db.add(
        AiModelUpstream(
            model_id=model.id,
            provider_id=body.provider_id,
            upstream_id=body.upstream_id,
            hpp_usd_per_1m_in=body.hpp_usd_per_1m_in,
            hpp_usd_per_1m_out=body.hpp_usd_per_1m_out,
            max_tokens_cap=body.max_tokens_cap,
            rank=rank,
            enabled=True,
        )
    )
    await db.commit()
    fx_rate, _, _ = await ai_fx.effective_rate(db)
    fresh = await _load_model_for_admin(db, model_id)
    return _model_out(fresh, fx_rate)


@router.patch("/models/{model_id}/upstreams/{upstream_id}", response_model=AiModelOut)
async def update_model_upstream(
    model_id: uuid.UUID,
    upstream_id: uuid.UUID,
    request: Request,
    body: AiUpstreamUpdate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiModelOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    model = await _load_model_for_admin(db, model_id)
    row = next((u for u in model.upstreams if u.id == upstream_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    data = body.model_dump(exclude_unset=True)
    new_provider_id: uuid.UUID | None = data.get("provider_id")
    new_upstream_id: str | None = data.get("upstream_id")
    target_provider_id: uuid.UUID = new_provider_id if new_provider_id is not None else row.provider_id
    target_upstream_id: str = new_upstream_id if new_upstream_id is not None else row.upstream_id
    if new_provider_id is not None and new_provider_id != row.provider_id:
        await _require_usable_provider(db, new_provider_id)
    if (target_provider_id, target_upstream_id) != (row.provider_id, row.upstream_id):
        if (target_provider_id, target_upstream_id) == (model.provider_id, model.upstream_id):
            raise HTTPException(status_code=409, detail="target is the primary upstream")
        if any(
            u.id != row.id and u.provider_id == target_provider_id and u.upstream_id == target_upstream_id
            for u in model.upstreams
        ):
            raise HTTPException(status_code=409, detail="upstream target already exists")
    target_rank: int | None = None
    if "rank" in data and data["rank"] is not None and data["rank"] != row.rank:
        target_rank = data["rank"]
    if new_provider_id is not None:
        row.provider_id = new_provider_id
    if new_upstream_id is not None:
        row.upstream_id = new_upstream_id
    if "hpp_usd_per_1m_in" in data:
        row.hpp_usd_per_1m_in = data["hpp_usd_per_1m_in"]
    if "hpp_usd_per_1m_out" in data:
        row.hpp_usd_per_1m_out = data["hpp_usd_per_1m_out"]
    if "max_tokens_cap" in data:
        row.max_tokens_cap = data["max_tokens_cap"]
    if data.get("enabled") is not None:
        row.enabled = data["enabled"]
    await db.flush()
    if target_rank is not None:
        await _move_upstream(db, model_id, row.id, target_rank)
    await db.commit()
    fx_rate, _, _ = await ai_fx.effective_rate(db)
    fresh = await _load_model_for_admin(db, model_id)
    return _model_out(fresh, fx_rate)


@router.delete("/models/{model_id}/upstreams/{upstream_id}", response_model=AiModelOut)
async def delete_model_upstream(
    model_id: uuid.UUID,
    upstream_id: uuid.UUID,
    request: Request,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiModelOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    model = await _load_model_for_admin(db, model_id)
    row = next((u for u in model.upstreams if u.id == upstream_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(row)
    await db.flush()
    await _resequence(db, model_id)
    await db.commit()
    fx_rate, _, _ = await ai_fx.effective_rate(db)
    fresh = await _load_model_for_admin(db, model_id)
    return _model_out(fresh, fx_rate)


@router.post("/wallets/{org_id}/topup", response_model=AiWalletOut)
async def topup_wallet(
    org_id: uuid.UUID,
    request: Request,
    body: AiWalletTopup,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiWalletOut | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    wallet = await wallet_topup(db, org_id, body.amount_idr)
    return AiWalletOut.model_validate(wallet)


@router.get("/usage", response_model=AiAdminUsageList)
async def admin_list_usage(
    request: Request,
    org_id: uuid.UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AiAdminUsageList | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    q = select(AiUsageEvent)
    cq = select(func.count(AiUsageEvent.id))
    if org_id is not None:
        q = q.where(AiUsageEvent.organization_id == org_id)
        cq = cq.where(AiUsageEvent.organization_id == org_id)
    total = (await db.execute(cq)).scalar() or 0
    rows = list(
        (
            await db.execute(
                q.order_by(AiUsageEvent.created_at.desc(), AiUsageEvent.id.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return AiAdminUsageList(items=[AiAdminUsageOut.model_validate(r) for r in rows], total=total)


@router.post("/chat", response_model=None)
async def admin_chat(
    request: Request,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse | Response:
    _disabled()
    limited = await _limit(request)
    if limited:
        return limited
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON body required") from None
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="JSON object required")
    return await admin_trial_chat(db, admin_id=admin.id, body=body)
