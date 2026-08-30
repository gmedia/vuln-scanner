"""P13 Host WAF policies and events.

Revision ID: add_host_waf
Revises: add_host_protect
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_host_waf"
down_revision: str | None = "add_host_protect"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "host_waf_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False, server_default="off"),
        sa.Column("engine", sa.String(length=16), nullable=False, server_default="mock"),
        sa.Column("paranoia", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["site_id"], ["host_sites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("site_id", name="uq_host_waf_policies_site"),
        sa.CheckConstraint("mode IN ('off', 'detect', 'protect')", name="ck_host_waf_mode"),
        sa.CheckConstraint("engine IN ('mock', 'coraza', 'nginx_modsec')", name="ck_host_waf_engine"),
        sa.CheckConstraint("paranoia >= 1 AND paranoia <= 4", name="ck_host_waf_paranoia"),
    )
    op.create_index("ix_host_waf_policies_organization_id", "host_waf_policies", ["organization_id"])

    op.create_table(
        "host_waf_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("policy_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("rule_id", sa.String(length=128), nullable=False),
        sa.Column("method", sa.String(length=8), nullable=False),
        sa.Column("path", sa.String(length=256), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["site_id"], ["host_sites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["policy_id"], ["host_waf_policies.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("action IN ('log', 'block')", name="ck_host_waf_action"),
    )
    op.create_index("ix_host_waf_events_organization_id", "host_waf_events", ["organization_id"])
    op.create_index("ix_host_waf_events_site_id", "host_waf_events", ["site_id"])


def downgrade() -> None:
    op.drop_index("ix_host_waf_events_site_id", table_name="host_waf_events")
    op.drop_index("ix_host_waf_events_organization_id", table_name="host_waf_events")
    op.drop_table("host_waf_events")
    op.drop_index("ix_host_waf_policies_organization_id", table_name="host_waf_policies")
    op.drop_table("host_waf_policies")
