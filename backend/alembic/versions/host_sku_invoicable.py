"""H9: Host sku_catalog rows invoicable.

Revision ID: host_sku_invoicable
Revises: merge_invite_kind_guard_disabled
Create Date: 2026-09-21
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "host_sku_invoicable"
down_revision: str | None = "merge_invite_kind_guard_disabled"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE sku_catalog SET invoicable = true, updated_at = now() WHERE product = 'host'"))


def downgrade() -> None:
    op.execute(sa.text("UPDATE sku_catalog SET invoicable = false, updated_at = now() WHERE product = 'host'"))
