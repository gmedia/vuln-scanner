from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.ai_gateway import PROVIDER_STATUSES, AiModel, AiProvider
from app.models.user import User
from app.schemas.ai_gateway import (
    AiModelCreate,
    AiModelList,
    AiModelOut,
    AiModelUpdate,
    AiProviderCreate,
    AiProviderList,
    AiProviderOut,
    AiProviderUpdate,
)
from app.services.ai_crypto import encrypt_credential
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
    stmt = select(AiModel)
    count_stmt = select(func.count(AiModel.id))
    if provider_id is not None:
        stmt = stmt.where(AiModel.provider_id == provider_id)
        count_stmt = count_stmt.where(AiModel.provider_id == provider_id)
    total = (await db.execute(count_stmt)).scalar() or 0
    rows = list((await db.execute(stmt.order_by(AiModel.public_id))).scalars().all())
    return AiModelList(items=[AiModelOut.model_validate(r) for r in rows], total=total)


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
    row = AiModel(
        provider_id=body.provider_id,
        public_id=body.public_id,
        upstream_id=body.upstream_id,
        hpp_usd_per_1k_in=body.hpp_usd_per_1k_in,
        hpp_usd_per_1k_out=body.hpp_usd_per_1k_out,
        price_idr_per_1k_in=body.price_idr_per_1k_in,
        price_idr_per_1k_out=body.price_idr_per_1k_out,
        max_ctx=body.max_ctx,
        max_tokens_cap=body.max_tokens_cap,
        enabled=body.enabled,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return AiModelOut.model_validate(row)


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
    row = await db.get(AiModel, model_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    data = body.model_dump(exclude_unset=True)
    if "public_id" in data:
        clash = (
            await db.execute(select(AiModel).where(AiModel.public_id == data["public_id"], AiModel.id != model_id))
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(status_code=409, detail="public_id already exists")
    for key, value in data.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return AiModelOut.model_validate(row)


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
