"""Authenticated read-only tier catalogue.

Consumers (subscription page, workspace settings, host/WAF panels) fetch this
once and derive labels and feature gates from it instead of hardcoding codes.
The caller's current tier is included even when it has been retired so a
grandfathered org can still render its own plan; every other retired tier stays
hidden.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.organization import Organization
from app.models.sku_tier import SkuTier
from app.models.user import User
from app.schemas.sku_tier import SkuTierItem
from app.services.auth import get_active_org_id, get_current_user
from app.services.sku_tier import SkuTierService

router = APIRouter(tags=["sku-tiers"])

@router.get("/sku-tiers", response_model=list[SkuTierItem])
async def list_sku_tiers(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SkuTierItem]:
    service = SkuTierService(db)
    visible: dict[str, SkuTier] = {tier.code: tier for tier in await service.list()}

    org_id = get_active_org_id(request)
    if org_id is not None:
        org = await db.get(Organization, org_id)
        if org is not None:
            current = await service.get(org.sku)
            visible.setdefault(current.code, current)

    return [SkuTierItem.from_model(tier) for tier in sorted(visible.values(), key=lambda item: item.rank)]
