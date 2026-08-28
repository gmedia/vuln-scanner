"""P11.x hostname_status pending_txt + suspended.

Revision ID: status_hostname_lifecycle
Revises: uptime_v2_check_types
Create Date: 2026-08-28
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "status_hostname_lifecycle"
down_revision: str | None = "uptime_v2_check_types"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_status_pages_hostname_status", "status_pages", type_="check")
    op.execute("UPDATE status_pages SET hostname_status = 'pending_txt' WHERE hostname_status = 'pending_dns'")
    op.create_check_constraint(
        "ck_status_pages_hostname_status",
        "status_pages",
        "hostname_status IN ('none', 'pending_txt', 'active', 'failed', 'suspended')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_status_pages_hostname_status", "status_pages", type_="check")
    op.execute("UPDATE status_pages SET hostname_status = 'pending_dns' WHERE hostname_status = 'pending_txt'")
    op.execute("UPDATE status_pages SET hostname_status = 'failed' WHERE hostname_status = 'suspended'")
    op.create_check_constraint(
        "ck_status_pages_hostname_status",
        "status_pages",
        "hostname_status IN ('none', 'pending_dns', 'active', 'failed')",
    )
