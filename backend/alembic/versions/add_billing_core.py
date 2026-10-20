"""Billing core: subscriptions, payment attempts, payment events.

Revision ID: add_billing_core
Revises: rename_hpp_uptime_monitor
Create Date: 2026-10-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_billing_core"
down_revision: str | None = "add_subscription_requests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sku", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("cycle", sa.String(length=10), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("provider_subscription_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", name="uq_subscriptions_organization_id"),
        sa.CheckConstraint(
            "status IN ('incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled')",
            name="ck_subscriptions_status",
        ),
        sa.CheckConstraint("cycle IN ('monthly', 'annual')", name="ck_subscriptions_cycle"),
        sa.CheckConstraint(
            "sku IN ('basic', 'pro', 'multi', 'enterprise')",
            name="ck_subscriptions_sku",
        ),
    )
    op.create_index(
        "ix_subscriptions_organization_id",
        "subscriptions",
        ["organization_id"],
        unique=False,
    )

    op.create_table(
        "payment_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="manual"),
        sa.Column("provider_ref", sa.String(length=128), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("amount_idr", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="IDR"),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=True),
        sa.Column("failure_code", sa.String(length=64), nullable=True),
        sa.Column("failure_message", sa.String(length=255), nullable=True),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("succeeded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscription_id"], ["subscriptions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invoice_id"], ["org_invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'expired', 'refunded')",
            name="ck_payment_attempt_status",
        ),
        sa.CheckConstraint("amount_idr >= 0", name="ck_payment_attempt_amount"),
    )
    op.create_index(
        "ix_payment_attempts_organization_id",
        "payment_attempts",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_payment_attempts_subscription_id",
        "payment_attempts",
        ["subscription_id"],
        unique=False,
    )
    op.create_index(
        "ix_payment_attempts_invoice_id",
        "payment_attempts",
        ["invoice_id"],
        unique=False,
    )

    op.create_table(
        "payment_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=128), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "event_id", name="uq_payment_event_provider_event"),
        sa.CheckConstraint(
            "status IN ('received', 'processed', 'ignored', 'failed')",
            name="ck_payment_event_status",
        ),
    )
    op.create_index(
        "ix_payment_events_received_at",
        "payment_events",
        ["received_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_payment_events_received_at", table_name="payment_events")
    op.drop_table("payment_events")
    op.drop_index("ix_payment_attempts_invoice_id", table_name="payment_attempts")
    op.drop_index("ix_payment_attempts_subscription_id", table_name="payment_attempts")
    op.drop_index("ix_payment_attempts_organization_id", table_name="payment_attempts")
    op.drop_table("payment_attempts")
    op.drop_index("ix_subscriptions_organization_id", table_name="subscriptions")
    op.drop_table("subscriptions")
