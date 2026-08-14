"""add siem_cases, siem_case_events, siem_case_notes

Revision ID: add_siem_tables
Revises: drop_placeholder_admin
Create Date: 2026-08-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_siem_tables"
down_revision: str | None = "drop_placeholder_admin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "siem_cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("severity", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assignee_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('open', 'ack', 'closed')", name="ck_siem_case_status"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignee_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_siem_cases_organization_id", "siem_cases", ["organization_id"])

    op.create_table(
        "siem_case_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("rule_id", sa.String(length=32), nullable=True),
        sa.Column("rule_level", sa.Integer(), nullable=False),
        sa.Column("rule_description", sa.String(length=512), nullable=False),
        sa.Column("agent_wazuh_id", sa.String(length=32), nullable=True),
        sa.Column("agent_name", sa.String(length=255), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["case_id"], ["siem_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("case_id", "external_id", name="uq_siem_case_event_case_external"),
    )
    op.create_index("ix_siem_case_events_case_id", "siem_case_events", ["case_id"])
    op.create_index("ix_siem_case_events_organization_id", "siem_case_events", ["organization_id"])

    op.create_table(
        "siem_case_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["case_id"], ["siem_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_siem_case_notes_case_id", "siem_case_notes", ["case_id"])


def downgrade() -> None:
    op.drop_index("ix_siem_case_notes_case_id", table_name="siem_case_notes")
    op.drop_table("siem_case_notes")
    op.drop_index("ix_siem_case_events_organization_id", table_name="siem_case_events")
    op.drop_index("ix_siem_case_events_case_id", table_name="siem_case_events")
    op.drop_table("siem_case_events")
    op.drop_index("ix_siem_cases_organization_id", table_name="siem_cases")
    op.drop_table("siem_cases")
