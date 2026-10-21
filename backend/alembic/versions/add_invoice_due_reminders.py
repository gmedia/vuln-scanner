"""Invoice due dates and billing reminder ledger.

Revision ID: add_invoice_due_reminders
Revises: backfill_subscriptions
Create Date: 2026-10-20

Adds an explicit ``due_date`` to invoices (reminders and ``past_due`` must key
off the payment term, not the service period) and a ``billing_reminders``
ledger so the hourly sweep sends each stage once per invoice.

Backfill: ``due_date = period_start`` and ``sent_at = updated_at`` for invoices
that were already sent or paid. Existing paid rows are unaffected by reminders.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_invoice_due_reminders"
down_revision: str | None = "backfill_subscriptions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STAGES = ("due_soon", "due_today", "overdue_1", "overdue_2", "final", "suspend_notice")


def upgrade() -> None:
    op.add_column("org_invoices", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("org_invoices", sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(sa.text("UPDATE org_invoices SET due_date = period_start WHERE due_date IS NULL"))
    op.execute(
        sa.text(
            "UPDATE org_invoices SET sent_at = updated_at "
            "WHERE sent_at IS NULL AND status IN ('sent', 'paid')"
        )
    )
    op.alter_column("org_invoices", "due_date", nullable=False)
    op.create_index(
        "ix_org_invoices_status_due_date",
        "org_invoices",
        ["status", "due_date"],
        unique=False,
    )

    op.create_table(
        "billing_reminders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("stage_rank", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["org_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_id", "stage", name="uq_billing_reminder_invoice_stage"),
        sa.CheckConstraint(f"stage IN {_STAGES}", name="ck_billing_reminder_stage"),
    )
    op.create_index(
        "ix_billing_reminders_invoice_id",
        "billing_reminders",
        ["invoice_id"],
        unique=False,
    )
    op.create_index(
        "ix_billing_reminders_organization_id",
        "billing_reminders",
        ["organization_id"],
        unique=False,
    )

    op.drop_constraint("ck_email_send_log_kind", "email_send_logs", type_="check")
    op.create_check_constraint(
        "ck_email_send_log_kind",
        "email_send_logs",
        "kind IN ('verification', 'password_reset', 'scan_diff', 'uptime', "
        "'host_protect', 'host_waf', 'invite', 'billing_reminder')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_email_send_log_kind", "email_send_logs", type_="check")
    op.create_check_constraint(
        "ck_email_send_log_kind",
        "email_send_logs",
        "kind IN ('verification', 'password_reset', 'scan_diff', 'uptime', "
        "'host_protect', 'host_waf', 'invite')",
    )
    op.drop_index("ix_billing_reminders_organization_id", table_name="billing_reminders")
    op.drop_index("ix_billing_reminders_invoice_id", table_name="billing_reminders")
    op.drop_table("billing_reminders")
    op.drop_index("ix_org_invoices_status_due_date", table_name="org_invoices")
    op.drop_column("org_invoices", "sent_at")
    op.drop_column("org_invoices", "due_date")
