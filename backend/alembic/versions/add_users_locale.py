"""Add users.locale for dual-language preference (S6).

Revision ID: add_users_locale
Revises: add_siem_tables
Create Date: 2026-08-21
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_users_locale"
down_revision: str | None = "add_siem_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("locale", sa.String(length=8), nullable=True))
    op.execute(sa.text("UPDATE users SET locale = 'id' WHERE locale IS NULL"))
    op.alter_column("users", "locale", existing_type=sa.String(length=8), nullable=False, server_default="id")
    op.create_check_constraint("ck_users_locale_id_en", "users", "locale IN ('id', 'en')")


def downgrade() -> None:
    op.drop_constraint("ck_users_locale_id_en", "users", type_="check")
    op.drop_column("users", "locale")
