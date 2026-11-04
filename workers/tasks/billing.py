"""Subscription lifecycle and invoice reminders (beat).

``finalize_periods`` closes ``cancel_at_period_end`` subscriptions and marks
overdue subscriptions ``past_due`` from the **invoice due date**, not the
service period end. ``send_due_reminders`` sends one reminder per invoice per
stage, tracked in ``billing_reminders`` so an hourly sweep cannot duplicate mail.

Neither task revokes access or deletes data: access enforcement is a separate
product decision, and the invoice remains the collection path.
"""

import asyncio
import os
import sys
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from celery import shared_task
from loguru import logger
from sqlalchemy import CursorResult, func, select, text

from utils.database import get_sync_session

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))

from app.models.billing import BillingRecipient, BillingReminder, OrgBillingProfile  # noqa: E402
from app.models.invoice import OrgInvoice  # noqa: E402
from app.models.organization import Organization, OrganizationMembership  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.billing_reminders import (  # noqa: E402
    due_stage,
    first_contact_stage,
    stage_rank,
)
from app.services.email import send_billing_reminder_email  # noqa: E402

# Days after ``due_date`` before an active subscription becomes ``past_due``.
# Configurable so ops can widen the grace window without a deploy.
PAST_DUE_GRACE_DAYS = int(os.getenv("BILLING_PAST_DUE_GRACE_DAYS", "7"))
PAST_DUE_CANCEL_DAYS = int(os.getenv("BILLING_PAST_DUE_CANCEL_DAYS", "45"))
MAX_REMINDER_ATTEMPTS = 3

_CLOSE_CANCELED = text(
    """
    UPDATE subscriptions
    SET status = 'canceled',
        cancel_at_period_end = false,
        canceled_at = :now,
        ended_at = :now,
        updated_at = :now
    WHERE cancel_at_period_end = true
      AND current_period_end IS NOT NULL
      AND current_period_end <= :now
    RETURNING id
    """
)

_MARK_PAST_DUE = text(
    """
    WITH latest AS (
        SELECT DISTINCT ON (organization_id)
               organization_id, status, due_date
        FROM org_invoices
        WHERE product = 'scan'
          AND status <> 'void'
        ORDER BY organization_id, period_start DESC, created_at DESC
    )
    UPDATE subscriptions s
    SET status = 'past_due',
        updated_at = :now
    FROM latest l
    WHERE s.organization_id = l.organization_id
      AND s.status = 'active'
      AND l.status = 'sent'
      AND l.due_date IS NOT NULL
      AND l.due_date + make_interval(days => :grace_days) <= :now
    RETURNING s.id
    """
)


_TERMINAL_PAST_DUE = text(
    """
    WITH latest AS (
        SELECT DISTINCT ON (organization_id)
               organization_id, status, due_date
        FROM org_invoices
        WHERE product = 'scan'
          AND status <> 'void'
        ORDER BY organization_id, period_start DESC, created_at DESC
    )
    UPDATE subscriptions s
    SET status = 'canceled',
        cancel_at_period_end = false,
        canceled_at = :now,
        ended_at = :now,
        updated_at = :now
    FROM latest l
    WHERE s.organization_id = l.organization_id
      AND s.status = 'past_due'
      AND l.status = 'sent'
      AND l.due_date IS NOT NULL
      AND l.due_date + make_interval(days => :terminal_days) <= :now
    RETURNING s.id
    """
)


def _count_rows(session: Any, statement: Any, params: dict[str, Any]) -> int:
    result = cast(CursorResult[Any], session.execute(statement, params))
    return len(result.all())


@shared_task(bind=True, name="billing.finalize_periods", acks_late=True, max_retries=1)  # type: ignore
def finalize_periods(self: Any) -> dict[str, int]:
    now = datetime.now(UTC)
    session = get_sync_session()
    try:
        canceled = _count_rows(session, _CLOSE_CANCELED, {"now": now})
        past_due = _count_rows(
            session,
            _MARK_PAST_DUE,
            {"now": now, "grace_days": PAST_DUE_GRACE_DAYS},
        )
        terminal = _count_rows(
            session,
            _TERMINAL_PAST_DUE,
            {"now": now, "terminal_days": PAST_DUE_CANCEL_DAYS},
        )
        session.commit()
        if canceled or past_due or terminal:
            logger.info(
                "Billing finalize: canceled={canceled} past_due={past_due} terminal={terminal}",
                canceled=canceled,
                past_due=past_due,
                terminal=terminal,
            )
        return {
            "canceled_count": canceled,
            "past_due_count": past_due,
            "terminal_count": terminal,
        }
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _recipients(session: Any, organization_id: Any) -> list[tuple[str, str | None]]:
    profile = session.get(OrgBillingProfile, organization_id)
    billing_rows = session.execute(
        select(BillingRecipient.email)
        .where(
            BillingRecipient.organization_id == organization_id,
            BillingRecipient.kind == "billing",
            BillingRecipient.disabled_at.is_(None),
        )
        .order_by(BillingRecipient.is_primary.desc(), BillingRecipient.created_at)
    ).scalars().all()

    billing_emails: list[str] = []
    if profile is not None and profile.billing_email:
        billing_emails.append(profile.billing_email)
    billing_emails.extend(billing_rows)

    if billing_emails:
        seen_billing: set[str] = set()
        deduped: list[tuple[str, str | None]] = []
        for email in billing_emails:
            normalized = (email or "").strip().lower()
            if not normalized or normalized in seen_billing:
                continue
            seen_billing.add(normalized)
            deduped.append((normalized, None))
        return deduped

    rows = session.execute(
        select(User.email, User.locale)
        .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
        .where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.role.in_(("owner", "admin")),
            User.is_verified.is_(True),
        )
    ).all()
    seen: set[str] = set()
    recipients: list[tuple[str, str | None]] = []
    for email, locale in rows:
        if not email or email in seen:
            continue
        seen.add(email)
        recipients.append((email, locale))
    return recipients


