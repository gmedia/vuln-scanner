"""Store per-call cache hits, time-to-first-token and output throughput inputs.

Revision ID: ai_usage_latency_details
Revises: invoice_request_link_v1
Create Date: 2026-11-06

``latency_ms`` already records the whole request. Usage views also need the
prompt-cache hit count reported by the upstream (cached tokens are part of the
prompt total and can be priced differently) and the time to the first streamed
content token, so an output tokens/second rate can exclude the wait for the
provider to start generating.

Existing rows keep ``cached_tokens = 0`` and ``ttft_ms = NULL``; TTFT was never
measured before this revision, so backfilling a value would fabricate data.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ai_usage_latency_details"
down_revision: str | None = "invoice_request_link_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ai_usage_events",
        sa.Column("cached_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "ai_usage_events",
        sa.Column("ttft_ms", sa.Integer(), nullable=True),
    )
    op.drop_constraint("ck_ai_usage_source", "ai_usage_events", type_="check")
    op.create_check_constraint(
        "ck_ai_usage_source",
        "ai_usage_events",
        "source IN ('customer', 'admin_trial', 'customer_trial')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_ai_usage_source", "ai_usage_events", type_="check")
    op.create_check_constraint(
        "ck_ai_usage_source",
        "ai_usage_events",
        "source IN ('customer', 'admin_trial')",
    )
    op.drop_column("ai_usage_events", "ttft_ms")
    op.drop_column("ai_usage_events", "cached_tokens")
