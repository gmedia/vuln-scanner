"""Sinexis invoice v1: SKU catalog + org invoices.

Revision ID: add_org_invoices
Revises: add_email_kind_host_waf
Create Date: 2026-09-13
"""

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_org_invoices"
down_revision: str | None = "add_email_kind_host_waf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "organizations",
        "sku",
        server_default="basic",
        existing_type=sa.String(length=20),
        existing_nullable=False,
    )
    op.create_table(
        "sku_catalog",
        sa.Column("product", sa.String(length=20), nullable=False),
        sa.Column("sku", sa.String(length=20), nullable=False),
        sa.Column("list_idr", sa.Integer(), nullable=False),
        sa.Column("seats", sa.Integer(), nullable=False),
        sa.Column("invoicable", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("product IN ('scan', 'host')", name="ck_sku_catalog_product"),
        sa.CheckConstraint("sku IN ('basic', 'pro', 'multi')", name="ck_sku_catalog_sku"),
        sa.CheckConstraint("list_idr >= 0", name="ck_sku_catalog_list_idr"),
        sa.CheckConstraint("seats >= 1", name="ck_sku_catalog_seats"),
        sa.PrimaryKeyConstraint("product", "sku"),
    )
    op.create_table(
        "org_invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("number", sa.String(length=32), nullable=False),
        sa.Column("product", sa.String(length=20), nullable=False),
        sa.Column("sku", sa.String(length=20), nullable=False),
        sa.Column("amount_idr", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("bank_ref", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("product IN ('scan', 'host')", name="ck_org_invoices_product"),
        sa.CheckConstraint("sku IN ('basic', 'pro', 'multi')", name="ck_org_invoices_sku"),
        sa.CheckConstraint("status IN ('draft', 'sent', 'paid', 'void')", name="ck_org_invoices_status"),
        sa.CheckConstraint("amount_idr >= 0", name="ck_org_invoices_amount"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("number", name="uq_org_invoices_number"),
    )
    op.create_index("ix_org_invoices_organization_id", "org_invoices", ["organization_id"])
    op.create_index(
        "uq_org_invoices_scan_period_open",
        "org_invoices",
        ["organization_id", "product", "period_start"],
        unique=True,
        postgresql_where=sa.text("status <> 'void'"),
    )
    now = datetime.now(UTC)
    catalog = sa.table(
        "sku_catalog",
        sa.column("product", sa.String),
        sa.column("sku", sa.String),
        sa.column("list_idr", sa.Integer),
        sa.column("seats", sa.Integer),
        sa.column("invoicable", sa.Boolean),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        catalog,
        [
            {
                "product": "scan",
                "sku": "basic",
                "list_idr": 300_000,
                "seats": 1,
                "invoicable": True,
                "updated_at": now,
            },
            {
                "product": "scan",
                "sku": "pro",
                "list_idr": 650_000,
                "seats": 3,
                "invoicable": True,
                "updated_at": now,
            },
            {
                "product": "scan",
                "sku": "multi",
                "list_idr": 2_000_000,
                "seats": 10,
                "invoicable": True,
                "updated_at": now,
            },
            {
                "product": "host",
                "sku": "basic",
                "list_idr": 150_000,
                "seats": 1,
                "invoicable": False,
                "updated_at": now,
            },
            {
                "product": "host",
                "sku": "pro",
                "list_idr": 350_000,
                "seats": 3,
                "invoicable": False,
                "updated_at": now,
            },
            {
                "product": "host",
                "sku": "multi",
                "list_idr": 900_000,
                "seats": 10,
                "invoicable": False,
                "updated_at": now,
            },
        ],
    )


def downgrade() -> None:
    op.drop_index("uq_org_invoices_scan_period_open", table_name="org_invoices")
    op.drop_index("ix_org_invoices_organization_id", table_name="org_invoices")
    op.drop_table("org_invoices")
    op.drop_table("sku_catalog")
    op.alter_column(
        "organizations",
        "sku",
        server_default="multi",
        existing_type=sa.String(length=20),
        existing_nullable=False,
    )
