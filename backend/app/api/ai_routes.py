from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.ai_gateway import AiModel, AiUsageEvent
from app.models.user import User
from app.schemas.ai_gateway import (
    AiKeyCreate,
    AiKeyList,
    AiKeyOut,
    AiPublicModelList,
    AiPublicModelOut,
    AiUsageList,
    AiUsageOut,
    AiWalletOut,
)
from app.services.ai_keys import create_key, list_keys, revoke_key
from app.services.ai_wallet import get_or_create_wallet
from app.services.auth import get_active_org_id, get_current_user
from app.services.organization import require_membership

router = APIRouter(prefix="/ai", tags=["ai"])


def _disabled() -> None:
    if not settings.ai_gateway_enabled:
        raise HTTPException(status_code=404, detail="Not found")


async def _org(request: Request, user: User, db: AsyncSession) -> UUID:
    org_id = get_active_org_id(request)
    if org_id is None:
        raise HTTPException(status_code=400, detail="No active organization")
    await require_membership(db, org_id, user.id, min_role="viewer")
    return org_id


@router.get("/wallet", response_model=AiWalletOut)
async def get_wallet(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiWalletOut:
    _disabled()
    org_id = await _org(request, current_user, db)
    wallet = await get_or_create_wallet(db, org_id)
    await db.commit()
    return AiWalletOut.model_validate(wallet)


@router.get("/models", response_model=AiPublicModelList)
async def list_public_models(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiPublicModelList:
    _disabled()
    await _org(request, current_user, db)
    rows = list(
        (await db.execute(select(AiModel).where(AiModel.enabled.is_(True)).order_by(AiModel.public_id))).scalars().all()
    )
    items = [
        AiPublicModelOut(
            public_id=r.public_id,
            price_idr_per_1k_in=r.price_idr_per_1k_in,
            price_idr_per_1k_out=r.price_idr_per_1k_out,
            max_ctx=r.max_ctx,
            max_tokens_cap=r.max_tokens_cap,
        )
        for r in rows
    ]
    return AiPublicModelList(items=items, total=len(items))


@router.get("/usage", response_model=AiUsageList)
async def list_usage(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiUsageList:
    _disabled()
    org_id = await _org(request, current_user, db)
    total = (
        await db.execute(select(func.count(AiUsageEvent.id)).where(AiUsageEvent.organization_id == org_id))
    ).scalar() or 0
    rows = list(
        (
            await db.execute(
                select(AiUsageEvent)
                .where(AiUsageEvent.organization_id == org_id)
                .order_by(AiUsageEvent.created_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return AiUsageList(items=[AiUsageOut.model_validate(r) for r in rows], total=total)


def _key_out(row, plaintext: str | None = None) -> AiKeyOut:
    return AiKeyOut(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        is_active=row.is_active,
        rate_limit_rpm=row.rate_limit_rpm,
        created_at=row.created_at,
        last_used_at=row.last_used_at,
        key=plaintext,
    )


@router.get("/keys", response_model=AiKeyList)
async def get_keys(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiKeyList:
    _disabled()
    org_id = await _org(request, current_user, db)
    rows = await list_keys(db, org_id)
    return AiKeyList(items=[_key_out(r) for r in rows], total=len(rows))


@router.post("/keys", response_model=AiKeyOut, status_code=201)
async def post_key(
    body: AiKeyCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiKeyOut:
    _disabled()
    org_id = get_active_org_id(request)
    if org_id is None:
        raise HTTPException(status_code=400, detail="No active organization")
    await require_membership(db, org_id, current_user.id, min_role="member")
    row, plain = await create_key(db, organization_id=org_id, user_id=current_user.id, name=body.name)
    return _key_out(row, plain)


@router.delete("/keys/{key_id}", response_model=AiKeyOut)
async def delete_key(
    key_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiKeyOut:
    _disabled()
    org_id = get_active_org_id(request)
    if org_id is None:
        raise HTTPException(status_code=400, detail="No active organization")
    await require_membership(db, org_id, current_user.id, min_role="member")
    row = await revoke_key(db, organization_id=org_id, key_id=key_id)
    return _key_out(row)
