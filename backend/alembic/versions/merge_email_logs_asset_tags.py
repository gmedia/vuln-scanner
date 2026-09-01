"""Merge email send logs and scan asset tags heads.

Revision ID: merge_email_logs_asset_tags
Revises: add_email_send_logs, add_scan_asset_tags
Create Date: 2026-09-01
"""

from collections.abc import Sequence

revision: str = "merge_email_logs_asset_tags"
down_revision: tuple[str, str] | None = ("add_email_send_logs", "add_scan_asset_tags")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
