"""AI FX rates (daily USD/IDR snapshot for admin price entry).

Revision ID: add_ai_fx_rates
Revises: add_invoice_tax
Create Date: 2026-10-30

Display/entry only: COGS and billing keep using ``AI_USD_IDR``. Rows are keyed
by (base, quote, effective_date) so a same-day refresh overwrites the earlier
snapshot instead of duplicating it.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_ai_fx_rates"
down_revision: str | None = "add_invoice_tax"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_fx_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("base", sa.String(length=3), nullable=False),
        sa.Column("quote", sa.String(length=3), nullable=False),
        sa.Column("rate", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("base", "quote", "effective_date", name="uq_ai_fx_rates_pair_date"),
    )
    op.create_index("ix_ai_fx_rates_pair_date", "ai_fx_rates", ["base", "quote", "effective_date"])


def downgrade() -> None:
    op.drop_index("ix_ai_fx_rates_pair_date", table_name="ai_fx_rates")
    op.drop_table("ai_fx_rates")
