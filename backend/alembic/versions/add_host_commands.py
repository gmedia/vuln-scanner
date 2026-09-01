"""S11 Host Protect on-box quarantine command queue.

Revision ID: add_host_commands
Revises: merge_email_logs_asset_tags
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_host_commands"
down_revision: str | None = "merge_email_logs_asset_tags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_HIT = "('open', 'quarantined', 'ignored', 'restored')"
_NEW_HIT = "('open', 'pending_quarantine', 'quarantined', 'pending_restore', 'ignored', 'restored')"


def upgrade() -> None:
    op.drop_constraint("ck_host_hit_status", "host_hits", type_="check")
    op.create_check_constraint("ck_host_hit_status", "host_hits", f"status IN {_NEW_HIT}")
    op.create_table(
        "host_commands",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
        sa.Column("dest_basename", sa.String(length=255), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["site_id"], ["host_sites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["hit_id"], ["host_hits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("kind IN ('quarantine', 'restore')", name="ck_host_command_kind"),
        sa.CheckConstraint("status IN ('queued', 'acked', 'failed')", name="ck_host_command_status"),
    )
    op.create_index("ix_host_commands_organization_id", "host_commands", ["organization_id"])
    op.create_index("ix_host_commands_site_id", "host_commands", ["site_id"])
    op.create_index("ix_host_commands_hit_id", "host_commands", ["hit_id"])
    op.create_index("ix_host_commands_status", "host_commands", ["status"])


def downgrade() -> None:
    op.drop_index("ix_host_commands_status", table_name="host_commands")
    op.drop_index("ix_host_commands_hit_id", table_name="host_commands")
    op.drop_index("ix_host_commands_site_id", table_name="host_commands")
    op.drop_index("ix_host_commands_organization_id", table_name="host_commands")
    op.drop_table("host_commands")
    op.drop_constraint("ck_host_hit_status", "host_hits", type_="check")
    op.create_check_constraint("ck_host_hit_status", "host_hits", f"status IN {_OLD_HIT}")
