"""Gateway-facing payment service: checkout attempts and invoice state.

Kept separate from :class:`app.services.billing.BillingService` so the billing
core stays provider-agnostic while the provider registry and adapters live
behind one explicit seam.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.billing import OrgBillingProfile, PaymentAttempt
from app.models.invoice import OrgInvoice
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.payments.base import (
    CheckoutRequest,
    PaymentProviderError,
    ProviderUnavailable,
)
from app.services.payments.registry import build_provider, enabled_providers

_CHECKOUT_TTL = timedelta(hours=24)
_MAX_ORDER_ID = 50


def _now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class PaymentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def providers(self) -> list[dict[str, str]]:
        mode = "production" if settings.midtrans_is_production else "sandbox"
        return [
            {"name": provider.name, "label": provider.name.replace("_", " ").title(), "mode": mode}
            for provider in enabled_providers()
        ]

    async def get_attempt(self, attempt_id: uuid.UUID) -> PaymentAttempt:
        attempt = await self.db.get(PaymentAttempt, attempt_id)
        if attempt is None:
            raise HTTPException(status_code=404, detail="Payment attempt not found")
        return attempt

    async def blocking_attempt(self, invoice_id: uuid.UUID) -> PaymentAttempt | None:
        return (
            await self.db.execute(
                select(PaymentAttempt)
                .where(
                    PaymentAttempt.invoice_id == invoice_id,
                    PaymentAttempt.status == "pending",
                )
                .limit(1)
            )
        ).scalar_one_or_none()

    async def pending_attempts(self, invoice_id: uuid.UUID) -> list[PaymentAttempt]:
        rows = (
            (
                await self.db.execute(
                    select(PaymentAttempt).where(
                        PaymentAttempt.invoice_id == invoice_id,
                        PaymentAttempt.status == "pending",
                    )
                )
            )
            .scalars()
            .all()
        )
        return list(rows)

    async def invoice_payment_state(self, inv: OrgInvoice) -> tuple[str | None, bool]:
        latest = (
            await self.db.execute(
                select(PaymentAttempt)
                .where(PaymentAttempt.invoice_id == inv.id)
                .order_by(PaymentAttempt.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        status = latest.status if latest is not None else None
        pending = latest is not None and latest.status == "pending"
        can_pay = (
            bool(settings.payment_gateway_enabled)
            and bool(enabled_providers())
            and inv.status == "sent"
            and (inv.total_idr or 0) > 0
            and not pending
        )
        return status, can_pay

    async def _customer_email(self, inv: OrgInvoice, org: Organization) -> str:
        profile = await self.db.get(OrgBillingProfile, inv.organization_id)
        if profile is not None and (profile.billing_email or "").strip():
            return profile.billing_email.strip()
        owner = (
            await self.db.execute(
                select(User.email)
                .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
                .where(
                    OrganizationMembership.organization_id == inv.organization_id,
                    OrganizationMembership.role == "owner",
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if owner:
            return str(owner)
        if org.created_by_user_id is not None:
            creator = await self.db.get(User, org.created_by_user_id)
            if creator is not None and creator.email:
                return creator.email
        return ""

    async def _expire_if_stale(self, attempt: PaymentAttempt) -> bool:
        expires_at = _as_utc(attempt.expires_at)
        if expires_at is not None and expires_at <= _now():
            attempt.status = "expired"
            attempt.provider_status = "expired"
            attempt.updated_at = _now()
            await self.db.flush()
            return True
        return False

    async def create_checkout(
        self,
        inv: OrgInvoice,
        actor: User,
        provider_name: str,
        *,
        return_url: str,
        cancel_url: str,
    ) -> PaymentAttempt:
        if not settings.payment_gateway_enabled:
            raise HTTPException(status_code=503, detail="Payment gateway is disabled")
        try:
            provider = build_provider(provider_name)
        except ProviderUnavailable as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if inv.status != "sent":
            raise HTTPException(status_code=409, detail="Invoice is not payable")
        if (inv.total_idr or 0) <= 0:
            raise HTTPException(status_code=409, detail="Invoice total must be greater than zero")

        invoice_id = inv.id
        pending = await self.blocking_attempt(invoice_id)
        if pending is not None:
            if await self._expire_if_stale(pending):
                pending = None
            else:
                if pending.provider == provider.name and pending.checkout_url:
                    return pending
                raise HTTPException(
                    status_code=409,
                    detail=f"pending payment attempt {pending.id} already exists",
                )

        org = await self.db.get(Organization, inv.organization_id)
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")

        max_seq = (
            await self.db.execute(
                select(func.max(PaymentAttempt.attempt_seq)).where(PaymentAttempt.invoice_id == invoice_id)
            )
        ).scalar()
        seq = int(max_seq or 0) + 1
        order_id = f"{inv.number}-A{seq}"
        if len(order_id) > _MAX_ORDER_ID:
            raise HTTPException(status_code=500, detail="Generated provider order id is too long")

        attempt = PaymentAttempt(
            provider=provider.name,
            provider_order_id=order_id,
            invoice_id=invoice_id,
            organization_id=inv.organization_id,
            amount_idr=inv.total_idr,
            currency="IDR",
            status="pending",
            method=None,
            attempt_seq=seq,
            expires_at=_now() + _CHECKOUT_TTL,
            created_by_user_id=actor.id,
        )
        self.db.add(attempt)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            existing = await self.blocking_attempt(invoice_id)
            if existing is not None and existing.provider == provider.name and existing.checkout_url:
                return existing
            detail = (
                f"pending payment attempt {existing.id} already exists"
                if existing is not None
                else "Could not create a payment attempt"
            )
            raise HTTPException(status_code=409, detail=detail) from None

        request = CheckoutRequest(
            order_id=order_id,
            amount_idr=inv.total_idr,
            currency="IDR",
            invoice_number=inv.number,
            description=f"Sinexis {inv.product} {inv.sku}",
            customer_email=await self._customer_email(inv, org),
            customer_name=org.name,
            return_url=return_url,
            cancel_url=cancel_url,
            idempotency_key=str(attempt.id),
        )
        try:
            result = await provider.create_checkout(request)
        except (PaymentProviderError, ProviderUnavailable) as exc:
            attempt.status = "failed"
            attempt.failed_at = _now()
            error_code = getattr(exc, "code", None)
            attempt.failure_code = str(error_code) if error_code else type(exc).__name__
            attempt.failure_message = str(exc)[:255]
            attempt.updated_at = _now()
            await self.db.commit()
            if isinstance(exc, PaymentProviderError) and exc.code == 406:
                return await self._reuse_existing_order(provider_name, attempt)
            raise HTTPException(status_code=502, detail="Payment provider rejected the checkout") from exc

        attempt.checkout_url = result.redirect_url
        attempt.provider_token = result.provider_token
        attempt.provider_payment_id = result.provider_payment_id
        attempt.provider_status = "pending"
        if result.expires_at is not None:
            attempt.expires_at = result.expires_at
        attempt.updated_at = _now()
        await self.db.commit()
        await self.db.refresh(attempt)
        return attempt

    async def _reuse_existing_order(self, provider_name: str, attempt: PaymentAttempt) -> PaymentAttempt:
        provider = build_provider(provider_name)
        status = await provider.fetch_status(attempt)
        if status.found and status.event is not None:
            from app.services.billing import BillingService

            await BillingService(self.db).apply_gateway_event(provider_name, status.event)
            await self.db.refresh(attempt)
            if attempt.status == "pending" and attempt.checkout_url:
                return attempt
        raise HTTPException(status_code=409, detail="Payment order already exists at provider")

    async def cancel_attempt(self, attempt: PaymentAttempt, actor: User) -> PaymentAttempt:
        del actor
        if attempt.status != "pending":
            raise HTTPException(status_code=409, detail="Only pending payment attempts can be cancelled")
        try:
            provider = build_provider(attempt.provider)
        except ProviderUnavailable as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        try:
            cancelled = await provider.cancel(attempt)
        except (ProviderUnavailable, PaymentProviderError):
            cancelled = False
        # The attempt model has no ``canceled`` status; a provider-confirmed
        # cancel is recorded as expired locally with the provider truth kept.
        attempt.status = "expired"
        attempt.provider_status = "canceled" if cancelled else "expired"
        attempt.updated_at = _now()
        await self.db.commit()
        await self.db.refresh(attempt)
        return attempt
