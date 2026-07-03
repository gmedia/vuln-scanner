"""add_performed_by_to_credit_logs

Revision ID: 274b8242a4d8
Revises: add_password_reset_tokens
Create Date: 2026-07-03 10:24:57.841473
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "274b8242a4d8"
down_revision: str | None = "add_password_reset_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "credit_logs",
        sa.Column(
            "performed_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("credit_logs", "performed_by")
