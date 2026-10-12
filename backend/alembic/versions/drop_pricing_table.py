"""retire legacy admin pricing table.

Revision ID: drop_pricing_table
Revises: add_enterprise_org_sku
Create Date: 2026-10-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "drop_pricing_table"
down_revision: str | None = "add_enterprise_org_sku"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _seed_pricing() -> None:
    op.execute(
        sa.text(
            """
        INSERT INTO pricing (id, scan_type, credit_cost, updated_at)
        VALUES
          (gen_random_uuid(), 'ip', 1, now()),
          (gen_random_uuid(), 'domain', 2, now()),
          (gen_random_uuid(), 'apk', 3, now()),
          (gen_random_uuid(), 'ipa', 3, now())
        ON CONFLICT (scan_type) DO NOTHING
        """
        )
    )


def upgrade() -> None:
    op.drop_table("pricing")


def downgrade() -> None:
    op.create_table(
        "pricing",
        sa.Column("id", postgresql.UUID(), nullable=False),
        sa.Column("scan_type", sa.String(length=10), nullable=False),
        sa.Column("credit_cost", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scan_type"),
        sa.CheckConstraint("credit_cost >= 0", name="ck_pricing_credit_cost_non_negative"),
    )
    _seed_pricing()
