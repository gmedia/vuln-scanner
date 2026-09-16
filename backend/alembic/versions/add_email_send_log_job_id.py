"""Add nullable job_id on email_send_logs for inbox scan_diff links.

Revision ID: add_email_send_log_job_id
Revises: add_email_send_log_user_id
Create Date: 2026-09-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_email_send_log_job_id"
down_revision: str | None = "add_email_send_log_user_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "email_send_logs",
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_email_send_logs_job_id",
        "email_send_logs",
        "scan_jobs",
        ["job_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_email_send_logs_job_id", "email_send_logs", ["job_id"])


def downgrade() -> None:
    op.drop_index("ix_email_send_logs_job_id", table_name="email_send_logs")
    op.drop_constraint("fk_email_send_logs_job_id", "email_send_logs", type_="foreignkey")
    op.drop_column("email_send_logs", "job_id")
