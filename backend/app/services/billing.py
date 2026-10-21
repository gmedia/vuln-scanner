from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import PaymentAttempt, PaymentEvent, Subscription
from app.models.invoice import OrgInvoice
from app.models.organization import Organization
from app.models.user import User
from app.schemas.billing import (
    PaymentAttemptItem,
    PaymentEventIn,
    PaymentEventResult,
    SubscriptionDetail,
    SubscriptionItem,
)
from app.services.invoice import InvoiceService


class BillingTransitionError(ValueError):
    """Raised when a subscription status transition is not allowed."""


_ALLOWED: dict[str, frozenset[str]] = {
    "incomplete": frozenset({"active", "canceled"}),
    "active": frozenset({"past_due", "canceled"}),
    "past_due": frozenset({"active", "canceled"}),
    "canceled": frozenset({"active"}),
}


def _now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return _as_utc(parsed)


def _cycle_for(start: datetime | None, end: datetime | None) -> str:
    start_utc = _as_utc(start)
    end_utc = _as_utc(end)
    if start_utc is None or end_utc is None:
        return "monthly"
    return "annual" if (end_utc - start_utc).days > 40 else "monthly"


def _item(sub: Subscription, *, organization_name: str | None = None) -> SubscriptionItem:
    return SubscriptionItem.model_validate(sub).model_copy(
        update={"organization_name": organization_name}
    )


