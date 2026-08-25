"""Uptime v1 gaps: last_latency_ms, unique among enabled only.

Revision ID: uptime_v1_gaps
Revises: add_uptime_tables
Create Date: 2026-08-25
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "uptime_v1_gaps"
down_revision: str | None = "add_uptime_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("uptime_monitors", sa.Column("last_latency_ms", sa.Integer(), nullable=True))
    op.drop_constraint("uq_uptime_monitors_org_type_target", "uptime_monitors", type_="unique")
    op.create_index(
        "uq_uptime_monitors_org_type_target_enabled",
        "uptime_monitors",
        ["organization_id", "check_type", "target"],
        unique=True,
        postgresql_where=sa.text("enabled IS TRUE"),
        sqlite_where=sa.text("enabled = 1"),
    )


def downgrade() -> None:
    op.drop_index("uq_uptime_monitors_org_type_target_enabled", table_name="uptime_monitors")
    op.create_unique_constraint(
        "uq_uptime_monitors_org_type_target",
        "uptime_monitors",
        ["organization_id", "check_type", "target"],
    )
    op.drop_column("uptime_monitors", "last_latency_ms")
