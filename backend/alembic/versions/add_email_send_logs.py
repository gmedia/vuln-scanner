"""Outbound SMTP send log for admin ops.

Revision ID: add_email_send_logs
Revises: add_hpp_hostscan
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_email_send_logs"
down_revision: str | None = "add_hpp_hostscan"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_send_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("recipient_masked", sa.String(length=255), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('verification', 'password_reset', 'scan_diff', 'uptime', 'host_protect')",
            name="ck_email_send_log_kind",
        ),
        sa.CheckConstraint(
            "status IN ('sent', 'failed')",
            name="ck_email_send_log_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_send_logs_created_at",
        "email_send_logs",
        ["created_at"],
    )
    op.create_index(
        "ix_email_send_logs_kind_status",
        "email_send_logs",
        ["kind", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_email_send_logs_kind_status", table_name="email_send_logs")
    op.drop_index("ix_email_send_logs_created_at", table_name="email_send_logs")
    op.drop_table("email_send_logs")
