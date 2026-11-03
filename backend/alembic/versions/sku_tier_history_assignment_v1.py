"""Record who moved an organization to which SKU tier.

Revision ID: sku_tier_history_assignment_v1
Revises: sku_tier_history_v1
Create Date: 2026-11-03

Adds a nullable ``organization_id`` (``ON DELETE SET NULL``, so the record
outlives the organization) plus a composite index, and widens the ``action``
CHECK with ``assigned``. Rows without an organization keep the previous shape.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "sku_tier_history_assignment_v1"
down_revision: str | None = "sku_tier_history_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIONS = (
    "created",
    "updated",
    "deactivated",
    "reactivated",
    "deleted",
    "price_updated",
    "assigned",
)
_ACTION_CHECK = "action IN (" + ", ".join(f"'{action}'" for action in _ACTIONS) + ")"
_OLD_ACTION_CHECK = "action IN ('created', 'updated', 'deactivated', 'reactivated', 'deleted', 'price_updated')"


def upgrade() -> None:
    op.add_column(
        "sku_tier_history",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_sku_tier_history_organization",
        "sku_tier_history",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_sku_tier_history_org_created",
        "sku_tier_history",
        ["organization_id", "created_at"],
    )
    op.drop_constraint("ck_sku_tier_history_action", "sku_tier_history", type_="check")
    op.create_check_constraint("ck_sku_tier_history_action", "sku_tier_history", _ACTION_CHECK)


def downgrade() -> None:
    # Assignment rows cannot be represented by the narrower CHECK; drop them so
    # the downgrade cannot fail halfway through.
    op.execute("DELETE FROM sku_tier_history WHERE action = 'assigned'")
    op.drop_constraint("ck_sku_tier_history_action", "sku_tier_history", type_="check")
    op.create_check_constraint(
        "ck_sku_tier_history_action", "sku_tier_history", _OLD_ACTION_CHECK
    )
    op.drop_index("ix_sku_tier_history_org_created", table_name="sku_tier_history")
    op.drop_constraint(
        "fk_sku_tier_history_organization", "sku_tier_history", type_="foreignkey"
    )
    op.drop_column("sku_tier_history", "organization_id")
