"""Uptime v2 check types: HTTP extras, heartbeat, DNS, ping.

Revision ID: uptime_v2_check_types
Revises: add_finding_attacker_benefit
Create Date: 2026-08-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "uptime_v2_check_types"
down_revision: str | None = "add_finding_attacker_benefit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "uptime_monitors",
        "check_type",
        existing_type=sa.String(length=10),
        type_=sa.String(length=16),
        existing_nullable=False,
    )
    op.drop_constraint("ck_uptime_check_type", "uptime_monitors", type_="check")
    op.create_check_constraint(
        "ck_uptime_check_type",
        "uptime_monitors",
        "check_type IN ('http', 'tcp', 'heartbeat', 'dns', 'ping')",
    )
    op.add_column(
        "uptime_monitors",
        sa.Column("http_method", sa.String(length=8), nullable=False, server_default="GET"),
    )
    op.add_column(
        "uptime_monitors",
        sa.Column("request_headers", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("uptime_monitors", sa.Column("request_body", sa.Text(), nullable=True))
    op.add_column(
        "uptime_monitors",
        sa.Column("heartbeat_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "uptime_monitors",
        sa.Column("heartbeat_token_prefix", sa.String(length=8), nullable=True),
    )
    op.add_column(
        "uptime_monitors",
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("uptime_monitors", sa.Column("dns_record", sa.String(length=8), nullable=True))
    op.add_column(
        "uptime_monitors",
        sa.Column("expected_values", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_index(
        "ix_uptime_monitors_heartbeat_token_hash",
        "uptime_monitors",
        ["heartbeat_token_hash"],
        unique=True,
        postgresql_where=sa.text("heartbeat_token_hash IS NOT NULL"),
        sqlite_where=sa.text("heartbeat_token_hash IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_uptime_monitors_heartbeat_token_hash", table_name="uptime_monitors")
    op.drop_column("uptime_monitors", "expected_values")
    op.drop_column("uptime_monitors", "dns_record")
    op.drop_column("uptime_monitors", "last_heartbeat_at")
    op.drop_column("uptime_monitors", "heartbeat_token_prefix")
    op.drop_column("uptime_monitors", "heartbeat_token_hash")
    op.drop_column("uptime_monitors", "request_body")
    op.drop_column("uptime_monitors", "request_headers")
    op.drop_column("uptime_monitors", "http_method")
    op.drop_constraint("ck_uptime_check_type", "uptime_monitors", type_="check")
    op.create_check_constraint(
        "ck_uptime_check_type",
        "uptime_monitors",
        "check_type IN ('http', 'tcp')",
    )
    op.alter_column(
        "uptime_monitors",
        "check_type",
        existing_type=sa.String(length=16),
        type_=sa.String(length=10),
        existing_nullable=False,
    )
