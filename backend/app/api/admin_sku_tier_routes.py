"""Admin CRUD for SKU tiers.

Tier rows are the source of truth for labels, ranks, feature gates and product
caps; creating/updating a non-sales-led tier also synchronises its four
``sku_catalog`` price rows. Deleting is only allowed for an unused tier — the
normal "retire this plan" action is deactivation, which keeps grandfathered
organizations working.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.invoice import SkuCatalog
from app.models.sku_tier import SkuTier
from app.models.user import User
from app.schemas.sku_tier import (
    SkuTierCreate,
    SkuTierHistoryItem,
    SkuTierHistoryList,
    SkuTierItem,
    SkuTierUpdate,
)
from app.services.auth import get_current_admin
from app.services.sku_tier import SkuTierService

router = APIRouter(prefix="/admin/sku-tiers", tags=["admin-sku-tiers"])
admin_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin_sku_tiers",
)


async def _serialize(db: AsyncSession, tier: SkuTier) -> SkuTierItem:
    service = SkuTierService(db)
    usage = await service.usage_counts(tier.code)
    has_catalog = int(
        await db.scalar(
            select(func.count()).select_from(SkuCatalog).where(SkuCatalog.sku == tier.code)
        )
        or 0
    ) > 0
    return SkuTierItem.from_model(tier).model_copy(
        update={"usage": usage, "has_catalog": has_catalog}
    )


@router.get("", response_model=list[SkuTierItem])
async def list_sku_tiers(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[SkuTierItem] | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    tiers = await SkuTierService(db).list(include_inactive=True)
    return [await _serialize(db, tier) for tier in tiers]


@router.get("/{code}/history", response_model=SkuTierHistoryList)
async def get_sku_tier_history(
    code: str,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SkuTierHistoryList | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    rows, total = await SkuTierService(db).history(code, page=page, page_size=page_size)
    return SkuTierHistoryList(
        items=[
            SkuTierHistoryItem(
                id=row.id,
                sku_code=row.sku_code,
                action=row.action,
                actor_email=email,
                changes=row.changes,
                created_at=row.created_at,
            )
            for row, email in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )

@router.post("", response_model=SkuTierItem, status_code=status.HTTP_201_CREATED)
async def create_sku_tier(
    body: SkuTierCreate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SkuTierItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    tier = await SkuTierService(db).create(body, current_admin)
    return await _serialize(db, tier)


@router.patch("/{code}", response_model=SkuTierItem)
async def update_sku_tier(
    code: str,
    body: SkuTierUpdate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SkuTierItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    tier = await SkuTierService(db).update(code, body, current_admin)
    return await _serialize(db, tier)


@router.post("/{code}/deactivate", response_model=SkuTierItem)
async def deactivate_sku_tier(
    code: str,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SkuTierItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    tier = await SkuTierService(db).deactivate(code, current_admin)
    return await _serialize(db, tier)


@router.post("/{code}/reactivate", response_model=SkuTierItem)
async def reactivate_sku_tier(
    code: str,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SkuTierItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    tier = await SkuTierService(db).reactivate(code, current_admin)
    return await _serialize(db, tier)


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_sku_tier(
    code: str,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        # 204 handlers cannot return a body, so mirror the HPP delete pattern.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )
    await SkuTierService(db).delete(code, current_admin)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
