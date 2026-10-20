"""Backfill subscriptions from existing paid Scan invoices.

Revision ID: backfill_subscriptions
Revises: add_billing_core
Create Date: 2026-10-20

The billing core shipped with an empty ``subscriptions`` table, so every org
that paid before the deploy was invisible to the admin billing surface. This
backfill seeds one row per organization whose latest non-void Scan invoice is
paid, using that invoice's period.

Status is derived from the invoice period, never hardcoded: a period that still
covers ``now()`` is ``active``; a lapsed period is ``past_due``. Marking a
long-lapsed customer ``active`` would show them a false "grace period" badge
until the lifecycle beat caught up.

Idempotent: ``ON CONFLICT (organization_id) DO NOTHING`` keeps rows created by
the live payment path. Safe to run on a live database.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "backfill_subscriptions"
down_revision: str | None = "add_billing_core"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BACKFILL = """
INSERT INTO subscriptions (
    id,
    organization_id,
    sku,
    status,
    cycle,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    ended_at,
    provider,
    provider_subscription_id,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    o.id,
    o.sku,
    CASE
        WHEN latest.period_end >= now() THEN 'active'
        ELSE 'past_due'
    END,
    CASE
        WHEN latest.period_end - latest.period_start > INTERVAL '40 days' THEN 'annual'
        ELSE 'monthly'
    END,
    latest.period_start,
    latest.period_end,
    false,
    NULL,
    NULL,
    'manual',
    NULL,
    now(),
    now()
FROM organizations o
JOIN LATERAL (
    SELECT i.period_start, i.period_end
    FROM org_invoices i
    WHERE i.organization_id = o.id
      AND i.product = 'scan'
      AND i.status = 'paid'
    ORDER BY i.period_start DESC, i.created_at DESC
    LIMIT 1
) latest ON true
ON CONFLICT (organization_id) DO NOTHING
"""


def upgrade() -> None:
    op.execute(sa.text(_BACKFILL))


def downgrade() -> None:
    # Data backfill only. Do not delete subscription rows: some were created by
    # the live payment path and cannot be distinguished from backfilled rows.
    pass
