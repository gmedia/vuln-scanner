"""add guard_org_bindings, guard_agents, guard_alerts, guard_enroll_tokens

Revision ID: add_guard_tables
Revises: add_workspace_orgs
Create Date: 2026-08-10
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_guard_tables"
down_revision: str | None = "add_workspace_orgs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "guard_org_bindings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wazuh_group", sa.String(length=128), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_inventory_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_alert_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", name="uq_guard_org_bindings_organization_id"),
    )
    op.create_index("ix_guard_org_bindings_organization_id", "guard_org_bindings", ["organization_id"])

    op.create_table(
        "guard_agents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("wazuh_agent_id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("version", sa.String(length=64), nullable=True),
        sa.Column("last_keep_alive", sa.DateTime(timezone=True), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('active', 'disconnected', 'pending', 'never_connected', 'unknown')",
            name="ck_guard_agent_status",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", "wazuh_agent_id", name="uq_guard_agent_org_wazuh"),
    )
    op.create_index("ix_guard_agents_organization_id", "guard_agents", ["organization_id"])

    op.create_table(
        "guard_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("rule_id", sa.String(length=32), nullable=True),
        sa.Column("rule_level", sa.Integer(), nullable=False),
        sa.Column("rule_description", sa.String(length=512), nullable=False),
        sa.Column("agent_wazuh_id", sa.String(length=32), nullable=True),
        sa.Column("agent_name", sa.String(length=255), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", "external_id", name="uq_guard_alert_org_external"),
    )
    op.create_index("ix_guard_alerts_organization_id", "guard_alerts", ["organization_id"])

    op.create_table(
        "guard_enroll_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("token_hash", name="uq_guard_enroll_token_hash"),
    )
    op.create_index("ix_guard_enroll_tokens_organization_id", "guard_enroll_tokens", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_guard_enroll_tokens_organization_id", table_name="guard_enroll_tokens")
    op.drop_table("guard_enroll_tokens")
    op.drop_index("ix_guard_alerts_organization_id", table_name="guard_alerts")
    op.drop_table("guard_alerts")
    op.drop_index("ix_guard_agents_organization_id", table_name="guard_agents")
    op.drop_table("guard_agents")
    op.drop_index("ix_guard_org_bindings_organization_id", table_name="guard_org_bindings")
    op.drop_table("guard_org_bindings")
