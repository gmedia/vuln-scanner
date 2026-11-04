from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.user import User
from app.schemas.billing import PaymentAttemptItem
from app.schemas.invoice import InvoiceItem
from app.schemas.payment import (
    CheckoutRequestIn,
    CheckoutResponse,
    ProviderListResponse,
)
from app.services.auth import get_current_admin, get_current_user
from app.services.invoice import InvoiceService, to_item
from app.services.organization import require_membership
from app.services.payments.service import PaymentService

router = APIRouter(tags=["payments"])

checkout_limiter = RateLimiter(
    max_requests=20,
    window_seconds=60,
    prefix="ratelimit:payments_checkout",
    bypass_e2e=False,
)
cancel_limiter = RateLimiter(
    max_requests=20,
    window_seconds=60,
    prefix="ratelimit:payments_cancel",
    bypass_e2e=False,
)


@router.get("/payments/providers", response_model=ProviderListResponse)
async def list_payment_providers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProviderListResponse:
    del current_user
    return ProviderListResponse(items=PaymentService(db).providers())


@router.post(
    "/orgs/{org_id}/invoices/{invoice_id}/checkout",
    response_model=CheckoutResponse,
)
async def create_checkout(
    org_id: UUID,
    invoice_id: UUID,
    body: CheckoutRequestIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CheckoutResponse | Response:
    limit_response = await checkout_limiter(request)
    if limit_response:
        return limit_response
    await require_membership(db, org_id, current_user.id, min_role="admin")
    inv = await InvoiceService(db).get(invoice_id)
    if inv.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Invoice not found")
    base = settings.frontend_url.rstrip("/")
    attempt = await PaymentService(db).create_checkout(
        inv,
        current_user,
        body.provider,
        return_url=f"{base}/pay/{inv.id}?status=finish",
        cancel_url=f"{base}/pay/{inv.id}?status=unfinish",
    )
    return CheckoutResponse(
        attempt_id=attempt.id,
        provider=attempt.provider,
        redirect_url=attempt.checkout_url,
        expires_at=attempt.expires_at,
        amount_idr=attempt.amount_idr,
        status=attempt.status,
    )


@router.post(
    "/admin/payments/attempts/{attempt_id}/cancel",
    response_model=PaymentAttemptItem,
)
async def cancel_payment_attempt(
    attempt_id: UUID,
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PaymentAttemptItem | Response:
    limit_response = await cancel_limiter(request)
    if limit_response:
        return limit_response
    attempt = await PaymentService(db).get_attempt(attempt_id)
    attempt = await PaymentService(db).cancel_attempt(attempt, current_admin)
    return PaymentAttemptItem.model_validate(attempt)


@router.get("/invoices/{invoice_id}", response_model=InvoiceItem)
async def get_invoice(
    invoice_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> InvoiceItem:
    inv = await InvoiceService(db).get(invoice_id)
    await require_membership(db, inv.organization_id, current_user.id, min_role="admin")
    status, can_pay = await PaymentService(db).invoice_payment_state(inv)
    item = InvoiceItem.model_validate(await to_item(inv, org_name=None, include_bank=inv.status == "sent", db=db))
    return item.model_copy(update={"payment_status": status, "can_pay": can_pay})
