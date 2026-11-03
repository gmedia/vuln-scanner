"""Track when the AI provider probe last checked a provider.

Revision ID: add_ai_provider_last_probed_at
Revises: sku_tier_history_v1
Create Date: 2026-11-03

Nullable on purpose: ``NULL`` means "never probed", which is exactly the signal the
probe-age metric reports as ``+Inf``. No backfill.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_ai_provider_last_probed_at"
down_revision: str | None = "sku_tier_history_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ai_providers",
        sa.Column("last_probed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ai_providers", "last_probed_at")
