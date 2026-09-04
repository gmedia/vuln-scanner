from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.ai_gateway import AiModel, AiUsageEvent
from app.models.user import User
from app.schemas.ai_gateway import (
    AiPublicModelList,
    AiPublicModelOut,
    AiUsageList,
    AiUsageOut,
    AiWalletOut,
)
from app.services.ai_wallet import get_or_create_wallet
from app.services.auth import get_active_org_id, get_current_user
from app.services.organization import require_membership

router = APIRouter(prefix="/ai", tags=["ai"])


def _disabled() -> None:
    if not settings.ai_gateway_enabled:
        raise HTTPException(status_code=404, detail="Not found")


async def _org(request: Request, user: User, db: AsyncSession):
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
