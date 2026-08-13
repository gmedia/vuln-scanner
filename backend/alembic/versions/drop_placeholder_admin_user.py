"""Remove .env.example placeholder admin rows.

Revision ID: drop_placeholder_admin
Revises: add_guard_tables
Create Date: 2026-08-13
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "drop_placeholder_admin"
down_revision: str | None = "add_guard_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PLACEHOLDER_EMAIL = "<your-admin-email>"


def upgrade() -> None:
    conn = op.get_bind()
    user_ids = [
        row[0]
        for row in conn.execute(
            sa.text("SELECT id FROM users WHERE email = :email").bindparams(email=_PLACEHOLDER_EMAIL)
        ).fetchall()
    ]
    if not user_ids:
        return

    leftover = 0
    for user_id in user_ids:
        leftover += (
            conn.execute(sa.text("SELECT count(*) FROM scan_jobs WHERE user_id = :id").bindparams(id=user_id)).scalar()
            or 0
        )
    if leftover:
        raise RuntimeError("placeholder admin still owns scan_jobs; refuse delete")

    for user_id in user_ids:
        params = {"id": user_id}
        conn.execute(sa.text("DELETE FROM email_verification_tokens WHERE user_id = :id").bindparams(**params))
        conn.execute(sa.text("DELETE FROM password_reset_tokens WHERE user_id = :id").bindparams(**params))
        conn.execute(sa.text("DELETE FROM credit_logs WHERE user_id = :id").bindparams(**params))
        conn.execute(sa.text("DELETE FROM scan_schedules WHERE user_id = :id").bindparams(**params))
        conn.execute(sa.text("DELETE FROM organization_invites WHERE invited_by_user_id = :id").bindparams(**params))
        conn.execute(sa.text("DELETE FROM organization_memberships WHERE user_id = :id").bindparams(**params))
        conn.execute(
            sa.text("UPDATE organizations SET created_by_user_id = NULL WHERE created_by_user_id = :id").bindparams(
                **params
            )
        )
        conn.execute(sa.text("DELETE FROM users WHERE id = :id").bindparams(**params))


def downgrade() -> None:
    return
