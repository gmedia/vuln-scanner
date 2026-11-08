"""Customer AI top-up routes (S2).

All customer routes return 404 while ``AI_GATEWAY_ENABLED`` is off. They are
deliberately **not** gated by ``require_billing_write``: a ``past_due`` org must
still be able to prepay its AI wallet.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.ai_gateway import AiTopupOrder
from app.models.user import User
from app.schemas.ai_topup import (
    AiTopupBankOut,
    AiTopupCheckoutIn,
    AiTopupCheckoutOut,
    AiTopupOrderCreate,
    AiTopupOrderList,
    AiTopupOrderOut,
    AiTopupPackList,
    AiTopupPackOut,
)
from app.services import ai_topup as topup_service
from app.services.auth import get_active_org_id, get_current_user
from app.services.invoice import bank_copy
from app.services.organization import require_membership
from app.services.payments.service import PaymentService

router = APIRouter(prefix="/ai/topup", tags=["ai-topup"])

create_limiter = RateLimiter(
    max_requests=10,
    window_seconds=60,
    prefix="ratelimit:ai_topup_create",
    bypass_e2e=False,
)
proof_limiter = RateLimiter(
    max_requests=10,
    window_seconds=60,
    prefix="ratelimit:ai_topup_proof",
    bypass_e2e=False,
)
checkout_limiter = RateLimiter(
    max_requests=20,
    window_seconds=60,
    prefix="ratelimit:ai_topup_checkout",
    bypass_e2e=False,
)


def _disabled() -> None:
    if not settings.ai_gateway_enabled:
        raise HTTPException(status_code=404, detail="Not found")


def _active_org(request: Request) -> uuid.UUID:
    org_id = get_active_org_id(request)
    if org_id is None:
        raise HTTPException(status_code=400, detail="No active organization")
    return org_id


async def _viewer_org(request: Request, user: User, db: AsyncSession) -> uuid.UUID:
    org_id = _active_org(request)
    await require_membership(db, org_id, user.id, min_role="viewer")
    return org_id


async def _admin_org(request: Request, user: User, db: AsyncSession) -> uuid.UUID:
    org_id = _active_org(request)
    await require_membership(db, org_id, user.id, min_role="admin")
    return org_id


def _customer_out(order: AiTopupOrder, bank: dict[str, str | None] | None) -> AiTopupOrderOut:
    bank_block: AiTopupBankOut | None = None
    if bank is not None and order.status == "pending_payment" and order.payment_method == "manual_transfer":
        bank_block = AiTopupBankOut(**bank)
    return AiTopupOrderOut.from_order(order, bank=bank_block)


@router.get("/packs", response_model=AiTopupPackList)
async def list_packs(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiTopupPackList:
    _disabled()
    await _viewer_org(request, current_user, db)
    rows = await topup_service.list_packs(db, active_only=True)
    return AiTopupPackList(items=[AiTopupPackOut.model_validate(row) for row in rows], total=len(rows))


@router.post("/orders", response_model=AiTopupOrderOut, status_code=201)
async def create_order(
    body: AiTopupOrderCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiTopupOrderOut | Response:
    _disabled()
    limited = await create_limiter(request)
    if limited:
        return limited
    org_id = await _admin_org(request, current_user, db)
    order, bank = await topup_service.create_order(
        db,
        org_id=org_id,
        actor=current_user,
        pack_id=body.pack_id,
        method=body.method,
        now=datetime.now(UTC),
    )
    return _customer_out(order, bank)


@router.get("/orders", response_model=AiTopupOrderList)
async def list_orders(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiTopupOrderList:
    _disabled()
    org_id = await _viewer_org(request, current_user, db)
    rows, total = await topup_service.list_orders(db, org_id, page, limit)
    return AiTopupOrderList(
        items=[_customer_out(row, None) for row in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/orders/{order_id}", response_model=AiTopupOrderOut)
async def get_order(
    order_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiTopupOrderOut:
    _disabled()
    org_id = await _viewer_org(request, current_user, db)
    order = await topup_service.get_order(db, org_id, order_id)
    bank = None
    if order.status == "pending_payment" and order.payment_method == "manual_transfer":
        bank = bank_copy(include=True)
    return _customer_out(order, bank)


@router.post("/orders/{order_id}/proof", response_model=AiTopupOrderOut)
async def upload_proof(
    order_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiTopupOrderOut | Response:
    _disabled()
    limited = await proof_limiter(request)
    if limited:
        return limited
    org_id = await _admin_org(request, current_user, db)
    order = await topup_service.submit_proof(
        db,
        order_id=order_id,
        org_id=org_id,
        actor=current_user,
        upload=file,
    )
    return _customer_out(order, None)


@router.post("/orders/{order_id}/checkout", response_model=AiTopupCheckoutOut)
async def checkout_order(
    order_id: uuid.UUID,
    body: AiTopupCheckoutIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiTopupCheckoutOut | Response:
    _disabled()
    limited = await checkout_limiter(request)
    if limited:
        return limited
    org_id = await _admin_org(request, current_user, db)
    order = await topup_service.get_order(db, org_id, order_id)
    if order.status != "pending_payment" or order.payment_method != "midtrans":
        raise HTTPException(status_code=409, detail="Order is not payable through the gateway")
    base = settings.frontend_url.rstrip("/")
    attempt = await PaymentService(db).create_topup_checkout(
        order,
        current_user,
        body.provider,
        return_url=f"{base}/ai/topup/{order.id}",
        cancel_url=f"{base}/ai/topup/{order.id}",
    )
    if not attempt.checkout_url:
        raise HTTPException(status_code=502, detail="Payment provider did not return a redirect URL")
    return AiTopupCheckoutOut(redirect_url=attempt.checkout_url, attempt_id=attempt.id)


@router.post("/orders/{order_id}/cancel", response_model=AiTopupOrderOut)
async def cancel_order(
    order_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AiTopupOrderOut:
    _disabled()
    org_id = await _admin_org(request, current_user, db)
    order = await topup_service.cancel(db, order_id=order_id, org_id=org_id, actor=current_user)
    return _customer_out(order, None)
