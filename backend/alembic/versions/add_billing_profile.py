"""Billing profile and email-only billing recipients.

Revision ID: add_billing_profile
Revises: drop_dead_billing_statuses
Create Date: 2026-10-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_billing_profile"
down_revision: str | None = "drop_dead_billing_statuses"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "org_billing_profiles",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("legal_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("tax_id", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("nitku", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("address_line1", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("address_line2", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("city", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("province", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("postal_code", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("country", sa.String(length=2), nullable=False, server_default="ID"),
        sa.Column("billing_email", sa.String(length=320), nullable=False, server_default=""),
        sa.Column("po_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("po_number", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("payment_terms_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pkp_status", sa.String(length=20), nullable=False, server_default="unknown"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("organization_id"),
        sa.CheckConstraint(
            "pkp_status IN ('unknown', 'pkp', 'non_pkp')",
            name="ck_billing_profile_pkp_status",
        ),
        sa.CheckConstraint(
            "payment_terms_days >= 0 AND payment_terms_days <= 180",
            name="ck_billing_profile_payment_terms",
        ),
    )

    op.create_table(
        "billing_recipients",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="billing"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "email", name="uq_billing_recipient_org_email"),
        sa.CheckConstraint(
            "kind IN ('billing', 'account')",
            name="ck_billing_recipient_kind",
        ),
    )
    op.create_index(
        "ix_billing_recipients_organization_id",
        "billing_recipients",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "uq_billing_recipient_primary",
        "billing_recipients",
        ["organization_id"],
        unique=True,
        postgresql_where=sa.text("is_primary AND disabled_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_billing_recipient_primary", table_name="billing_recipients")
    op.drop_index("ix_billing_recipients_organization_id", table_name="billing_recipients")
    op.drop_table("billing_recipients")
    op.drop_table("org_billing_profiles")
