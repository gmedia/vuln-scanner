"""Merge org tag colors and host site scan interval heads.

Revision ID: merge_tag_colors_host_site_interval
Revises: add_org_tag_colors, add_host_site_scan_interval
Create Date: 2026-09-04
"""

from collections.abc import Sequence

revision: str = "merge_tag_colors_host_site_interval"
down_revision: tuple[str, str] | None = ("add_org_tag_colors", "add_host_site_scan_interval")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
