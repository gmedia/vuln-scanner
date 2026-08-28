"""Index scan_findings.job_id for detail GET.

Revision ID: ix_scan_findings_job_id
Revises: status_host_pricing
Create Date: 2026-08-28
"""

from collections.abc import Sequence

from alembic import op

revision: str = "ix_scan_findings_job_id"
down_revision: str | None = "status_host_pricing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_scan_findings_job_id", "scan_findings", ["job_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_scan_findings_job_id", table_name="scan_findings")
