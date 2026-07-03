"""add password_reset_tokens

Revision ID: add_password_reset_tokens
Revises: b0d39330c1b8
Create Date: 2026-07-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_password_reset_tokens"
down_revision: str | None = "b0d39330c1b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(op.f("ix_password_reset_tokens_token"), "password_reset_tokens", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_password_reset_tokens_token"), table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
