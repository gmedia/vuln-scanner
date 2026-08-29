"""Admin HPP rates (IDR unit cost per job type).

Revision ID: add_hpp_rates
Revises: ix_scan_findings_job_id
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_hpp_rates"
down_revision: str | None = "ix_scan_findings_job_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KEYS = ("ip", "domain", "apk", "ipa", "statushost")


def upgrade() -> None:
    op.create_table(
        "hpp_rates",
        sa.Column("key", sa.String(length=20), nullable=False),
        sa.Column("amount_idr", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("key"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("amount_idr >= 0", name="ck_hpp_rates_amount_non_negative"),
        sa.CheckConstraint(
            "key IN ('ip', 'domain', 'apk', 'ipa', 'statushost')",
            name="ck_hpp_rates_key",
        ),
    )
    for key in _KEYS:
        op.execute(
            sa.text("INSERT INTO hpp_rates (key, amount_idr, updated_at) VALUES (:k, 0, now())").bindparams(k=key)
        )


def downgrade() -> None:
    op.drop_table("hpp_rates")