async def _send_all(
    inv: OrgInvoice,
    organization_name: str,
    stage: str,
    recipients: list[tuple[str, str | None]],
) -> tuple[int, int, str]:
    sent = 0
    failed = 0
    last_error = ""
    for email, locale in recipients:
        try:
            ok = await send_billing_reminder_email(
                email,
                stage=stage,
                invoice_number=inv.number,
                organization_name=organization_name,
                amount_idr=inv.total_idr,
                due_date=inv.due_date,
                period_start=inv.period_start,
                period_end=inv.period_end,
                locale=locale,
            )
        except Exception as exc:  # noqa: BLE001 - one bad recipient must not stop the sweep
            ok = False
            last_error = str(exc)[:200]
        if ok:
            sent += 1
        else:
            failed += 1
    return sent, failed, last_error


def _record(
    session: Any,
    inv: OrgInvoice,
    *,
    stage: str,
    rank: int,
    sent: int,
    failed: int,
    error: str,
    existing: BillingReminder | None,
    now: datetime,
) -> None:
    if existing is None:
        existing = BillingReminder(
            invoice_id=inv.id,
            organization_id=inv.organization_id,
            stage=stage,
            stage_rank=rank,
            attempts=0,
            sent_count=0,
            failed_count=0,
        )
        session.add(existing)
    existing.attempts = (existing.attempts or 0) + 1
    existing.sent_count = (existing.sent_count or 0) + sent
    existing.failed_count = (existing.failed_count or 0) + failed
    existing.last_error = (error or "")[:500] or None
    existing.updated_at = now


@shared_task(bind=True, name="billing.send_reminders", acks_late=True, max_retries=1)  # type: ignore
def send_due_reminders(self: Any) -> dict[str, int]:
    now = datetime.now(UTC)
    session = get_sync_session()
    try:
        rows = cast(
            list[tuple[OrgInvoice, str]],
            session.execute(
                select(OrgInvoice, Organization.name)
                .join(Organization, Organization.id == OrgInvoice.organization_id)
                .where(
                    OrgInvoice.status == "sent",
                    OrgInvoice.paid_at.is_(None),
                    OrgInvoice.due_date.is_not(None),
                )
            ).all(),
        )

        sent_total = 0
        failed_total = 0
        skipped = 0

        for inv, organization_name in rows:
            existing_rows = cast(
                list[BillingReminder],
                session.execute(
                    select(BillingReminder).where(BillingReminder.invoice_id == inv.id)
                ).scalars().all(),
            )
            if existing_rows:
                stage = due_stage(inv.due_date, now)
            else:
                stage = first_contact_stage(inv.due_date, now, inv.sent_at)
            if stage is None:
                continue
            rank = stage_rank(stage)

            max_rank = max((row.stage_rank for row in existing_rows), default=0)
            existing = next((row for row in existing_rows if row.stage == stage), None)

            # Retry the same stage while it is still the current one. A
            # transient SMTP failure must not permanently suppress the notice.
            if existing is not None:
                if existing.sent_count > 0 or existing.attempts >= MAX_REMINDER_ATTEMPTS:
                    skipped += 1
                    continue
            elif rank <= max_rank:
                # A later stage was already handled; do not walk backwards.
                skipped += 1
                continue

            recipients = _recipients(session, inv.organization_id)
            if not recipients:
                _record(
                    session,
                    inv,
                    stage=stage,
                    rank=rank,
                    sent=0,
                    failed=0,
                    error="no recipients",
                    existing=existing,
                    now=now,
                )
                skipped += 1
                continue

            sent, failed, error = asyncio.run(
                _send_all(inv, organization_name, stage, recipients)
            )
            _record(
                session,
                inv,
                stage=stage,
                rank=rank,
                sent=sent,
                failed=failed,
                error=error,
                existing=existing,
                now=now,
            )
            sent_total += sent
            failed_total += failed

        session.commit()
        if sent_total or failed_total:
            logger.info(
                "Billing reminders: sent={sent} failed={failed} skipped={skipped}",
                sent=sent_total,
                failed=failed_total,
                skipped=skipped,
            )
        return {
            "sent_count": sent_total,
            "failed_count": failed_total,
            "skipped_count": skipped,
        }
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# Days before an annual period ends at which ops should see a renewal draft.
RENEWAL_DRAFT_LEAD_DAYS = int(os.getenv("BILLING_RENEWAL_DRAFT_LEAD_DAYS", "45"))


