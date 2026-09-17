"""Merge invite email kind and guard agent disabled_at heads.

Revision ID: merge_invite_kind_guard_disabled
Revises: add_email_kind_invite, add_guard_agent_disabled_at
Create Date: 2026-09-17
"""

from collections.abc import Sequence

revision: str = "merge_invite_kind_guard_disabled"
down_revision: tuple[str, str] | None = ("add_email_kind_invite", "add_guard_agent_disabled_at")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
