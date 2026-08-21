"""P3 scan assets + org sku + schedule.asset_id.

Revision ID: add_scan_assets
Revises: add_users_locale
Create Date: 2026-08-21
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_scan_assets"
down_revision: str | None = "add_users_locale"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("sku", sa.String(length=20), nullable=False, server_default="multi"),
    )
    op.create_check_constraint("ck_organization_sku", "organizations", "sku IN ('basic', 'pro', 'multi')")

    op.create_table(
        "scan_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("scan_type", sa.String(length=10), nullable=False),
        sa.Column("target", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "scan_type", "target", name="uq_scan_assets_org_type_target"),
        sa.CheckConstraint("scan_type IN ('ip', 'domain')", name="ck_scan_asset_scan_type"),
    )
    op.create_index("ix_scan_assets_organization_id", "scan_assets", ["organization_id"])

    op.add_column(
        "scan_schedules",
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_scan_schedules_asset_id",
        "scan_schedules",
        "scan_assets",
        ["asset_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "uq_scan_schedules_asset_id",
        "scan_schedules",
        ["asset_id"],
        unique=True,
        postgresql_where=sa.text("asset_id IS NOT NULL"),
        sqlite_where=sa.text("asset_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_scan_schedules_asset_id", table_name="scan_schedules")
    op.drop_constraint("fk_scan_schedules_asset_id", "scan_schedules", type_="foreignkey")
    op.drop_column("scan_schedules", "asset_id")
    op.drop_index("ix_scan_assets_organization_id", table_name="scan_assets")
    op.drop_table("scan_assets")
    op.drop_constraint("ck_organization_sku", "organizations", type_="check")
    op.drop_column("organizations", "sku")
