"""Subscription requests (phase 1: request-only plan changes).

Revision ID: add_subscription_requests
Revises: rename_hpp_uptime_monitor
Create Date: 2026-10-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_subscription_requests"
down_revision: str | None = "rename_hpp_uptime_monitor"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subscription_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("current_sku", sa.String(length=20), nullable=False),
        sa.Column("target_sku", sa.String(length=20), nullable=False),
        sa.Column("cycle", sa.String(length=10), nullable=False, server_default="monthly"),
        sa.Column("note", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("resolution_note", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("resolved_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "direction IN ('upgrade', 'downgrade')",
            name="ck_subscription_request_direction",
        ),
        sa.CheckConstraint(
            "cycle IN ('monthly', 'annual')",
            name="ck_subscription_request_cycle",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'canceled')",
            name="ck_subscription_request_status",
        ),
        sa.CheckConstraint(
            "current_sku IN ('basic', 'pro', 'multi', 'enterprise')",
            name="ck_subscription_request_current_sku",
        ),
        sa.CheckConstraint(
            "target_sku IN ('basic', 'pro', 'multi')",
            name="ck_subscription_request_target_sku",
        ),
    )
    op.create_index(
        "ix_subscription_requests_organization_id",
        "subscription_requests",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_subscription_requests_organization_id", table_name="subscription_requests")
    op.drop_table("subscription_requests")
