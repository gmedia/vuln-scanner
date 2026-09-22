"""P14 E: Host Protect inotify on-write opt-in flag + on_write trigger.

Revision ID: add_host_site_watch_on_write
Revises: add_inbox_s2_bounce
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_host_site_watch_on_write"
down_revision: str | None = "add_inbox_s2_bounce"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_TRIGGER = "trigger IN ('schedule', 'manual')"
_NEW_TRIGGER = "trigger IN ('schedule', 'manual', 'on_write')"


def upgrade() -> None:
    op.add_column(
        "host_sites",
        sa.Column("watch_on_write", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.drop_constraint("ck_host_scan_trigger", "host_scans", type_="check")
    op.create_check_constraint("ck_host_scan_trigger", "host_scans", _NEW_TRIGGER)


def downgrade() -> None:
    op.drop_constraint("ck_host_scan_trigger", "host_scans", type_="check")
    op.create_check_constraint("ck_host_scan_trigger", "host_scans", _OLD_TRIGGER)
    op.drop_column("host_sites", "watch_on_write")
