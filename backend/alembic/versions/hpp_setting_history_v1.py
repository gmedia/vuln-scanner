"""Add append-only ``hpp_setting_history`` audit trail.

Revision ID: hpp_setting_history_v1
Revises: drop_sku_catalog_seats
Create Date: 2026-11-03

``hpp_rates`` and ``hpp_overhead`` only kept the last writer
(``updated_at`` / ``updated_by``). HPP feeds margin reporting, so every cost
change now writes one immutable row with the previous and new amount. The two
HPP PUT handlers append the row in the same transaction as the update; reads
never write.

``key`` is the HPP key for ``scope='rate'`` and ``NULL`` for the overhead
singleton. ``amount_from`` is ``NULL`` when the setting had no previous value.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "hpp_setting_history_v1"
down_revision: str | None = "drop_sku_catalog_seats"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hpp_setting_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("key", sa.String(length=20), nullable=True),
        sa.Column("amount_from", sa.Integer(), nullable=True),
        sa.Column("amount_to", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
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
            name="fk_hpp_setting_history_actor",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            "amount_from IS NULL OR amount_from >= 0",
            name="ck_hpp_setting_history_amount_from_non_negative",
        ),
        sa.CheckConstraint(
            "amount_to >= 0",
            name="ck_hpp_setting_history_amount_to_non_negative",
        ),
        sa.CheckConstraint(
            "scope IN ('rate', 'overhead')",
            name="ck_hpp_setting_history_scope",
        ),
        sa.CheckConstraint(
            "(scope = 'overhead' AND key IS NULL) OR (scope = 'rate' AND key IS NOT NULL)",
            name="ck_hpp_setting_history_scope_key",
        ),
    )
    op.create_index(
        "ix_hpp_setting_history_scope_key_created",
        "hpp_setting_history",
        ["scope", "key", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_hpp_setting_history_scope_key_created",
        table_name="hpp_setting_history",
    )
    op.drop_table("hpp_setting_history")
