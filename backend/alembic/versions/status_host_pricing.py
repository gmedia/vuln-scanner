"""P11.x-C seed statushost pricing (admin-editable credit cost).

Revision ID: status_host_pricing
Revises: status_page_cf_hostname
Create Date: 2026-08-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "status_host_pricing"
down_revision: str | None = "status_page_cf_hostname"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO pricing (id, scan_type, credit_cost, updated_at)
            VALUES (gen_random_uuid(), 'statushost', 0, now())
            ON CONFLICT (scan_type) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM pricing WHERE scan_type = 'statushost'"))
