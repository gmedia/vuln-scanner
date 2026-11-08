"""Payment safety: one settled manual attempt per invoice + void/paid audit trail.

Revision ID: payment_safety_v1
Revises: ai_topup_v1_p0
Create Date: 2026-11-08

Two independent hardening changes on the invoice/payment path.

1. ``payment_attempts`` gets a partial unique index on ``invoice_id`` where
   ``provider = 'manual' AND status = 'succeeded'``. Two concurrent manual
   "record payment" requests can both pass the invoice-state check; this makes
   the second insert fail at the database instead of double-booking revenue.

   Duplicate cleanup: this migration deletes duplicates deterministically
   (keep the earliest succeeded manual attempt per invoice, ordered by
   ``created_at`` then ``id``; delete the rest) before creating the index, so
   the upgrade never fails on pre-existing data. A loud failure was the
   alternative; cleanup is chosen because a duplicate here is already corrupt
   data and blocking deploy helps nobody.

2. ``org_invoices`` records who paid/sent/voided and why, so an admin action is
   attributable without joining the audit log. All actor columns are nullable
   FKs to ``users`` with ``ON DELETE SET NULL``.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "payment_safety_v1"
down_revision: str | None = "ai_topup_v1_p0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_DEDUPE_SQL = """
DELETE FROM payment_attempts
WHERE provider = 'manual'
  AND status = 'succeeded'
  AND invoice_id IS NOT NULL
  AND id NOT IN (
      SELECT kept_id FROM (
          SELECT id AS kept_id,
                 ROW_NUMBER() OVER (
                     PARTITION BY invoice_id
                     ORDER BY created_at ASC, id ASC
                 ) AS rn
          FROM payment_attempts
          WHERE provider = 'manual'
            AND status = 'succeeded'
            AND invoice_id IS NOT NULL
      ) ranked
      WHERE rn = 1
  )
"""

_AUDIT_COLUMNS = (
    "paid_by_user_id",
    "sent_by_user_id",
    "voided_by_user_id",
)


def upgrade() -> None:
    op.execute(sa.text(_DEDUPE_SQL))
    op.create_index(
        "uq_payment_attempt_manual_succeeded",
        "payment_attempts",
        ["invoice_id"],
        unique=True,
        postgresql_where=sa.text("provider = 'manual' AND status = 'succeeded'"),
        sqlite_where=sa.text("provider = 'manual' AND status = 'succeeded'"),
    )

    for column in _AUDIT_COLUMNS:
        op.add_column(
            "org_invoices",
            sa.Column(column, postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"fk_org_invoices_{column}",
            "org_invoices",
            "users",
            [column],
            ["id"],
            ondelete="SET NULL",
        )
    op.add_column(
        "org_invoices",
        sa.Column("void_reason", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "org_invoices",
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("org_invoices", "voided_at")
    op.drop_column("org_invoices", "void_reason")
    for column in reversed(_AUDIT_COLUMNS):
        op.drop_constraint(
            f"fk_org_invoices_{column}",
            "org_invoices",
            type_="foreignkey",
        )
        op.drop_column("org_invoices", column)
    op.drop_index(
        "uq_payment_attempt_manual_succeeded",
        table_name="payment_attempts",
    )
