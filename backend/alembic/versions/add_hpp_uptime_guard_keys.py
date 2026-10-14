"""Admin HPP: add uptimecheck + guardagent cost keys.

Revision ID: add_hpp_uptime_guard_keys
Revises: sku_catalog_updated_by
Create Date: 2026-10-14
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_hpp_uptime_guard_keys"
down_revision: str | None = "sku_catalog_updated_by"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_KEYS = "key IN ('ip', 'domain', 'apk', 'ipa', 'statushost', 'hostscan')"
_NEW_KEYS = "key IN ('ip', 'domain', 'apk', 'ipa', 'statushost', 'hostscan', 'uptimecheck', 'guardagent')"
_NEW_SEED_KEYS = ("uptimecheck", "guardagent")


def upgrade() -> None:
    op.drop_constraint("ck_hpp_rates_key", "hpp_rates", type_="check")
    op.create_check_constraint("ck_hpp_rates_key", "hpp_rates", _NEW_KEYS)
    for key in _NEW_SEED_KEYS:
        op.execute(
            sa.text(
                "INSERT INTO hpp_rates (key, amount_idr, updated_at) VALUES (:k, 0, now()) "
                "ON CONFLICT (key) DO NOTHING"
            ).bindparams(k=key)
        )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM hpp_rates WHERE key IN ('uptimecheck', 'guardagent')"))
    op.drop_constraint("ck_hpp_rates_key", "hpp_rates", type_="check")
    op.create_check_constraint("ck_hpp_rates_key", "hpp_rates", _OLD_KEYS)
