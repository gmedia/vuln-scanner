"""R6: add enterprise to organizations.sku check constraint.

Revision ID: add_enterprise_org_sku
Revises: add_host_site_watch_on_write
Create Date: 2026-10-12
"""

from collections.abc import Sequence

from alembic import op

revision: str = "add_enterprise_org_sku"
down_revision: str | None = "add_host_site_watch_on_write"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_SKUS = "sku IN ('basic', 'pro', 'multi')"
_NEW_SKUS = "sku IN ('basic', 'pro', 'multi', 'enterprise')"


def upgrade() -> None:
    op.drop_constraint("ck_organization_sku", "organizations", type_="check")
    op.create_check_constraint("ck_organization_sku", "organizations", _NEW_SKUS)


def downgrade() -> None:
    op.drop_constraint("ck_organization_sku", "organizations", type_="check")
    op.create_check_constraint("ck_organization_sku", "organizations", _OLD_SKUS)
