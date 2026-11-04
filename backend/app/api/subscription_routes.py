from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.billing import OrgBillingProfile
from app.models.invoice import SkuCatalog
from app.models.organization import Organization
from app.models.user import User
from app.schemas.billing import SubscriptionCancelRequest, SubscriptionItem
from app.schemas.promo import (
    CustomerPromoValidateRequest,
    PromoValidateResponse,
)
from app.schemas.subscription import (
    SubscriptionOverviewResponse,
    SubscriptionRequestCreate,
    SubscriptionRequestItem,
)
from app.services.auth import get_current_user
from app.services.billing import BillingService
from app.services.invoice_math import price_breakdown
from app.services.organization import require_membership
from app.services.promo import PromoService
from app.services.subscription import SubscriptionService

router = APIRouter(tags=["subscription"])
promo_limiter = RateLimiter(
    max_requests=settings.promo_validate_limit,
    window_seconds=settings.promo_validate_window,
    prefix="ratelimit:promo_validate",
    bypass_e2e=False,
)


async def _org_for(db: AsyncSession, org_id: UUID) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("/orgs/{org_id}/subscription", response_model=SubscriptionOverviewResponse)
async def get_subscription(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionOverviewResponse:
    membership = await require_membership(db, org_id, current_user.id, min_role="viewer")
    org = await _org_for(db, org_id)
    return await SubscriptionService(db).overview(org, membership.role)


@router.post(
    "/orgs/{org_id}/promo-codes/validate",
    response_model=PromoValidateResponse,
)
async def validate_org_promo_code(
    org_id: UUID,
    body: CustomerPromoValidateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromoValidateResponse | Response:
    limit_response = await promo_limiter(request)
    if limit_response:
        return limit_response
    await require_membership(db, org_id, current_user.id, min_role="admin")
    await _org_for(db, org_id)
    list_idr = await db.scalar(
        select(SkuCatalog.list_idr).where(
            SkuCatalog.product == "scan",
            SkuCatalog.sku == body.target_sku,
            SkuCatalog.invoicable.is_(True),
        )
    )
    if list_idr is None:
        raise HTTPException(status_code=400, detail="SKU is not invoicable")
    profile = await db.get(OrgBillingProfile, org_id)
    quote = await PromoService(db).validate(
        body.code,
        product="scan",
        sku=body.target_sku,
        cycle=body.cycle,
        base_list_idr=int(list_idr),
        org_id=org_id,
        now=datetime.now(UTC),
    )
    prices = price_breakdown(
        int(list_idr),
        annual=False,
        pkp=profile is not None and profile.pkp_status == "pkp",
        discount_idr=quote.discount_idr,
    )
    return PromoValidateResponse(
        valid=True,
        description=quote.promo.description,
        discount_idr=quote.discount_idr,
        total_idr=prices["total"],
    )

@router.post(
    "/orgs/{org_id}/subscription/requests",
    response_model=SubscriptionRequestItem,
    status_code=201,
)
async def create_subscription_request(
    org_id: UUID,
    body: SubscriptionRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionRequestItem:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    org = await _org_for(db, org_id)
    return await SubscriptionService(db).create_request(
        org,
        current_user,
        target_sku=body.target_sku,
        cycle=body.cycle,
        note=body.note,
        promo_code=body.promo_code,
    )


@router.delete("/orgs/{org_id}/subscription/requests/{request_id}", status_code=204)
async def cancel_subscription_request(
    org_id: UUID,
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    await SubscriptionService(db).cancel_request(org_id, request_id)


@router.post("/orgs/{org_id}/subscription/cancel", response_model=SubscriptionItem)
async def cancel_subscription(
    org_id: UUID,
    body: SubscriptionCancelRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionItem:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    sub = await BillingService(db).request_cancellation(org_id, body.note)
    return SubscriptionItem.model_validate(sub)


@router.post("/orgs/{org_id}/subscription/resume", response_model=SubscriptionItem)
async def resume_subscription(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionItem:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    sub = await BillingService(db).resume(org_id)
    return SubscriptionItem.model_validate(sub)
