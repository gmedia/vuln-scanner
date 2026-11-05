"""Admin CRUD for promo codes plus the authoritative validate endpoint.

Codes are platform-admin-only. Creating one never touches ``users.credits`` or
any wallet; a code is a discount definition and the invoice is the contract.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.billing import OrgBillingProfile
from app.models.invoice import SkuCatalog
from app.models.organization import Organization
from app.models.user import User
from app.schemas.promo import (
    PromoCodeCreate,
    PromoCodeHistoryItem,
    PromoCodeHistoryList,
    PromoCodeItem,
    PromoCodeListResponse,
    PromoCodeUpdate,
    PromoRedemptionItem,
    PromoRedemptionList,
    PromoValidateRequest,
    PromoValidateResponse,
)
from app.services.auth import get_current_admin
from app.services.invoice_math import price_breakdown
from app.services.promo import PromoService

router = APIRouter(prefix="/admin", tags=["admin-promos"])
admin_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin_promos",
)

@router.get("/promo-codes", response_model=PromoCodeListResponse)
async def list_promo_codes(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
) -> PromoCodeListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    rows, total = await PromoService(db).list(
        page=page, page_size=page_size, status_filter=status_filter, q=q
    )
    return PromoCodeListResponse(
        items=[
            PromoCodeItem.model_validate(row).model_copy(
                update={"redemption_count": count}
            )
            for row, count in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )

@router.post(
    "/promo-codes/validate",
    response_model=PromoValidateResponse,
)
async def validate_promo_code(
    body: PromoValidateRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PromoValidateResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    org = await db.get(Organization, body.organization_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    list_idr = await db.scalar(
        select(SkuCatalog.list_idr).where(
            SkuCatalog.product == body.product,
            SkuCatalog.sku == body.sku,
            SkuCatalog.invoicable.is_(True),
        )
    )
    if list_idr is None:
        raise HTTPException(status_code=400, detail="SKU is not invoicable")
    profile = await db.get(OrgBillingProfile, body.organization_id)
    quote = await PromoService(db).validate(
        body.code,
        product=body.product,
        sku=body.sku,
        cycle=body.cycle,
        base_list_idr=int(list_idr),
        org_id=body.organization_id,
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

@router.get("/promo-codes/{promo_id}", response_model=PromoCodeItem)
async def get_promo_code(
    promo_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PromoCodeItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    service = PromoService(db)
    promo = await service.get(promo_id)
    count = await service.redemption_count(promo.id)
    return PromoCodeItem.model_validate(promo).model_copy(
        update={"redemption_count": count}
    )

@router.post(
    "/promo-codes",
    response_model=PromoCodeItem,
    status_code=status.HTTP_201_CREATED,
)
async def create_promo_code(
    body: PromoCodeCreate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PromoCodeItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    promo = await PromoService(db).create(body, current_admin)
    return PromoCodeItem.model_validate(promo)

@router.patch("/promo-codes/{promo_id}", response_model=PromoCodeItem)
async def update_promo_code(
    promo_id: uuid.UUID,
    body: PromoCodeUpdate,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PromoCodeItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    promo = await PromoService(db).update(promo_id, body, current_admin)
    return PromoCodeItem.model_validate(promo)

@router.post("/promo-codes/{promo_id}/deactivate", response_model=PromoCodeItem)
async def deactivate_promo_code(
    promo_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PromoCodeItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    promo = await PromoService(db).deactivate(promo_id, current_admin)
    return PromoCodeItem.model_validate(promo)

@router.post("/promo-codes/{promo_id}/reactivate", response_model=PromoCodeItem)
async def reactivate_promo_code(
    promo_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PromoCodeItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    promo = await PromoService(db).reactivate(promo_id, current_admin)
    return PromoCodeItem.model_validate(promo)

@router.delete(
    "/promo-codes/{promo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_promo_code(
    promo_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )
    await PromoService(db).delete(promo_id, current_admin)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get(
    "/promo-codes/{promo_id}/redemptions",
    response_model=PromoRedemptionList,
)
async def list_promo_redemptions(
    promo_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PromoRedemptionList | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    rows, total = await PromoService(db).redemptions(
        promo_id, page=page, page_size=page_size
    )
    return PromoRedemptionList(
        items=[
            PromoRedemptionItem(
                id=redemption.id,
                promo_code_id=redemption.promo_code_id,
                organization_id=redemption.organization_id,
                organization_name=org_name,
                invoice_id=redemption.invoice_id,
                invoice_number=invoice_number,
                subscription_request_id=redemption.subscription_request_id,
                code_snapshot=redemption.code_snapshot,
                discount_idr=redemption.discount_idr,
                status=redemption.status,
                created_at=redemption.created_at,
                released_at=redemption.released_at,
            )
            for redemption, org_name, invoice_number in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )

@router.get("/promo-codes/{promo_id}/history", response_model=PromoCodeHistoryList)
async def list_promo_code_history(
    promo_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> PromoCodeHistoryList | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    rows, total = await PromoService(db).history(
        promo_id, page=page, page_size=page_size
    )
    return PromoCodeHistoryList(
        items=[
            PromoCodeHistoryItem(
                id=row.id,
                promo_code_id=row.promo_code_id,
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
