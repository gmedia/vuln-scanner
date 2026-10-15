"""Admin HPP: rename uptimecheck cost key to uptimemonitor.

Revision ID: rename_hpp_uptime_monitor
Revises: add_uptime_guard_catalog
Create Date: 2026-10-15
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "rename_hpp_uptime_monitor"
down_revision: str | None = "add_uptime_guard_catalog"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_KEYS = "key IN ('ip', 'domain', 'apk', 'ipa', 'statushost', 'hostscan', 'uptimecheck', 'guardagent')"
_NEW_KEYS = "key IN ('ip', 'domain', 'apk', 'ipa', 'statushost', 'hostscan', 'uptimemonitor', 'guardagent')"


def upgrade() -> None:
    op.execute(sa.text("UPDATE hpp_rates SET key = 'uptimemonitor' WHERE key = 'uptimecheck'"))
    op.drop_constraint("ck_hpp_rates_key", "hpp_rates", type_="check")
    op.create_check_constraint("ck_hpp_rates_key", "hpp_rates", _NEW_KEYS)


def downgrade() -> None:
    op.execute(sa.text("UPDATE hpp_rates SET key = 'uptimecheck' WHERE key = 'uptimemonitor'"))
    op.drop_constraint("ck_hpp_rates_key", "hpp_rates", type_="check")
    op.create_check_constraint("ck_hpp_rates_key", "hpp_rates", _OLD_KEYS)
