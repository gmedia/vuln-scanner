"""P11 status pages, components, incidents.

Revision ID: add_status_page_tables
Revises: add_users_google_sub
Create Date: 2026-08-27
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_status_page_tables"
down_revision: str | None = "add_users_google_sub"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "status_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("custom_hostname", sa.String(length=253), nullable=True),
        sa.Column("hostname_status", sa.String(length=24), nullable=False, server_default="none"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", name="uq_status_pages_organization_id"),
        sa.UniqueConstraint("slug", name="uq_status_pages_slug"),
        sa.UniqueConstraint("custom_hostname", name="uq_status_pages_custom_hostname"),
        sa.CheckConstraint(
            "hostname_status IN ('none', 'pending_dns', 'active', 'failed')",
            name="ck_status_pages_hostname_status",
        ),
    )
    op.create_table(
        "status_page_components",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("monitor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["page_id"], ["status_pages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["monitor_id"], ["uptime_monitors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("page_id", "monitor_id", name="uq_status_page_components_page_monitor"),
    )
    op.create_index("ix_status_page_components_page_id", "status_page_components", ["page_id"])
    op.create_table(
        "status_incidents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("impact", sa.String(length=16), nullable=False, server_default="minor"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="investigating"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["page_id"], ["status_pages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("impact IN ('none', 'minor', 'major', 'critical')", name="ck_status_incidents_impact"),
        sa.CheckConstraint(
            "status IN ('investigating', 'identified', 'monitoring', 'resolved')",
            name="ck_status_incidents_status",
        ),
    )
    op.create_index("ix_status_incidents_page_id", "status_incidents", ["page_id"])
    op.create_table(
        "status_incident_updates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("incident_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["incident_id"], ["status_incidents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_status_incident_updates_incident_id", "status_incident_updates", ["incident_id"])


def downgrade() -> None:
    op.drop_index("ix_status_incident_updates_incident_id", table_name="status_incident_updates")
    op.drop_table("status_incident_updates")
    op.drop_index("ix_status_incidents_page_id", table_name="status_incidents")
    op.drop_table("status_incidents")
    op.drop_index("ix_status_page_components_page_id", table_name="status_page_components")
    op.drop_table("status_page_components")
    op.drop_table("status_pages")
