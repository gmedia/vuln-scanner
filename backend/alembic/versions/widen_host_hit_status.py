"""Widen host_hits.status so pending_quarantine fits.

Revision ID: widen_host_hit_status
Revises: add_helper_poll_at
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "widen_host_hit_status"
down_revision: str | None = "add_helper_poll_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "host_hits",
        "status",
        existing_type=sa.String(length=16),
        type_=sa.String(length=32),
        existing_nullable=False,
        existing_server_default="open",
    )


def downgrade() -> None:
    op.alter_column(
        "host_hits",
        "status",
        existing_type=sa.String(length=32),
        type_=sa.String(length=16),
        existing_nullable=False,
        existing_server_default="open",
    )
