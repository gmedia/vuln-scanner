from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.user import User
from app.schemas.billing import (
    CancelSubscriptionRequest,
    PaymentAttemptItem,
    RecordPaymentRequest,
    RecordPaymentResponse,
    SubscriptionDetail,
    SubscriptionItem,
    SubscriptionListResponse,
)
from app.services.auth import get_current_admin
from app.services.billing import BillingService

router = APIRouter(prefix="/admin", tags=["admin-billing"])
admin_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin_billing",
)


@router.get("/subscriptions", response_model=SubscriptionListResponse)
async def list_subscriptions(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> SubscriptionListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    items, total = await BillingService(db).list_admin(
        status_filter=status,
        page=page,
        page_size=page_size,
    )
    return SubscriptionListResponse(items=items, total=total)


@router.get("/subscriptions/{org_id}", response_model=SubscriptionDetail)
async def get_subscription(
    org_id: UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionDetail | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    return await BillingService(db).detail(org_id)


@router.post("/subscriptions/{org_id}/record-payment", response_model=RecordPaymentResponse)
async def record_payment(
    org_id: UUID,
    body: RecordPaymentRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> RecordPaymentResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    inv, sub, attempt = await BillingService(db).record_manual_payment(
        org_id,
        body.invoice_id,
        current_admin,
        method=body.method,
        reference=body.reference,
    )
    return RecordPaymentResponse(
        subscription=(
            SubscriptionItem.model_validate(sub) if sub is not None else None
        ),
        attempt=PaymentAttemptItem.model_validate(attempt),
        invoice_id=inv.id,
        invoice_status=inv.status,
    )


@router.post("/subscriptions/{org_id}/cancel", response_model=SubscriptionItem)
async def cancel_subscription(
    org_id: UUID,
    body: CancelSubscriptionRequest,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    sub = await BillingService(db).cancel(
        org_id,
        at_period_end=body.at_period_end,
        note=body.note,
    )
    return SubscriptionItem.model_validate(sub)