def _next_annual_start(current_end: datetime) -> datetime:
    """First day of the month after the current period ends."""
    end = current_end if current_end.tzinfo is not None else current_end.replace(tzinfo=UTC)
    end = end.astimezone(UTC)
    year = end.year + (1 if end.month == 12 else 0)
    month = (end.month % 12) + 1
    return datetime(year, month, 1, tzinfo=UTC)


def _next_invoice_number(session: Any, start: datetime) -> str:
    """Sync twin of ``app.services.invoice.next_invoice_number``."""
    prefix = f"SX-{start.year:04d}{start.month:02d}-"
    used = session.execute(
        select(func.count())
        .select_from(OrgInvoice)
        .where(OrgInvoice.number.startswith(prefix))
    ).scalar_one()
    return f"{prefix}{int(used) + 1:04d}"


@shared_task(bind=True, name="billing.draft_annual_renewals", acks_late=True, max_retries=1)  # type: ignore
def draft_annual_renewals(self: Any) -> dict[str, int]:
    """Create a DRAFT invoice for annual subscriptions nearing period end.

    Ops still reviews and sends it: this only prevents the failure mode where
    nobody issues the next annual invoice and the workspace lapses after 365
    days. Idempotent through the overlap guard, so a re-run creates nothing.
    """
    from app.models.billing import Subscription  # noqa: E402
    from app.models.invoice import SkuCatalog  # noqa: E402
    from app.services.invoice_math import period_bounds_utc, price_breakdown  # noqa: E402

    now = datetime.now(UTC)
    horizon = now + timedelta(days=RENEWAL_DRAFT_LEAD_DAYS)
    session = get_sync_session()
    created = 0
    skipped = 0
    try:
        rows = cast(
            list[tuple[Subscription, str]],
            session.execute(
                select(Subscription, Organization.name)
                .join(Organization, Organization.id == Subscription.organization_id)
                .where(
                    Subscription.cycle == "annual",
                    Subscription.status == "active",
                    Subscription.cancel_at_period_end.is_(False),
                    Subscription.current_period_end.is_not(None),
                    Subscription.current_period_end <= horizon,
                    Subscription.current_period_end > now,
                )
            ).all(),
        )

        for sub, org_name in rows:
            if sub.current_period_end is None:  # narrows the type for mypy
                continue
            next_start = _next_annual_start(sub.current_period_end)
            start, end = period_bounds_utc(next_start, "annual")

            catalog = session.execute(
                select(SkuCatalog).where(
                    SkuCatalog.product == "scan",
                    SkuCatalog.sku == sub.sku,
                    SkuCatalog.invoicable.is_(True),
                )
            ).scalar_one_or_none()
            if catalog is None:
                logger.warning(
                    "Annual renewal skipped: no invoicable Scan SKU for {org} sku={sku}",
                    org=org_name,
                    sku=sub.sku,
                )
                skipped += 1
                continue

            already = session.execute(
                select(OrgInvoice.id).where(
                    OrgInvoice.organization_id == sub.organization_id,
                    OrgInvoice.product == "scan",
                    OrgInvoice.status != "void",
                    OrgInvoice.period_start <= end,
                    OrgInvoice.period_end >= start,
                )
            ).scalar_one_or_none()
            if already is not None:
                skipped += 1
                continue

            profile = session.get(OrgBillingProfile, sub.organization_id)
            prices = price_breakdown(
                int(catalog.list_idr),
                annual=True,
                pkp=profile is not None and profile.pkp_status == "pkp",
            )
            term_days = profile.payment_terms_days if profile is not None else 0

            session.add(
                OrgInvoice(
                    id=uuid.uuid4(),
                    organization_id=sub.organization_id,
                    number=_next_invoice_number(session, start),
                    product="scan",
                    sku=sub.sku,
                    amount_idr=prices["amount"],
                    dpp_idr=prices["dpp"],
                    ppn_idr=prices["ppn"],
                    pph23_idr=prices["pph23"],
                    total_idr=prices["total"],
                    period_start=start,
                    period_end=end,
                    due_date=start + timedelta(days=max(0, term_days)),
                    status="draft",
                    notes=f"Annual renewal draft for {org_name}",
                )
            )
            created += 1

        session.commit()
        if created or skipped:
            logger.info(
                "Annual renewal drafts: created={created} skipped={skipped} lead_days={lead}",
                created=created,
                skipped=skipped,
                lead=RENEWAL_DRAFT_LEAD_DAYS,
            )
        return {"created_count": created, "skipped_count": skipped}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
