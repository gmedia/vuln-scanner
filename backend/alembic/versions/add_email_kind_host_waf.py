"""Allow host_waf on email_send_logs.kind.

Revision ID: add_email_kind_host_waf
Revises: add_ai_usage_payloads
Create Date: 2026-09-07
"""

from collections.abc import Sequence

from alembic import op

revision: str = "add_email_kind_host_waf"
down_revision: str | None = "add_ai_usage_payloads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD = "kind IN ('verification', 'password_reset', 'scan_diff', 'uptime', 'host_protect')"
_NEW = "kind IN ('verification', 'password_reset', 'scan_diff', 'uptime', 'host_protect', 'host_waf')"


def upgrade() -> None:
    op.drop_constraint("ck_email_send_log_kind", "email_send_logs", type_="check")
    op.create_check_constraint("ck_email_send_log_kind", "email_send_logs", _NEW)


def downgrade() -> None:
    op.drop_constraint("ck_email_send_log_kind", "email_send_logs", type_="check")
    op.create_check_constraint("ck_email_send_log_kind", "email_send_logs", _OLD)
