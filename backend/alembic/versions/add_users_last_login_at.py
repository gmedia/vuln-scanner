"""Add users.last_login_at for admin last-login display.

Revision ID: add_users_last_login_at
Revises: merge_email_logs_asset_tags, add_host_site_scan_interval
Create Date: 2026-09-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_users_last_login_at"
down_revision: tuple[str, str] | None = (
    "merge_email_logs_asset_tags",
    "add_host_site_scan_interval",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_login_at")
