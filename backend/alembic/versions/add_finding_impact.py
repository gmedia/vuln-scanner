"""add impact column to scan_findings

Revision ID: add_finding_impact
Revises: 274b8242a4d8
Create Date: 2026-08-05
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "add_finding_impact"
down_revision: str | None = "274b8242a4d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scan_findings",
        sa.Column("impact", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scan_findings", "impact")
