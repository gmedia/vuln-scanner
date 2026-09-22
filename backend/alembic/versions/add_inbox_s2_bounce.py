"""Inbox S2 bounce/SES schema: statuses + provider columns + bounce/suppression tables.

Revision ID: add_inbox_s2_bounce
Revises: host_sku_invoicable
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_inbox_s2_bounce"
down_revision: str | None = "host_sku_invoicable"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_STATUS = "status IN ('sent', 'failed')"
_NEW_STATUS = "status IN ('sent', 'failed', 'bounced', 'complained')"


def upgrade() -> None:
    op.drop_constraint("ck_email_send_log_status", "email_send_logs", type_="check")
    op.add_column(
        "email_send_logs",
        sa.Column("provider", sa.String(length=16), nullable=False, server_default="smtp"),
    )
    op.add_column(
        "email_send_logs",
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "email_send_logs",
        sa.Column("bounce_type", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "email_send_logs",
        sa.Column("bounce_subtype", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "email_send_logs",
        sa.Column("bounced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint("ck_email_send_log_status", "email_send_logs", _NEW_STATUS)

    op.create_table(
        "email_bounce_events",
        sa.Column("sns_message_id", sa.String(length=255), nullable=False),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("subtype", sa.String(length=64), nullable=True),
        sa.Column("recipient_hash", sa.String(length=64), nullable=False),
        sa.Column("raw", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("sns_message_id"),
    )
    op.create_index(
        "ix_bounce_events_provider_msgid",
        "email_bounce_events",
        ["provider_message_id"],
    )

    op.create_table(
        "email_suppressions",
        sa.Column("recipient_hash", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column(
            "first_seen",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "last_seen",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("recipient_hash"),
    )

    op.create_index(
        "ix_email_send_logs_provider_msgid",
        "email_send_logs",
        ["provider_message_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_email_send_logs_provider_msgid", table_name="email_send_logs")
    op.drop_table("email_suppressions")
    op.drop_index("ix_bounce_events_provider_msgid", table_name="email_bounce_events")
    op.drop_table("email_bounce_events")
    op.drop_constraint("ck_email_send_log_status", "email_send_logs", type_="check")
    op.drop_column("email_send_logs", "bounced_at")
    op.drop_column("email_send_logs", "bounce_subtype")
    op.drop_column("email_send_logs", "bounce_type")
    op.drop_column("email_send_logs", "provider_message_id")
    op.drop_column("email_send_logs", "provider")
    op.create_check_constraint("ck_email_send_log_status", "email_send_logs", _OLD_STATUS)
