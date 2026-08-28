"""P11.x-B persist Cloudflare custom hostname id and TXT/SSL fields.

Revision ID: status_page_cf_hostname
Revises: status_hostname_lifecycle
Create Date: 2026-08-28
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "status_page_cf_hostname"
down_revision: str | None = "status_hostname_lifecycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("status_pages", sa.Column("cf_hostname_id", sa.String(length=64), nullable=True))
    op.add_column("status_pages", sa.Column("txt_name", sa.String(length=253), nullable=True))
    op.add_column("status_pages", sa.Column("txt_value", sa.String(length=255), nullable=True))
    op.add_column("status_pages", sa.Column("ssl_status", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("status_pages", "ssl_status")
    op.drop_column("status_pages", "txt_value")
    op.drop_column("status_pages", "txt_name")
    op.drop_column("status_pages", "cf_hostname_id")
