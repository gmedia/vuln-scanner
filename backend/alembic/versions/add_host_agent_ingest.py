"""S9 Host Protect agent ingest token + needles engine.

Revision ID: add_host_agent_ingest
Revises: add_host_waf
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_host_agent_ingest"
down_revision: str | None = "add_host_waf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "guard_agents",
        sa.Column("results_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "guard_agents",
        sa.Column("results_token_revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_guard_agents_results_token_hash",
        "guard_agents",
        ["results_token_hash"],
        unique=True,
        postgresql_where=sa.text("results_token_hash IS NOT NULL"),
        sqlite_where=sa.text("results_token_hash IS NOT NULL"),
    )
    op.drop_constraint("ck_host_hit_engine", "host_hits", type_="check")
    op.create_check_constraint(
        "ck_host_hit_engine",
        "host_hits",
        "engine IN ('yara', 'clam', 'mock', 'needles')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_host_hit_engine", "host_hits", type_="check")
    op.create_check_constraint(
        "ck_host_hit_engine",
        "host_hits",
        "engine IN ('yara', 'clam', 'mock')",
    )
    op.drop_index("ix_guard_agents_results_token_hash", table_name="guard_agents")
    op.drop_column("guard_agents", "results_token_revoked_at")
    op.drop_column("guard_agents", "results_token_hash")
