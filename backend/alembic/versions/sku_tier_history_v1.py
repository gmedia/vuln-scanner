"""Add append-only ``sku_tier_history`` audit trail.

Revision ID: sku_tier_history_v1
Revises: sku_tiers_v1
Create Date: 2026-11-02

Every tier configuration or catalog-price change writes one row with a
per-field ``{"from": ..., "to": ...}`` diff and the acting admin. There is no
FK on ``sku_code``: the history must survive a hard tier delete.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "sku_tier_history_v1"
down_revision: str | None = "sku_tiers_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIONS = ("created", "updated", "deactivated", "reactivated", "deleted", "price_updated")
_ACTION_CHECK = "action IN (" + ", ".join(f"'{action}'" for action in _ACTIONS) + ")"

def upgrade() -> None:
    op.create_table(
        "sku_tier_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sku_code", sa.String(length=20), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("changes", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="fk_sku_tier_history_actor",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(_ACTION_CHECK, name="ck_sku_tier_history_action"),
    )
    op.create_index(
        "ix_sku_tier_history_sku_created",
        "sku_tier_history",
        ["sku_code", "created_at"],
    )

def downgrade() -> None:
    op.drop_index("ix_sku_tier_history_sku_created", table_name="sku_tier_history")
    op.drop_table("sku_tier_history")
