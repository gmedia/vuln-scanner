"""Optional Guard agent → scan asset FK (1:0..1).

Revision ID: add_guard_agent_asset_id
Revises: merge_tag_colors_host_site_interval
Create Date: 2026-09-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_guard_agent_asset_id"
down_revision: str | None = "merge_tag_colors_host_site_interval"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "guard_agents",
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_guard_agents_asset_id",
        "guard_agents",
        "scan_assets",
        ["asset_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "uq_guard_agents_asset_id",
        "guard_agents",
        ["asset_id"],
        unique=True,
        postgresql_where=sa.text("asset_id IS NOT NULL"),
        sqlite_where=sa.text("asset_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_guard_agents_asset_id", table_name="guard_agents")
    op.drop_constraint("fk_guard_agents_asset_id", "guard_agents", type_="foreignkey")
    op.drop_column("guard_agents", "asset_id")
