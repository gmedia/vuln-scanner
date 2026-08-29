"""HPP cost journal lines (opex/variable).

Revision ID: add_hpp_cost_lines
Revises: add_hpp_overhead
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_hpp_cost_lines"
down_revision: str | None = "add_hpp_overhead"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hpp_cost_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("incurred_on", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount_idr", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("note", sa.String(length=200), nullable=False, server_default=sa.text("''")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("amount_idr >= 0", name="ck_hpp_cost_lines_amount_non_negative"),
        sa.CheckConstraint("category IN ('opex', 'variable')", name="ck_hpp_cost_lines_category"),
    )
    op.create_index("ix_hpp_cost_lines_incurred_on", "hpp_cost_lines", ["incurred_on"])


def downgrade() -> None:
    op.drop_index("ix_hpp_cost_lines_incurred_on", table_name="hpp_cost_lines")
    op.drop_table("hpp_cost_lines")
