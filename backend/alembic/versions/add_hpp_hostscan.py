"""HPP key hostscan (Host Protect completed scans). Seed amount_idr=0.

Revision ID: add_hpp_hostscan
Revises: add_host_agent_ingest
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_hpp_hostscan"
down_revision: str | None = "add_host_agent_ingest"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_KEYS = "('ip', 'domain', 'apk', 'ipa', 'statushost', 'hostscan')"
_OLD_KEYS = "('ip', 'domain', 'apk', 'ipa', 'statushost')"


def upgrade() -> None:
    op.drop_constraint("ck_hpp_rates_key", "hpp_rates", type_="check")
    op.create_check_constraint(
        "ck_hpp_rates_key",
        "hpp_rates",
        f"key IN {_NEW_KEYS}",
    )
    op.execute(
        sa.text(
            "INSERT INTO hpp_rates (key, amount_idr, updated_at) "
            "VALUES ('hostscan', 0, now()) ON CONFLICT (key) DO NOTHING"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM hpp_rates WHERE key = 'hostscan'"))
    op.drop_constraint("ck_hpp_rates_key", "hpp_rates", type_="check")
    op.create_check_constraint(
        "ck_hpp_rates_key",
        "hpp_rates",
        f"key IN {_OLD_KEYS}",
    )
