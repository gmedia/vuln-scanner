"""Billing access gate.

A lapsed workspace becomes **read-only**, not locked: dashboards, history,
exports, invoices, and billing stay available so the customer can see what they
are paying for and settle it. Only writes that create cost or commitment are
blocked.

The gate is deliberately conservative:

* No subscription row -> allow. A missing row must never lock an org; the
  lifecycle beat creates rows, and backfill only covers orgs that paid.
* ``enterprise`` -> allow. Enterprise is a custom contract, not a self-serve
  plan.
* ``incomplete`` -> allow. A brand-new org has not been invoiced yet.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.billing import Subscription
from app.models.organization import Organization
from app.models.user import User
from app.services.auth import get_active_org_id, get_current_user

READ_ONLY_STATUSES = ("past_due", "unpaid", "canceled")

REASON_OVERDUE = "payment_overdue"
REASON_CANCELED = "subscription_canceled"


async def billing_write_block(db: AsyncSession, org_id: UUID) -> str | None:
    """Return a reason code when the org may not write, else ``None``."""
    org = await db.get(Organization, org_id)
    if org is None:
        return None
    if (org.sku or "basic") == "enterprise":
        return None

    sub = (
        await db.execute(select(Subscription).where(Subscription.organization_id == org_id))
    ).scalar_one_or_none()
    if sub is None:
        return None
    if sub.status == "canceled":
        return REASON_CANCELED
    if sub.status in READ_ONLY_STATUSES:
        return REASON_OVERDUE
    return None


def read_only_message(reason: str) -> str:
    if reason == REASON_CANCELED:
        return (
            "This workspace is read-only because the subscription has ended. "
            "Renew to create scans, sites, monitors, or agents."
        )
    return (
        "This workspace is read-only because the invoice is overdue. "
        "Settle the invoice to create scans, sites, monitors, or agents."
    )


async def require_billing_write(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """FastAPI dependency for write routes.

    Reads the active org from request state, so it works for both path-scoped
    and active-org-scoped routers without duplicating membership lookups.
    """
    org_id = get_active_org_id(request)
    if org_id is None:
        return
    reason = await billing_write_block(db, org_id)
    if reason is not None:
        raise HTTPException(status_code=403, detail=read_only_message(reason))


# Reusable decorator argument for write routes.
BILLING_WRITE = [Depends(require_billing_write)]


__all__ = [
    "BILLING_WRITE",
    "READ_ONLY_STATUSES",
    "REASON_CANCELED",
    "REASON_OVERDUE",
    "billing_write_block",
    "read_only_message",
    "require_billing_write",
]