class BillingService:
    """Provider-agnostic subscription/payment core.

    No gateway is called here. ``record_invoice_payment`` covers the manual
    bank-transfer path; ``apply_event`` consumes a canonical webhook payload so
    a Midtrans/Xendit adapter can be added later without changing this service.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_subscription(self, org_id: UUID) -> Subscription | None:
        result = await self.db.execute(
            select(Subscription).where(Subscription.organization_id == org_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create_subscription(self, org: Organization) -> Subscription:
        existing = await self.get_subscription(org.id)
        if existing is not None:
            return existing
        sub = Subscription(
            organization_id=org.id,
            sku=org.sku or "basic",
            status="incomplete",
            cycle="monthly",
            provider="manual",
        )
        self.db.add(sub)
        await self.db.flush()
        return sub

    def _transition(self, sub: Subscription, new_status: str) -> None:
        if sub.status == new_status:
            return
        allowed = _ALLOWED.get(sub.status, frozenset())
        if new_status not in allowed:
            raise BillingTransitionError(
                f"subscription cannot move from {sub.status} to {new_status}"
            )
        sub.status = new_status
        sub.updated_at = _now()

    async def activate_from_invoice(
        self,
        inv: OrgInvoice,
        *,
        provider: str = "manual",
        provider_ref: str | None = None,
    ) -> Subscription:
        org = await self.db.get(Organization, inv.organization_id)
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        if inv.product == "scan":
            org.sku = inv.sku
            org.updated_at = _now()

        sub = await self.get_or_create_subscription(org)
        self._transition(sub, "active")
        sub.sku = inv.sku
        sub.cycle = _cycle_for(inv.period_start, inv.period_end)
        sub.current_period_start = _as_utc(inv.period_start)
        sub.current_period_end = _as_utc(inv.period_end)
        sub.cancel_at_period_end = False
        sub.canceled_at = None
        sub.ended_at = None
        if provider:
            sub.provider = provider
        if provider_ref:
            sub.provider_subscription_id = provider_ref
        sub.updated_at = _now()
        await self.db.flush()
        return sub

    async def record_invoice_payment(
        self,
        invoice_id: UUID,
        actor: User,
        *,
        method: str = "bank_transfer",
        reference: str | None = None,
    ) -> tuple[OrgInvoice, Subscription | None, PaymentAttempt]:
        inv = await InvoiceService(self.db).mark_paid(invoice_id, reference)
        sub: Subscription | None = await self.get_subscription(inv.organization_id)
        if inv.product == "scan":
            sub = await self.activate_from_invoice(
                inv,
                provider="manual",
                provider_ref=reference,
            )
        attempt = PaymentAttempt(
            organization_id=inv.organization_id,
            subscription_id=sub.id if sub is not None else None,
            invoice_id=inv.id,
            provider="manual",
            provider_ref=reference,
            created_by_user_id=actor.id,
            amount_idr=inv.amount_idr,
            currency="IDR",
            status="succeeded",
            method=method,
            succeeded_at=_now(),
        )
        self.db.add(attempt)
        await self.db.commit()
        await self.db.refresh(attempt)
        if sub is not None:
            await self.db.refresh(sub)
        await self.db.refresh(inv)
        return inv, sub, attempt

    async def record_manual_payment(
        self,
        org_id: UUID,
        invoice_id: UUID,
        actor: User,
        *,
        method: str = "bank_transfer",
        reference: str | None = None,
    ) -> tuple[OrgInvoice, Subscription | None, PaymentAttempt]:
        inv = await self.db.get(OrgInvoice, invoice_id)
        if inv is None or inv.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return await self.record_invoice_payment(
            invoice_id,
            actor,
            method=method,
            reference=reference,
        )

    async def _find_attempt(self, provider: str, ref: str | None) -> PaymentAttempt | None:
        if not ref:
            return None
        result = await self.db.execute(
            select(PaymentAttempt)
            .where(PaymentAttempt.provider == provider, PaymentAttempt.provider_ref == ref)
            .order_by(PaymentAttempt.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _apply_succeeded(self, provider: str, data: dict[str, Any]) -> bool:
        ref = str(data.get("payment_ref") or "") or None
        attempt = await self._find_attempt(provider, ref)
        invoice_id = data.get("invoice_id")
        inv: OrgInvoice | None = None
        if isinstance(invoice_id, str) and invoice_id:
            try:
                inv = await self.db.get(OrgInvoice, UUID(invoice_id))
            except ValueError:
                inv = None
        if attempt is None:
            if inv is None:
                return False
            attempt = PaymentAttempt(
                organization_id=inv.organization_id,
                invoice_id=inv.id,
                provider=provider,
                provider_ref=ref,
                amount_idr=inv.amount_idr,
                status="pending",
                method=str(data.get("method") or "") or None,
            )
            self.db.add(attempt)
            await self.db.flush()

        attempt.status = "succeeded"
        attempt.succeeded_at = _now()
        attempt.failed_at = None
        attempt.failure_code = None
        attempt.failure_message = None
        attempt.next_retry_at = None
        attempt.updated_at = _now()

        if inv is not None and inv.status in ("draft", "sent"):
            inv = await InvoiceService(self.db).mark_paid(inv.id, ref)
        if inv is None and attempt.invoice_id is not None:
            inv = await self.db.get(OrgInvoice, attempt.invoice_id)
        if inv is None or inv.product != "scan":
            return True

        sub = await self.activate_from_invoice(
            inv,
            provider=provider,
            provider_ref=ref,
        )
        attempt.subscription_id = sub.id
        return True

    async def _apply_failed(self, provider: str, data: dict[str, Any], *, expired: bool) -> bool:
        ref = str(data.get("payment_ref") or "") or None
        attempt = await self._find_attempt(provider, ref)
        if attempt is None:
            return False
        attempt.status = "expired" if expired else "failed"
        attempt.failed_at = _now()
        attempt.failure_code = str(data.get("failure_code") or "")[:64] or None
        attempt.failure_message = str(data.get("failure_message") or "")[:255] or None
        attempt.next_retry_at = _parse_dt(data.get("next_retry_at"))
        attempt.updated_at = _now()
        if attempt.invoice_id is not None:
            inv = await self.db.get(OrgInvoice, attempt.invoice_id)
            if inv is not None and inv.product != "scan":
                return True
        sub = await self.get_subscription(attempt.organization_id)
        if sub is not None and sub.status == "active":
            self._transition(sub, "past_due")
        return True

    async def _apply_canceled(self, provider: str, data: dict[str, Any]) -> bool:
        org_id = data.get("organization_id")
        sub: Subscription | None = None
        if isinstance(org_id, str) and org_id:
            try:
                sub = await self.get_subscription(UUID(org_id))
            except ValueError:
                sub = None
        if sub is None:
            ref = str(data.get("subscription_ref") or "") or None
            if ref:
                result = await self.db.execute(
                    select(Subscription).where(
                        Subscription.provider == provider,
                        Subscription.provider_subscription_id == ref,
                    )
                )
                sub = result.scalar_one_or_none()
        if sub is None:
            return False
        self._transition(sub, "canceled")
        sub.canceled_at = _now()
        sub.ended_at = _now()
        sub.cancel_at_period_end = False
        return True

    async def _apply_renewed(self, provider: str, data: dict[str, Any]) -> bool:
        ref = str(data.get("subscription_ref") or "") or None
        sub: Subscription | None = None
        if ref:
            result = await self.db.execute(
                select(Subscription).where(
                    Subscription.provider == provider,
                    Subscription.provider_subscription_id == ref,
                )
            )
            sub = result.scalar_one_or_none()
        if sub is None:
            org_id = data.get("organization_id")
            if isinstance(org_id, str) and org_id:
                try:
                    sub = await self.get_subscription(UUID(org_id))
                except ValueError:
                    sub = None
        if sub is None:
            return False
        start = _parse_dt(data.get("period_start"))
        end = _parse_dt(data.get("period_end"))
        if start is not None:
            sub.current_period_start = start
        if end is not None:
            sub.current_period_end = end
        sub.cycle = _cycle_for(sub.current_period_start, sub.current_period_end)
        self._transition(sub, "active")
        sub.cancel_at_period_end = False
        sub.updated_at = _now()
        return True

    async def apply_event(self, provider: str, event: PaymentEventIn) -> PaymentEventResult:
        existing = (
            await self.db.execute(
                select(PaymentEvent).where(
                    PaymentEvent.provider == provider,
                    PaymentEvent.event_id == event.id,
                )
            )
        ).scalar_one_or_none()

        if existing is not None and existing.status != "failed":
            return PaymentEventResult(status="duplicate", event_id=event.id)

        if existing is None:
            record = PaymentEvent(
                provider=provider,
                event_id=event.id,
                event_type=event.type,
                payload=event.model_dump(),
                status="received",
            )
            self.db.add(record)
            try:
                await self.db.flush()
            except IntegrityError:
                await self.db.rollback()
                return PaymentEventResult(status="duplicate", event_id=event.id)
        else:
            record = existing
            record.status = "received"
            record.error = None
            record.processed_at = None

        data = event.data or {}
        handled = False
        try:
            if event.type == "payment.succeeded":
                handled = await self._apply_succeeded(provider, data)
            elif event.type in ("payment.failed", "payment.expired"):
                handled = await self._apply_failed(
                    provider, data, expired=event.type == "payment.expired"
                )
            elif event.type == "subscription.canceled":
                handled = await self._apply_canceled(provider, data)
            elif event.type == "subscription.renewed":
                handled = await self._apply_renewed(provider, data)
        except Exception as exc:  # noqa: BLE001 - webhook must record the failure
            record.status = "failed"
            record.error = str(exc)[:500]
            record.processed_at = _now()
            await self.db.commit()
            raise

        record.status = "processed" if handled else "ignored"
        record.processed_at = _now()
        await self.db.commit()
        return PaymentEventResult(
            status=record.status,
            event_id=event.id,
        )

    async def list_admin(
        self,
        *,
        status_filter: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[SubscriptionItem], int]:
        query = (
            select(Subscription, Organization.name)
            .join(Organization, Organization.id == Subscription.organization_id)
            .order_by(Subscription.updated_at.desc())
        )
        count_query = select(func.count()).select_from(Subscription)
        if status_filter:
            query = query.where(Subscription.status == status_filter)
            count_query = count_query.where(Subscription.status == status_filter)
        total = int((await self.db.execute(count_query)).scalar() or 0)
        query = query.offset((page - 1) * page_size).limit(page_size)
        rows = (await self.db.execute(query)).all()
        return [_item(sub, organization_name=str(name)) for sub, name in rows], total

    async def detail(self, org_id: UUID) -> SubscriptionDetail:
        sub = await self.get_subscription(org_id)
        if sub is None:
            raise HTTPException(status_code=404, detail="Subscription not found")
        org = await self.db.get(Organization, org_id)
        attempts = (
            await self.db.execute(
                select(PaymentAttempt)
                .where(PaymentAttempt.organization_id == org_id)
                .order_by(PaymentAttempt.created_at.desc())
                .limit(20)
            )
        ).scalars().all()
        item = _item(sub, organization_name=org.name if org is not None else None)
        return SubscriptionDetail(
            **item.model_dump(),
            attempts=[PaymentAttemptItem.model_validate(a) for a in attempts],
        )

    async def cancel(
        self,
        org_id: UUID,
        *,
        at_period_end: bool,
        note: str = "",
    ) -> Subscription:
        sub = await self.get_subscription(org_id)
        if sub is None:
            raise HTTPException(status_code=404, detail="Subscription not found")
        if sub.status == "canceled":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Subscription is already canceled",
            )
        if at_period_end:
            if sub.status == "incomplete":
                raise HTTPException(
                    status_code=409,
                    detail="An incomplete subscription has no period to finish",
                )
            sub.cancel_at_period_end = True
            sub.cancel_note = (note or "").strip()[:500]
        else:
            self._transition(sub, "canceled")
            sub.cancel_at_period_end = False
            sub.cancel_note = (note or "").strip()[:500]
            sub.canceled_at = _now()
            sub.ended_at = _now()
        sub.updated_at = _now()
        await self.db.commit()
        await self.db.refresh(sub)
        return sub


    async def request_cancellation(self, org_id: UUID, note: str = "") -> Subscription:
        """Customer-initiated cancel. Always at period end."""
        sub = await self.get_subscription(org_id)
        if sub is None:
            raise HTTPException(status_code=404, detail="Subscription not found")
        if sub.status == "canceled":
            raise HTTPException(status_code=409, detail="Subscription is already canceled")
        if sub.status == "incomplete" or sub.current_period_end is None:
            raise HTTPException(
                status_code=409,
                detail="There is no paid period to finish",
            )
        sub.cancel_at_period_end = True
        sub.cancel_note = (note or "").strip()[:500]
        sub.updated_at = _now()
        await self.db.commit()
        await self.db.refresh(sub)
        return sub

    async def resume(self, org_id: UUID) -> Subscription:
        sub = await self.get_subscription(org_id)
        if sub is None:
            raise HTTPException(status_code=404, detail="Subscription not found")
        if sub.status == "canceled":
            raise HTTPException(
                status_code=409,
                detail="This subscription has ended; renew to start a new period",
            )
        if not sub.cancel_at_period_end:
            raise HTTPException(status_code=409, detail="Cancellation is not scheduled")
        sub.cancel_at_period_end = False
        sub.cancel_note = ""
        sub.updated_at = _now()
        await self.db.commit()
        await self.db.refresh(sub)
        return sub
