"""Persist the cancellation note on subscriptions.

Revision ID: add_subscription_cancel_note
Revises: add_billing_profile
Create Date: 2026-10-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_subscription_cancel_note"
down_revision: str | None = "add_billing_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "subscriptions",
        sa.Column("cancel_note", sa.String(length=500), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("subscriptions", "cancel_note")
