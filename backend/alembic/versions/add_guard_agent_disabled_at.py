"""Add nullable disabled_at on guard_agents for D10 SaaS soft-disable.

Revision ID: add_guard_agent_disabled_at
Revises: add_email_send_log_job_id
Create Date: 2026-09-16
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_guard_agent_disabled_at"
down_revision: str | None = "add_email_send_log_job_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "guard_agents",
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("guard_agents", "disabled_at")
