"""P8 uptime monitors, samples, events.

Revision ID: add_uptime_tables
Revises: add_scan_assets
Create Date: 2026-08-24
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_uptime_tables"
down_revision: str | None = "add_scan_assets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "uptime_monitors",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("check_type", sa.String(length=10), nullable=False),
        sa.Column("target", sa.Text(), nullable=False),
        sa.Column("interval_seconds", sa.Integer(), nullable=False),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False),
        sa.Column("expect_status", sa.Integer(), nullable=True),
        sa.Column("keyword", sa.String(length=512), nullable=True),
        sa.Column("keyword_invert", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("state", sa.String(length=16), nullable=False, server_default="unknown"),
        sa.Column("consecutive_fails", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status_code", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("next_check_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notify_email", sa.String(length=255), nullable=True),
        sa.Column("last_tls_warn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["scan_assets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "check_type", "target", name="uq_uptime_monitors_org_type_target"),
        sa.UniqueConstraint("asset_id", name="uq_uptime_monitors_asset_id"),
        sa.CheckConstraint("check_type IN ('http', 'tcp')", name="ck_uptime_check_type"),
        sa.CheckConstraint("state IN ('unknown', 'up', 'down', 'degraded')", name="ck_uptime_state"),
        sa.CheckConstraint("interval_seconds >= 60 AND interval_seconds <= 900", name="ck_uptime_interval"),
        sa.CheckConstraint("timeout_seconds >= 1 AND timeout_seconds <= 30", name="ck_uptime_timeout"),
    )
    op.create_index("ix_uptime_monitors_organization_id", "uptime_monitors", ["organization_id"])
    op.create_index("ix_uptime_monitors_next_check_at", "uptime_monitors", ["next_check_at"])

    op.create_table(
        "uptime_samples",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["monitor_id"], ["uptime_monitors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_uptime_samples_monitor_id", "uptime_samples", ["monitor_id"])
    op.create_index("ix_uptime_samples_checked_at", "uptime_samples", ["checked_at"])

    op.create_table(
        "uptime_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_state", sa.String(length=16), nullable=False),
        sa.Column("to_state", sa.String(length=16), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["monitor_id"], ["uptime_monitors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_uptime_events_monitor_id", "uptime_events", ["monitor_id"])


def downgrade() -> None:
    op.drop_index("ix_uptime_events_monitor_id", table_name="uptime_events")
    op.drop_table("uptime_events")
    op.drop_index("ix_uptime_samples_checked_at", table_name="uptime_samples")
    op.drop_index("ix_uptime_samples_monitor_id", table_name="uptime_samples")
    op.drop_table("uptime_samples")
    op.drop_index("ix_uptime_monitors_next_check_at", table_name="uptime_monitors")
    op.drop_index("ix_uptime_monitors_organization_id", table_name="uptime_monitors")
    op.drop_table("uptime_monitors")
