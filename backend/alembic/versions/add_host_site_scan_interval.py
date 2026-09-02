"""P14 E: optional hourly Host Protect schedule per site.

Revision ID: add_host_site_scan_interval
Revises: widen_host_hit_status
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_host_site_scan_interval"
down_revision: str | None = "widen_host_hit_status"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "host_sites",
        sa.Column("scan_interval", sa.String(length=16), nullable=False, server_default="daily"),
    )
    op.create_check_constraint(
        "ck_host_site_scan_interval",
        "host_sites",
        "scan_interval IN ('daily', 'hourly')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_host_site_scan_interval", "host_sites", type_="check")
    op.drop_column("host_sites", "scan_interval")
