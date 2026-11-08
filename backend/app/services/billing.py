from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import CursorResult, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai_gateway import AiTopupOrder
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
from app.services import ai_wallet
from app.services.invoice import InvoiceService
from app.services.payments.base import NormalizedEvent, PaymentConfigError, ProviderUnavailable, StatusResult
from app.services.payments.registry import build_provider
from app.services.sku_tier import SkuTierService, record_tier_assignment

logger = logging.getLogger(__name__)

# Monotonic attempt rank (spec PY11). ``canceled`` is not a persisted attempt
# status (the model allows pending/succeeded/failed/expired/refunded), so a
# canceled gateway event is stored as ``expired`` with the provider status kept.
_ATTEMPT_RANK: dict[str, int] = {
    "pending": 0,
    "failed": 1,
    "expired": 1,
    "canceled": 1,
    "succeeded": 2,
    "refunded": 3,
}

_KIND_RANK: dict[str, int] = {
    "pending": 0,
    "failed": 1,
    "expired": 1,
    "canceled": 1,
    "succeeded": 2,
    "refunded": 3,
    "partially_refunded": 3,
    "chargeback": 3,
}

# Never persist customer PII or the webhook signature (spec PY16 / §4).
_REDACTED_KEYS = (
    "order_id",
    "transaction_id",
    "transaction_status",
    "status_code",
    "fraud_status",
    "gross_amount",
    "payment_type",
    "currency",
)

# Terminal webhook rows older than this are deleted by ``payment.prune_events``.
# A code constant, not an env var: it changes rarely and the env-inventory gate
# should not grow for a value ops will not tune per deploy.
PAYMENT_EVENT_RETENTION_DAYS = 365

# Kept at any age: ``received`` may still be in flight and ``failed`` is an ops
# signal (see docs/payments-ops.md). Every other recorded status is terminal.
_PAYMENT_EVENT_KEPT_STATUSES = ("received", "failed")

