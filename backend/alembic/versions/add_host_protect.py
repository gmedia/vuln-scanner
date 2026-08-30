"""P12 Host Protect sites/scans/hits/quarantine.

Revision ID: add_host_protect
Revises: add_hpp_cost_lines
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_host_protect"
down_revision: str | None = "add_hpp_cost_lines"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "host_sites",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("guard_agent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("root_path", sa.String(length=1024), nullable=False),
        sa.Column("cms_hint", sa.String(length=32), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("auto_quarantine", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["guard_agent_id"], ["guard_agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["asset_id"], ["scan_assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "guard_agent_id", "root_path", name="uq_host_sites_org_agent_path"),
        sa.CheckConstraint(
            "cms_hint IS NULL OR cms_hint IN ('wordpress', 'laravel', 'unknown')",
            name="ck_host_site_cms",
        ),
    )
    op.create_index("ix_host_sites_organization_id", "host_sites", ["organization_id"])
    op.create_index("ix_host_sites_guard_agent_id", "host_sites", ["guard_agent_id"])

    op.create_table(
        "host_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
        sa.Column("trigger", sa.String(length=16), nullable=False, server_default="manual"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["site_id"], ["host_sites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("status IN ('queued', 'running', 'completed', 'failed')", name="ck_host_scan_status"),
        sa.CheckConstraint("trigger IN ('schedule', 'manual')", name="ck_host_scan_trigger"),
    )
    op.create_index("ix_host_scans_organization_id", "host_scans", ["organization_id"])
    op.create_index("ix_host_scans_site_id", "host_scans", ["site_id"])

    op.create_table(
        "host_hits",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("rel_path", sa.String(length=1024), nullable=False),
        sa.Column("class", sa.String(length=32), nullable=False),
        sa.Column("engine", sa.String(length=16), nullable=False),
        sa.Column("rule_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["site_id"], ["host_sites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scan_id"], ["host_scans.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "class IN ('webshell', 'backdoor', 'malware', 'spam_seo', 'suspicious')",
            name="ck_host_hit_class",
        ),
        sa.CheckConstraint("engine IN ('yara', 'clam', 'mock')", name="ck_host_hit_engine"),
        sa.CheckConstraint(
            "status IN ('open', 'quarantined', 'ignored', 'restored')",
            name="ck_host_hit_status",
        ),
    )
    op.create_index("ix_host_hits_organization_id", "host_hits", ["organization_id"])
    op.create_index("ix_host_hits_site_id", "host_hits", ["site_id"])

    op.create_table(
        "host_quarantine_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("dest_basename", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["hit_id"], ["host_hits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("action IN ('quarantine', 'restore')", name="ck_host_quarantine_action"),
    )
    op.create_index("ix_host_quarantine_events_organization_id", "host_quarantine_events", ["organization_id"])
    op.create_index("ix_host_quarantine_events_hit_id", "host_quarantine_events", ["hit_id"])


def downgrade() -> None:
    op.drop_index("ix_host_quarantine_events_hit_id", table_name="host_quarantine_events")
    op.drop_index("ix_host_quarantine_events_organization_id", table_name="host_quarantine_events")
    op.drop_table("host_quarantine_events")
    op.drop_index("ix_host_hits_site_id", table_name="host_hits")
    op.drop_index("ix_host_hits_organization_id", table_name="host_hits")
    op.drop_table("host_hits")
    op.drop_index("ix_host_scans_site_id", table_name="host_scans")
    op.drop_index("ix_host_scans_organization_id", table_name="host_scans")
    op.drop_table("host_scans")
    op.drop_index("ix_host_sites_guard_agent_id", table_name="host_sites")
    op.drop_index("ix_host_sites_organization_id", table_name="host_sites")
    op.drop_table("host_sites")
