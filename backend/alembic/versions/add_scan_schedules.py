"""add scan_schedules table for S1 Scan Attach

Revision ID: add_scan_schedules
Revises: add_finding_impact
Create Date: 2026-08-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_scan_schedules"
down_revision: str | None = "add_finding_impact"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "scan_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("scan_type", sa.String(10), nullable=False),
        sa.Column("target", sa.Text(), nullable=False),
        sa.Column("cadence", sa.String(20), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Jakarta"),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_job_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scan_jobs.id"), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_email", sa.String(255), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("scan_type IN ('ip', 'domain')", name="ck_schedule_scan_type"),
        sa.CheckConstraint("cadence IN ('weekly', 'monthly')", name="ck_schedule_cadence"),
    )
    op.create_index("ix_scan_schedules_user_id", "scan_schedules", ["user_id"])
    op.create_index("ix_scan_schedules_next_run_at", "scan_schedules", ["next_run_at"])


def downgrade() -> None:
    op.drop_index("ix_scan_schedules_next_run_at", table_name="scan_schedules")
    op.drop_index("ix_scan_schedules_user_id", table_name="scan_schedules")
    op.drop_table("scan_schedules")
