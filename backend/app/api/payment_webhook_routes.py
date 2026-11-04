from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.schemas.billing import PaymentEventIn, PaymentEventResult
from app.services.billing import BillingService
from app.services.payments.base import (
    InvalidWebhookSignature,
    MalformedWebhook,
    PaymentConfigError,
    ProviderUnavailable,
)
from app.services.payments.registry import build_provider

router = APIRouter(prefix="/webhooks", tags=["payment-webhooks"])

MAX_WEBHOOK_BYTES = 65536
SUPPORTED_PROVIDERS = frozenset({"manual", "midtrans"})


@router.post("/payments/{provider}", response_model=PaymentEventResult)
async def payment_webhook(
    provider: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> PaymentEventResult:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown payment provider")

    raw = await request.body()
    if len(raw) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Webhook body is too large")

    if provider == "manual":
        return await _apply_manual(raw, request, db)
    return await _apply_gateway(provider, raw, request, db)


async def _apply_manual(
    raw: bytes,
    request: Request,
    db: AsyncSession,
) -> PaymentEventResult:
    expected = (settings.payment_webhook_secret or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Payment webhook is not configured")
    supplied = request.headers.get("X-Payment-Webhook-Secret")
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")
    try:
        body = PaymentEventIn.model_validate_json(raw)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail="Malformed webhook body") from exc
    return await BillingService(db).apply_event("manual", body)


async def _apply_gateway(
    provider: str,
    raw: bytes,
    request: Request,
    db: AsyncSession,
) -> PaymentEventResult:
    try:
        adapter = build_provider(provider)
        event = await adapter.parse_webhook(raw, dict(request.headers))
        return await BillingService(db).apply_gateway_event(provider, event)
    except InvalidWebhookSignature as exc:
        raise HTTPException(status_code=401, detail="Invalid webhook signature") from exc
    except MalformedWebhook as exc:
        raise HTTPException(status_code=400, detail="Malformed webhook body") from exc
    except PaymentConfigError as exc:
        raise HTTPException(status_code=503, detail="Payment gateway is not configured") from exc
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=404, detail="Unknown payment provider") from exc
