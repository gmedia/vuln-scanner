"""Host Protect helper poll heartbeat on Guard agents.

Revision ID: add_helper_poll_at
Revises: add_host_commands
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_helper_poll_at"
down_revision: str | None = "add_host_commands"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "guard_agents",
        sa.Column("last_helper_poll_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("guard_agents", "last_helper_poll_at")
