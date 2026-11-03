"""Drop the inert ``sku_catalog.seats`` mirror.

Revision ID: drop_sku_catalog_seats
Revises: merge_ai_probe_sku_assignment
Create Date: 2026-11-03

``seats`` duplicated ``sku_tiers.limit_<product>`` and, since 2026-11-03, no API
path reads it: `GET /api/admin/sku-catalog`, `GET /api/admin/sku-prices` and the
subscription catalog all derive the value from the tier row. Keeping the column
left a second source of truth that could drift without any visible symptom, so
it goes away instead of being maintained by hand.

``sku_catalog`` keeps its ``list_idr`` / ``invoicable`` role; only the capacity
mirror is removed.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "drop_sku_catalog_seats"
down_revision: str | None = "merge_ai_probe_sku_assignment"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_BACKFILL = """
UPDATE sku_catalog AS c
SET seats = CASE c.product
    WHEN 'scan' THEN t.limit_scan
    WHEN 'host' THEN t.limit_host
    WHEN 'uptime' THEN t.limit_uptime
    WHEN 'guard' THEN t.limit_guard
END
FROM sku_tiers AS t
WHERE t.code = c.sku
"""


def upgrade() -> None:
    op.drop_constraint("ck_sku_catalog_seats", "sku_catalog", type_="check")
    op.drop_column("sku_catalog", "seats")


def downgrade() -> None:
    op.add_column("sku_catalog", sa.Column("seats", sa.Integer(), nullable=True))
    op.execute(_BACKFILL)
    op.execute("UPDATE sku_catalog SET seats = 1 WHERE seats IS NULL")
    op.alter_column("sku_catalog", "seats", nullable=False)
    op.create_check_constraint("ck_sku_catalog_seats", "sku_catalog", "seats >= 1")
