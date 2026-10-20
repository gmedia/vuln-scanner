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
from datetime import UTC, datetime
from typing import Any, cast

from celery import shared_task
from loguru import logger
from sqlalchemy import CursorResult, select, text

from utils.database import get_sync_session

_BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
if _BACKEND not in sys.path:
    sys.path.insert(0, os.path.abspath(_BACKEND))

from app.models.billing import BillingReminder  # noqa: E402
from app.models.invoice import OrgInvoice  # noqa: E402
from app.models.organization import Organization, OrganizationMembership  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.billing_reminders import due_stage, stage_rank  # noqa: E402
from app.services.email import send_billing_reminder_email  # noqa: E402

# Days after ``due_date`` before an active subscription becomes ``past_due``.
# Configurable so ops can widen the grace window without a deploy.
PAST_DUE_GRACE_DAYS = int(os.getenv("BILLING_PAST_DUE_GRACE_DAYS", "7"))
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
        session.commit()
        if canceled or past_due:
            logger.info(
                "Billing finalize: canceled={canceled} past_due={past_due} grace_days={grace}",
                canceled=canceled,
                past_due=past_due,
                grace=PAST_DUE_GRACE_DAYS,
            )
        return {"canceled_count": canceled, "past_due_count": past_due}
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _recipients(session: Any, organization_id: Any) -> list[tuple[str, str | None]]:
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
                amount_idr=inv.amount_idr,
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
            stage = due_stage(inv.due_date, now)
            if stage is None:
                continue
            rank = stage_rank(stage)

            existing_rows = cast(
                list[BillingReminder],
                session.execute(
                    select(BillingReminder).where(BillingReminder.invoice_id == inv.id)
                ).scalars().all(),
            )
            max_rank = max((row.stage_rank for row in existing_rows), default=0)
            if rank <= max_rank:
                skipped += 1
                continue

            existing = next((row for row in existing_rows if row.stage == stage), None)
            if existing is not None and (
                existing.sent_count > 0 or existing.attempts >= MAX_REMINDER_ATTEMPTS
            ):
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
