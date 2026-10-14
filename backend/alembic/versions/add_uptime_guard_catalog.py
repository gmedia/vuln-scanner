"""Invoices: make Uptime + Guard invoicable catalog products.

Revision ID: add_uptime_guard_catalog
Revises: add_hpp_uptime_guard_keys
Create Date: 2026-10-14
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_uptime_guard_catalog"
down_revision: str | None = "add_hpp_uptime_guard_keys"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_PRODUCTS = "product IN ('scan', 'host')"
_NEW_PRODUCTS = "product IN ('scan', 'host', 'uptime', 'guard')"
_SEED_ROWS = (
    ("uptime", "basic", 75_000, 10),
    ("uptime", "pro", 200_000, 50),
    ("uptime", "multi", 500_000, 200),
    ("guard", "basic", 100_000, 1),
    ("guard", "pro", 250_000, 3),
    ("guard", "multi", 600_000, 10),
)


def upgrade() -> None:
    op.drop_constraint("ck_sku_catalog_product", "sku_catalog", type_="check")
    op.create_check_constraint("ck_sku_catalog_product", "sku_catalog", _NEW_PRODUCTS)
    op.drop_constraint("ck_org_invoices_product", "org_invoices", type_="check")
    op.create_check_constraint("ck_org_invoices_product", "org_invoices", _NEW_PRODUCTS)
    for product, sku, list_idr, seats in _SEED_ROWS:
        op.execute(
            sa.text(
                "INSERT INTO sku_catalog (product, sku, list_idr, seats, invoicable, updated_at, updated_by) "
                "VALUES (:p, :s, :l, :seats, true, now(), NULL) "
                "ON CONFLICT (product, sku) DO NOTHING"
            ).bindparams(p=product, s=sku, l=list_idr, seats=seats)
        )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM sku_catalog WHERE product IN ('uptime', 'guard')"))
    op.drop_constraint("ck_sku_catalog_product", "sku_catalog", type_="check")
    op.create_check_constraint("ck_sku_catalog_product", "sku_catalog", _OLD_PRODUCTS)
    op.drop_constraint("ck_org_invoices_product", "org_invoices", type_="check")
    op.create_check_constraint("ck_org_invoices_product", "org_invoices", _OLD_PRODUCTS)
