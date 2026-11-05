"""Promo finance cap: second-admin approval for high-value codes.

Revision ID: promo_approval_v1
Revises: promo_v1
Create Date: 2026-11-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "promo_approval_v1"
down_revision: str | None = "promo_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_ACTIONS = ("created", "updated", "deactivated", "reactivated", "deleted")
_NEW_ACTIONS = (*_OLD_ACTIONS, "approved", "approval_reset")


def _action_check(actions: Sequence[str]) -> str:
    return "action IN (" + ", ".join(f"'{action}'" for action in actions) + ")"


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    op.add_column(
        "promo_codes",
        sa.Column(
            "requires_approval",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "promo_codes",
        sa.Column("approved_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "promo_codes",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )

    if _is_postgresql():
        op.create_foreign_key(
            "fk_promo_codes_approved_by",
            "promo_codes",
            "users",
            ["approved_by_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.drop_constraint("ck_promo_code_history_action", "promo_code_history", type_="check")
        op.create_check_constraint(
            "ck_promo_code_history_action",
            "promo_code_history",
            _action_check(_NEW_ACTIONS),
        )


def downgrade() -> None:
    if _is_postgresql():
        op.drop_constraint("ck_promo_code_history_action", "promo_code_history", type_="check")
        op.create_check_constraint(
            "ck_promo_code_history_action",
            "promo_code_history",
            _action_check(_OLD_ACTIONS),
        )
        op.drop_constraint("fk_promo_codes_approved_by", "promo_codes", type_="foreignkey")

    op.drop_column("promo_codes", "approved_at")
    op.drop_column("promo_codes", "approved_by_user_id")
    op.drop_column("promo_codes", "requires_approval")
