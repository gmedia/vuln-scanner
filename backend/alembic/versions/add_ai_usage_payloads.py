"""Store AI usage request/response JSON for admin review.

Revision ID: add_ai_usage_payloads
Revises: add_ai_gateway_s1
Create Date: 2026-09-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_ai_usage_payloads"
down_revision: str | None = "add_ai_gateway_s1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ai_usage_events",
        sa.Column("request_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "ai_usage_events",
        sa.Column("response_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ai_usage_events", "response_payload")
    op.drop_column("ai_usage_events", "request_payload")
