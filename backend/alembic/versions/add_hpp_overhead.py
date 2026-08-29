"""Monthly HPP overhead (rent/CF) singleton.

Revision ID: add_hpp_overhead
Revises: add_hpp_rates
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_hpp_overhead"
down_revision: str | None = "add_hpp_rates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hpp_overhead",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("amount_idr", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("amount_idr >= 0", name="ck_hpp_overhead_amount_non_negative"),
    )
    op.execute(sa.text("INSERT INTO hpp_overhead (id, amount_idr, updated_at) VALUES (1, 0, now())"))


def downgrade() -> None:
    op.drop_table("hpp_overhead")
