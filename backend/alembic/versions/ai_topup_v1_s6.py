"""AI wallet top-up v1 (S6): refund resolution note.

Revision ID: ai_topup_v1_s6
Revises: ai_topup_v1_s1
Create Date: 2026-11-07

Adds ``ai_topup_orders.resolution_note`` so an admin can record why a
``refund_review`` order was clawed back or written off. The ledger row already
carries the acting admin and the reference code; this column keeps the human
explanation on the order itself.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ai_topup_v1_s6"
down_revision: str | None = "ai_topup_v1_s1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("ai_topup_orders") as batch_op:
        batch_op.add_column(sa.Column("resolution_note", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ai_topup_orders") as batch_op:
        batch_op.drop_column("resolution_note")
