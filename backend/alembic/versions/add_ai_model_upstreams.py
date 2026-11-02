"""Ordered fallback upstreams per AI model alias.

Revision ID: add_ai_model_upstreams
Revises: add_ai_wallet_ledger_opening
Create Date: 2026-11-02

One row per fallback candidate. ``ai_models.provider_id`` / ``upstream_id`` stay the
primary target, so this migration is purely additive: a model with no rows here keeps
serving exactly as before. ``rank`` is 1-based and contiguous per model (1 = first
fallback). ``max_tokens_cap`` and the HPP columns are nullable overrides; ``NULL``
inherits the parent ``ai_models`` value.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_ai_model_upstreams"
down_revision: str | None = "add_ai_wallet_ledger_opening"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_model_upstreams",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("upstream_id", sa.String(length=256), nullable=False),
        sa.Column("max_tokens_cap", sa.Integer(), nullable=True),
        sa.Column("hpp_usd_per_1m_in", sa.Numeric(18, 6), nullable=True),
        sa.Column("hpp_usd_per_1m_out", sa.Numeric(18, 6), nullable=True),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["ai_models.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["provider_id"], ["ai_providers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("model_id", "rank", name="uq_ai_model_upstreams_model_rank"),
        sa.UniqueConstraint(
            "model_id",
            "provider_id",
            "upstream_id",
            name="uq_ai_model_upstreams_target",
        ),
        sa.CheckConstraint("rank >= 1", name="ck_ai_model_upstreams_rank_positive"),
        sa.CheckConstraint(
            "max_tokens_cap IS NULL OR max_tokens_cap >= 1",
            name="ck_ai_model_upstreams_max_tokens_cap_positive",
        ),
        sa.CheckConstraint(
            "hpp_usd_per_1m_in IS NULL OR hpp_usd_per_1m_in >= 0",
            name="ck_ai_model_upstreams_hpp_usd_in_nonnegative",
        ),
        sa.CheckConstraint(
            "hpp_usd_per_1m_out IS NULL OR hpp_usd_per_1m_out >= 0",
            name="ck_ai_model_upstreams_hpp_usd_out_nonnegative",
        ),
    )
    op.create_index("ix_ai_model_upstreams_model_id", "ai_model_upstreams", ["model_id"])
    op.create_index("ix_ai_model_upstreams_provider_id", "ai_model_upstreams", ["provider_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_model_upstreams_provider_id", table_name="ai_model_upstreams")
    op.drop_index("ix_ai_model_upstreams_model_id", table_name="ai_model_upstreams")
    op.drop_table("ai_model_upstreams")
