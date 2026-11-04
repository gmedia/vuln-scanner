"""Payments v1: gateway attempt columns and partial unique indexes.

Revision ID: payments_v1
Revises: blog_pillar_v1
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "payments_v1"
down_revision: str | None = "blog_pillar_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payment_attempts", sa.Column("provider_order_id", sa.String(length=128), nullable=True))
    op.add_column("payment_attempts", sa.Column("provider_payment_id", sa.String(length=128), nullable=True))
    op.add_column("payment_attempts", sa.Column("provider_token", sa.String(length=512), nullable=True))
    op.add_column("payment_attempts", sa.Column("checkout_url", sa.String(length=512), nullable=True))
    op.add_column("payment_attempts", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payment_attempts", sa.Column("provider_status", sa.String(length=32), nullable=True))
    op.add_column(
        "payment_attempts",
        sa.Column("fee_idr", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "payment_attempts",
        sa.Column("refunded_amount_idr", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column("payment_attempts", sa.Column("attempt_seq", sa.Integer(), nullable=True))

    op.create_index(
        "uq_payment_attempt_provider_order",
        "payment_attempts",
        ["provider", "provider_order_id"],
        unique=True,
        postgresql_where=sa.text("provider_order_id IS NOT NULL"),
        sqlite_where=sa.text("provider_order_id IS NOT NULL"),
    )
    op.create_index(
        "uq_payment_attempt_pending_invoice",
        "payment_attempts",
        ["invoice_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_payment_attempt_pending_invoice", table_name="payment_attempts")
    op.drop_index("uq_payment_attempt_provider_order", table_name="payment_attempts")

    op.drop_column("payment_attempts", "attempt_seq")
    op.drop_column("payment_attempts", "refunded_amount_idr")
    op.drop_column("payment_attempts", "fee_idr")
    op.drop_column("payment_attempts", "provider_status")
    op.drop_column("payment_attempts", "expires_at")
    op.drop_column("payment_attempts", "checkout_url")
    op.drop_column("payment_attempts", "provider_token")
    op.drop_column("payment_attempts", "provider_payment_id")
    op.drop_column("payment_attempts", "provider_order_id")
