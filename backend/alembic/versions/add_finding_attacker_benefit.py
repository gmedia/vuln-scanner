"""add attacker_benefit column to scan_findings

Revision ID: add_finding_attacker_benefit
Revises: add_status_page_tables
Create Date: 2026-08-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_finding_attacker_benefit"
down_revision: str | None = "add_status_page_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scan_findings",
        sa.Column("attacker_benefit", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scan_findings", "attacker_benefit")
