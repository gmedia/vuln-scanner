"""Add nullable updated_by audit actor on sku_catalog.

Revision ID: sku_catalog_updated_by
Revises: drop_pricing_table
Create Date: 2026-10-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "sku_catalog_updated_by"
down_revision: str | None = "drop_pricing_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sku_catalog",
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_sku_catalog_updated_by",
        "sku_catalog",
        "users",
        ["updated_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_sku_catalog_updated_by", "sku_catalog", type_="foreignkey")
    op.drop_column("sku_catalog", "updated_by")
