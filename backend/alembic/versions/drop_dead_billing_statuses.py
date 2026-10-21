"""Remove unreachable subscription statuses.

Revision ID: drop_dead_billing_statuses
Revises: add_invoice_due_reminders
Create Date: 2026-10-21

``trialing`` and ``unpaid`` were never written by any code path: they existed
only in the CHECK constraint, the transition allowlist, read logic, and UI
filters. They are removed so the enum matches the states the system can
actually produce. Any stray row is normalised first.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "drop_dead_billing_statuses"
down_revision: str | None = "add_invoice_due_reminders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE subscriptions SET status = 'active' WHERE status = 'trialing'"))
    op.execute(sa.text("UPDATE subscriptions SET status = 'past_due' WHERE status = 'unpaid'"))
    op.drop_constraint("ck_subscriptions_status", "subscriptions", type_="check")
    op.create_check_constraint(
        "ck_subscriptions_status",
        "subscriptions",
        "status IN ('incomplete', 'active', 'past_due', 'canceled')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_subscriptions_status", "subscriptions", type_="check")
    op.create_check_constraint(
        "ck_subscriptions_status",
        "subscriptions",
        "status IN ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled')",
    )
