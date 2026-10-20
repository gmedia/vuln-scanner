from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.schemas.billing import PaymentEventIn, PaymentEventResult
from app.services.billing import BillingService

router = APIRouter(prefix="/webhooks", tags=["payment-webhooks"])

SUPPORTED_PROVIDERS = frozenset({"manual"})


@router.post("/payments/{provider}", response_model=PaymentEventResult)
async def payment_webhook(
    provider: str,
    body: PaymentEventIn,
    x_payment_webhook_secret: str | None = Header(
        default=None, alias="X-Payment-Webhook-Secret"
    ),
    db: AsyncSession = Depends(get_db),
) -> PaymentEventResult:
    expected = (settings.payment_webhook_secret or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Payment webhook is not configured")
    if not x_payment_webhook_secret or not secrets.compare_digest(
        x_payment_webhook_secret, expected
    ):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown payment provider")
    return await BillingService(db).apply_event(provider, body)