def _redacted_payload(raw: Mapping[str, object]) -> dict[str, object]:
    return {key: raw[key] for key in _REDACTED_KEYS if key in raw}


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
        actor_id: UUID | None = None,
    ) -> Subscription:
        org = await self.db.get(Organization, inv.organization_id)
        if org is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        if inv.product == "scan":
            tier = await SkuTierService(self.db).get(inv.sku)
            if not tier.active and org.sku != inv.sku:
                raise HTTPException(status_code=409, detail="Tier is retired")
            if actor_id is not None and org.sku != inv.sku:
                record_tier_assignment(
                    self.db,
                    organization_id=org.id,
                    sku_code=inv.sku,
                    previous=org.sku,
                    actor_id=actor_id,
                    source=(
                        "subscription_request"
                        if inv.subscription_request_id is not None
                        else "invoice_payment"
                    ),
                )
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
        inv = await InvoiceService(self.db).mark_paid(invoice_id, reference, actor_id=actor.id)
        sub: Subscription | None = await self.get_subscription(inv.organization_id)
        if inv.product == "scan":
            sub = await self.activate_from_invoice(
                inv,
                provider="manual",
                provider_ref=reference,
                actor_id=actor.id,
            )
        attempt = PaymentAttempt(
            organization_id=inv.organization_id,
            subscription_id=sub.id if sub is not None else None,
            invoice_id=inv.id,
            provider="manual",
            provider_ref=reference,
            created_by_user_id=actor.id,
            amount_idr=inv.total_idr,
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
                amount_idr=inv.total_idr,
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

    async def apply_gateway_event(self, provider: str, event: NormalizedEvent) -> PaymentEventResult:
        """Apply one normalized gateway event exactly once.

        Dedupe is the ``payment_events (provider, event_id)`` unique key. Every
        guard (amount, monotonic rank, invoice state) resolves to a recorded
        event status; only a transient failure commits a ``failed`` event and
        re-raises so the provider retries.
        """
        existing = (
            await self.db.execute(
                select(PaymentEvent).where(
                    PaymentEvent.provider == provider,
                    PaymentEvent.event_id == event.event_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None and existing.status != "failed":
            return PaymentEventResult(status="duplicate", event_id=event.event_id)

        if existing is None:
            record = PaymentEvent(
                provider=provider,
                event_id=event.event_id,
                event_type=event.kind,
                payload=_redacted_payload(event.raw),
                status="received",
            )
            self.db.add(record)
            try:
                await self.db.flush()
            except IntegrityError:
                await self.db.rollback()
                return PaymentEventResult(status="duplicate", event_id=event.event_id)
        else:
            record = existing
            record.status = "received"
            record.error = None
            record.processed_at = None

        try:
            outcome = await self._apply_gateway_event(record, provider, event)
        except Exception as exc:  # noqa: BLE001 - the webhook must record the failure
            await self.db.rollback()
            failed = (
                await self.db.execute(
                    select(PaymentEvent).where(
                        PaymentEvent.provider == provider,
                        PaymentEvent.event_id == event.event_id,
                    )
                )
            ).scalar_one_or_none()
            if failed is None:
                failed = PaymentEvent(
                    provider=provider,
                    event_id=event.event_id,
                    event_type=event.kind,
                    payload=_redacted_payload(event.raw),
                    status="failed",
                )
                self.db.add(failed)
            failed.status = "failed"
            failed.error = str(exc)[:500]
            failed.processed_at = _now()
            await self.db.commit()
            raise

        record.status = outcome
        record.processed_at = _now()
        await self.db.commit()
        return PaymentEventResult(status=outcome, event_id=event.event_id)

    async def prune_payment_events(
        self, *, retention_days: int = PAYMENT_EVENT_RETENTION_DAYS
    ) -> int:
        """Delete terminal ``payment_events`` rows older than ``retention_days``.

        Deliberate trade-off: ``received`` rows may still be in flight (a
        provider retry, or a webhook the worker is applying right now) and
        ``failed`` rows are an ops signal for signature/amount/unknown-attempt
        problems, so both are kept regardless of age. Everything else
        (``processed``, ``ignored``) is terminal and is deleted once it falls
        outside the window.
        """
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)
        predicate = (
            PaymentEvent.received_at < cutoff,
            PaymentEvent.status.notin_(_PAYMENT_EVENT_KEPT_STATUSES),
        )
        # Count first: some drivers report -1 for a DELETE rowcount, and after
        # the delete the matching rows no longer exist to be counted.
        matching = int(
            (
                await self.db.execute(
                    select(func.count()).select_from(PaymentEvent).where(*predicate)
                )
            ).scalar_one()
        )
        result = cast(
            CursorResult[Any],
            await self.db.execute(delete(PaymentEvent).where(*predicate)),
        )
        rowcount = result.rowcount
        deleted = matching if rowcount is None or rowcount < 0 else int(rowcount)
        await self.db.commit()
        return deleted

    async def _find_gateway_attempt(self, provider: str, event: NormalizedEvent) -> PaymentAttempt | None:
        order_id = (event.provider_order_id or "").strip()
        if not order_id:
            return None
        attempt = (
            await self.db.execute(
                select(PaymentAttempt)
                .where(
                    PaymentAttempt.provider == provider,
                    PaymentAttempt.provider_order_id == order_id,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if attempt is not None:
            return attempt
        return (
            await self.db.execute(
                select(PaymentAttempt)
                .where(
                    PaymentAttempt.provider == provider,
                    PaymentAttempt.provider_ref == order_id,
                )
                .order_by(PaymentAttempt.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    def _fail_attempt(self, attempt: PaymentAttempt, code: str, message: str | None = None) -> None:
        attempt.status = "failed"
        attempt.failed_at = _now()
        attempt.failure_code = code[:64]
        attempt.failure_message = (message or code)[:255]
        attempt.updated_at = _now()

    async def _verify_provider_status(self, provider: str, attempt: PaymentAttempt) -> str | None:
        """Confirm a ``succeeded`` webhook against the provider.

        Fails closed: a non-success provider status, a missing transaction, a
        transient error, or any exception returns ``None`` so the caller records
        a failed event instead of activating on unverified money. Reconciliation
        can settle the attempt later once the provider is reachable.

        A provider without a usable ``fetch_status`` (for example the manual
        path) has nothing to confirm, so it is treated as verified.
        """
        try:
            adapter = build_provider(provider)
        except (ProviderUnavailable, PaymentConfigError):
            return "succeeded"

        fetch_status = getattr(adapter, "fetch_status", None)
        if not callable(fetch_status):
            return "succeeded"

        try:
            result: StatusResult = await fetch_status(attempt)
        except Exception:  # noqa: BLE001 - verification must never raise into the webhook
            logger.warning(
                "Provider status verification raised: provider=%s attempt=%s",
                provider,
                attempt.id,
            )
            return None

        if result.error is not None:
            logger.warning(
                "Provider status unavailable: provider=%s attempt=%s error=%s",
                provider,
                attempt.id,
                result.error,
            )
            return None
        if not result.found or result.event is None:
            # Midtrans 404 means there is no transaction we can confirm.
            return None
        return result.event.kind

    async def _apply_gateway_event(
        self,
        record: PaymentEvent,
        provider: str,
        event: NormalizedEvent,
    ) -> str:
        if event.kind == "ignored":
            return "ignored"

        attempt = await self._find_gateway_attempt(provider, event)
        if attempt is None:
            record.error = "unknown attempt"
            return "failed"
        if attempt.payable_kind == "topup":
            return await self._apply_gateway_topup(record, attempt, provider, event)
        if attempt.invoice_id is None:
            record.error = "attempt has no invoice"
            return "failed"
        inv = await self.db.get(OrgInvoice, attempt.invoice_id)
        if inv is None:
            record.error = "unknown invoice"
            return "failed"

        if event.amount_idr != inv.total_idr:
            attempt.status = "failed"
            attempt.failed_at = _now()
            attempt.failure_code = "amount_mismatch"
            attempt.failure_message = "provider amount does not match the invoice"
            attempt.updated_at = _now()
            return "failed"

        if _KIND_RANK.get(event.kind, 0) < _ATTEMPT_RANK.get(attempt.status, 0):
            return "ignored"

        if event.kind == "succeeded":
            if settings.midtrans_verify_status and attempt.provider_order_id:
                verified = await self._verify_provider_status(provider, attempt)
                if verified is not None and verified != "succeeded":
                    self._fail_attempt(
                        attempt,
                        "provider_status_mismatch",
                        f"provider reports {verified}",
                    )
                    record.error = f"provider status is {verified}, not settled"
                    return "failed"
                if verified is None:
                    self._fail_attempt(
                        attempt,
                        "provider_status_unavailable",
                        "could not confirm with provider",
                    )
                    record.error = "provider status unavailable"
                    return "failed"
            return await self._apply_gateway_succeeded(attempt, inv, provider, event)
        if event.kind == "pending":
            attempt.provider_status = "pending"
            attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
            attempt.method = event.method or attempt.method
            attempt.updated_at = _now()
            return "processed"
        if event.kind in ("failed", "expired", "canceled"):
            attempt.status = "expired" if event.kind == "canceled" else event.kind
            attempt.failed_at = _now()
            attempt.failure_code = (event.failure_code or attempt.failure_code or "")[:64] or None
            attempt.failure_message = (event.failure_message or attempt.failure_message or "")[:255] or None
            attempt.provider_status = event.kind
            attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
            attempt.updated_at = _now()
            if self._is_current_period(inv):
                sub = await self.get_subscription(inv.organization_id)
                if sub is not None and sub.status == "active":
                    self._transition(sub, "past_due")
            return "processed"
        if event.kind in ("refunded", "partially_refunded", "chargeback"):
            # Only a settled payment can be refunded. A refund/chargeback that
            # arrives while the attempt is still pending (provider correction,
            # replay, or a sibling transaction) must not move the attempt to the
            # terminal ``refunded`` rank: the monotonic guard would then drop the
            # real settlement and strand a paid invoice. Leave the attempt alone
            # so a later settlement still activates the subscription.
            if attempt.status != "succeeded":
                record.error = f"refund for a non-settled attempt ({attempt.status})"[:500]
                logger.warning(
                    "Ignoring %s for non-settled payment: provider=%s attempt=%s status=%s amount_idr=%s",
                    event.kind,
                    provider,
                    attempt.id,
                    attempt.status,
                    event.refunded_amount_idr,
                )
                return "ignored"

            paid = int(attempt.amount_idr or 0)
            refunded: int | None = event.refunded_amount_idr
            if event.kind in ("refunded", "chargeback") and not refunded:
                # A full refund/chargeback notification may omit refund_amount;
                # the whole payment is the amount that left the business.
                refunded = paid
            if refunded is None or refunded <= 0 or refunded > paid:
                record.error = f"invalid refund amount {refunded} for paid {paid}"[:500]
                return "failed"
            if event.kind == "partially_refunded" and refunded >= paid:
                record.error = f"partial refund {refunded} covers the full payment {paid}"[:500]
                return "failed"

            attempt.status = "refunded"
            attempt.refunded_amount_idr = refunded
            attempt.provider_status = event.kind
            attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
            attempt.updated_at = _now()
            logger.warning(
                "Payment %s recorded: provider=%s attempt=%s amount_idr=%s",
                event.kind,
                provider,
                attempt.id,
                refunded,
            )
            # Spec PY14: a refund/chargeback never revokes access automatically.
            # Operators decide manually; the invoice and subscription stay as-is.
            return "processed"

        record.error = f"unsupported event kind {event.kind}"
        return "failed"

    async def _lock_topup_order(self, order_id: UUID | None) -> AiTopupOrder | None:
        if order_id is None:
            return None
        stmt = (
            select(AiTopupOrder)
            .where(AiTopupOrder.id == order_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def _apply_gateway_topup(
        self,
        record: PaymentEvent,
        attempt: PaymentAttempt,
        provider: str,
        event: NormalizedEvent,
    ) -> str:
        """Settle a ``payable_kind='topup'`` gateway attempt.

        The order row lock plus the ``kind='topup'`` ledger unique index make
        the credit exactly-once. ``succeeded`` is authoritative even when the
        local order expired or was canceled (TU6); only an already-paid or
        refunded order refuses the credit.
        """
        order = await self._lock_topup_order(attempt.topup_order_id)
        if order is None:
            record.error = "unknown top-up order"
            return "failed"

        if event.amount_idr != order.amount_idr:
            self._fail_attempt(
                attempt,
                "amount_mismatch",
                "provider amount does not match the top-up order",
            )
            record.error = "provider amount does not match the top-up order"
            return "failed"

        if _KIND_RANK.get(event.kind, 0) < _ATTEMPT_RANK.get(attempt.status, 0):
            return "ignored"

        if event.kind == "succeeded":
            if settings.midtrans_verify_status and attempt.provider_order_id:
                verified = await self._verify_provider_status(provider, attempt)
                if verified is not None and verified != "succeeded":
                    self._fail_attempt(
                        attempt,
                        "provider_status_mismatch",
                        f"provider reports {verified}",
                    )
                    record.error = f"provider status is {verified}, not settled"
                    return "failed"
                if verified is None:
                    self._fail_attempt(
                        attempt,
                        "provider_status_unavailable",
                        "could not confirm with provider",
                    )
                    record.error = "provider status unavailable"
                    return "failed"
            return await self._apply_gateway_topup_succeeded(record, order, attempt, event)

        if event.kind == "pending":
            attempt.provider_status = "pending"
            attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
            attempt.method = event.method or attempt.method
            attempt.updated_at = _now()
            return "processed"

        if event.kind in ("failed", "expired", "canceled"):
            if event.kind == "failed":
                self._fail_attempt(
                    attempt,
                    event.failure_code or "provider_failed",
                    event.failure_message,
                )
            else:
                attempt.status = "expired"
                attempt.failed_at = _now()
                attempt.failure_code = (event.failure_code or attempt.failure_code or "")[:64] or None
                attempt.failure_message = (event.failure_message or attempt.failure_message or "")[:255] or None
                attempt.updated_at = _now()
            attempt.provider_status = event.kind
            attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
            if event.kind in ("expired", "canceled") and order.status == "pending_payment":
                order.status = "expired" if event.kind == "expired" else "canceled"
                order.updated_at = _now()
            return "processed"

        if event.kind in ("refunded", "partially_refunded", "chargeback"):
            return await self._apply_gateway_topup_refund(record, order, attempt, event)

        record.error = f"unsupported event kind {event.kind}"
        return "failed"

    async def _apply_gateway_topup_succeeded(
        self,
        record: PaymentEvent,
        order: AiTopupOrder,
        attempt: PaymentAttempt,
        event: NormalizedEvent,
    ) -> str:
        if order.status in ("refunded", "refund_review"):
            record.error = f"top-up order is already {order.status}"
            return "failed"

        if order.status == "paid":
            # Already settled (same order, different event id): never credit twice.
            return self._mark_topup_duplicate(attempt, event)

        now = _now()
        try:
            async with self.db.begin_nested():
                await ai_wallet.credit(
                    self.db,
                    organization_id=order.organization_id,
                    amount_idr=order.credit_idr,
                    kind="topup",
                    topup_order_id=order.id,
                    note=order.reference_code,
                    commit=False,
                )
                order.status = "paid"
                order.paid_at = now
                attempt.status = "succeeded"
                attempt.succeeded_at = now
                attempt.failed_at = None
                attempt.failure_code = None
                attempt.failure_message = None
                attempt.method = event.method or attempt.method
                attempt.provider_status = "succeeded"
                attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
                attempt.fee_idr = event.fee_idr or 0
                attempt.updated_at = now
        except IntegrityError:
            # Another transaction won the ledger race. The savepoint is already
            # rolled back, so the outer event transaction is still usable.
            await self.db.refresh(attempt)
            current = await self._lock_topup_order(order.id)
            if current is not None and current.status == "paid":
                return self._mark_topup_duplicate(attempt, event)
            raise
        return "processed"

    def _mark_topup_duplicate(self, attempt: PaymentAttempt, event: NormalizedEvent) -> str:
        if attempt.status != "succeeded":
            attempt.status = "succeeded"
            attempt.succeeded_at = attempt.succeeded_at or _now()
        attempt.provider_status = "duplicate"
        attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
        attempt.updated_at = _now()
        return "processed"

    async def _apply_gateway_topup_refund(
        self,
        record: PaymentEvent,
        order: AiTopupOrder,
        attempt: PaymentAttempt,
        event: NormalizedEvent,
    ) -> str:
        # Mirror the invoice rule: only a settled payment can be refunded.
        if attempt.status != "succeeded":
            record.error = f"refund for a non-settled attempt ({attempt.status})"[:500]
            logger.warning(
                "Ignoring %s for non-settled top-up: attempt=%s status=%s",
                event.kind,
                attempt.id,
                attempt.status,
            )
            return "ignored"

        paid = int(attempt.amount_idr or 0)
        refunded: int | None = event.refunded_amount_idr
        if event.kind in ("refunded", "chargeback") and not refunded:
            refunded = paid
        if refunded is None or refunded <= 0 or refunded > paid:
            record.error = f"invalid refund amount {refunded} for paid {paid}"[:500]
            return "failed"
        if event.kind == "partially_refunded" and refunded >= paid:
            record.error = f"partial refund {refunded} covers the full payment {paid}"[:500]
            return "failed"

        attempt.status = "refunded"
        attempt.refunded_amount_idr = refunded
        attempt.provider_status = event.kind
        attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
        attempt.updated_at = _now()
        # PY14: no automatic clawback. Ops resolve the wallet manually.
        if order.status not in ("refunded", "refund_review"):
            order.status = "refund_review"
            order.updated_at = _now()
        logger.warning(
            "Top-up %s recorded: attempt=%s amount_idr=%s",
            event.kind,
            attempt.id,
            refunded,
        )
        return "processed"

    async def _apply_gateway_succeeded(
        self,
        attempt: PaymentAttempt,
        inv: OrgInvoice,
        provider: str,
        event: NormalizedEvent,
    ) -> str:
        if inv.status == "paid":
            if attempt.status != "succeeded":
                attempt.status = "succeeded"
                attempt.succeeded_at = attempt.succeeded_at or _now()
            attempt.provider_status = "duplicate"
            attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
            attempt.updated_at = _now()
            return "processed"
        if inv.status == "void":
            self._fail_attempt(attempt, "invoice_void", "invoice was voided")
            return "failed"
        if inv.status not in ("draft", "sent"):
            self._fail_attempt(attempt, "invoice_not_payable")
            return "failed"

        inv = await InvoiceService(self.db)._mark_paid(inv.id, event.provider_order_id)
        if inv.product == "scan":
            sub = await self.activate_from_invoice(
                inv,
                provider=provider,
                provider_ref=event.provider_order_id,
            )
            attempt.subscription_id = sub.id
        attempt.status = "succeeded"
        attempt.succeeded_at = _now()
        attempt.failed_at = None
        attempt.failure_code = None
        attempt.failure_message = None
        attempt.method = event.method or attempt.method
        attempt.provider_status = "succeeded"
        attempt.provider_payment_id = event.provider_payment_id or attempt.provider_payment_id
        attempt.fee_idr = event.fee_idr or 0
        attempt.updated_at = _now()
        return "processed"

    @staticmethod
    def _is_current_period(inv: OrgInvoice) -> bool:
        if inv.product != "scan" or inv.status != "sent":
            return False
        start = _as_utc(inv.period_start)
        end = _as_utc(inv.period_end)
        now = _now()
        return start is not None and end is not None and start <= now <= end

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
