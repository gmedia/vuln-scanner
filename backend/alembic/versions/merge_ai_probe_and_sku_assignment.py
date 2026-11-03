"""Merge the provider-probe column and the SKU assignment audit trail.

Revision ID: merge_ai_probe_and_sku_assignment
Revises: add_ai_provider_last_probed_at, sku_tier_history_assignment_v1
Create Date: 2026-11-03

Both parents branched from ``sku_tier_history_v1`` and merged independently, so ``main``
carried two heads and ``alembic upgrade head`` failed with "Multiple head revisions are
present". The deploy job runs exactly that command, so this empty merge revision is the
whole fix: no schema change, just a single head again.
"""

from collections.abc import Sequence

revision: str = "merge_ai_probe_and_sku_assignment"
down_revision: tuple[str, str] | None = ("add_ai_provider_last_probed_at", "sku_tier_history_assignment_v1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
