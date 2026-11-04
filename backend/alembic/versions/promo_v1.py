"""Promo codes v1: codes, redemption ledger, audit history and invoice discount.

Revision ID: promo_v1
Revises: payments_v1
Create Date: 2026-11-04

A promo code is a billing discount object, not a payment method and not a
credit balance. The redemption row is written in the same transaction as the
invoice it discounts; voiding an invoice releases (never deletes) the row so the
quota returns and the ledger stays complete.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "promo_v1"
down_revision: str | None = "payments_v1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIONS = ("created", "updated", "deactivated", "reactivated", "deleted")
_ACTION_CHECK = "action IN (" + ", ".join(f"'{action}'" for action in _ACTIONS) + ")"

_CODE_PATTERN = r"^[A-Z0-9][A-Z0-9_-]{7,31}$"

def upgrade() -> None:
    op.create_table(
        "promo_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column(
            "description",
            sa.String(length=200),
            nullable=False,
            server_default=sa.text("''"),
        ),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("percent_off_bp", sa.Integer(), nullable=True),
        sa.Column("amount_idr", sa.Integer(), nullable=True),
        sa.Column(
            "min_amount_idr",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("max_discount_idr", sa.Integer(), nullable=True),
        sa.Column("applies_to_sku", sa.String(length=20), nullable=True),
        sa.Column("applies_to_product", sa.String(length=20), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_redemptions", sa.Integer(), nullable=True),
        sa.Column(
            "max_redemptions_per_org",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_promo_codes_code"),
        sa.ForeignKeyConstraint(
            ["applies_to_sku"],
            ["sku_tiers.code"],
            name="fk_promo_codes_sku",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_promo_codes_created_by",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            name="fk_promo_codes_updated_by",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint("code = upper(code)", name="ck_promo_codes_code_upper"),
        sa.CheckConstraint(
            f"code ~ '{_CODE_PATTERN}'", name="ck_promo_codes_code_pattern"
        ).ddl_if(dialect="postgresql"),
        sa.CheckConstraint("kind IN ('percent', 'fixed')", name="ck_promo_codes_kind"),
        sa.CheckConstraint(
            "percent_off_bp IS NULL OR (percent_off_bp >= 1 AND percent_off_bp <= 10000)",
            name="ck_promo_codes_percent",
        ),
        sa.CheckConstraint(
            "amount_idr IS NULL OR amount_idr > 0", name="ck_promo_codes_amount"
        ),
        sa.CheckConstraint(
            "(kind = 'percent' AND percent_off_bp IS NOT NULL AND amount_idr IS NULL) "
            "OR (kind = 'fixed' AND amount_idr IS NOT NULL AND percent_off_bp IS NULL)",
            name="ck_promo_codes_kind_value",
        ),
        sa.CheckConstraint(
            "min_amount_idr >= 0", name="ck_promo_codes_min_amount"
        ),
        sa.CheckConstraint(
            "max_discount_idr IS NULL OR max_discount_idr > 0",
            name="ck_promo_codes_max_discount",
        ),
        sa.CheckConstraint(
            "applies_to_product IS NULL OR applies_to_product IN ('scan', 'host', 'uptime', 'guard')",
            name="ck_promo_codes_product",
        ),
        sa.CheckConstraint(
            "starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at",
            name="ck_promo_codes_window",
        ),
        sa.CheckConstraint(
            "max_redemptions IS NULL OR max_redemptions >= 1",
            name="ck_promo_codes_max_redemptions",
        ),
        sa.CheckConstraint(
            "max_redemptions_per_org >= 1",
            name="ck_promo_codes_max_redemptions_per_org",
        ),
    )
    op.create_index("ix_promo_codes_active", "promo_codes", ["active"])

    op.create_table(
        "promo_redemptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("promo_code_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "subscription_request_id", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column("code_snapshot", sa.String(length=32), nullable=False),
        sa.Column("discount_idr", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'applied'"),
        ),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["promo_code_id"],
            ["promo_codes.id"],
            name="fk_promo_redemptions_promo",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name="fk_promo_redemptions_org",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["invoice_id"],
            ["org_invoices.id"],
            name="fk_promo_redemptions_invoice",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["subscription_request_id"],
            ["subscription_requests.id"],
            name="fk_promo_redemptions_request",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_promo_redemptions_created_by",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("invoice_id", name="uq_promo_redemptions_invoice"),
        sa.CheckConstraint(
            "code_snapshot = upper(code_snapshot)", name="ck_promo_redemptions_code_upper"
        ),
        sa.CheckConstraint(
            "discount_idr > 0", name="ck_promo_redemptions_discount"
        ),
        sa.CheckConstraint(
            "status IN ('applied', 'released')", name="ck_promo_redemptions_status"
        ),
        sa.CheckConstraint(
            "(status = 'released') = (released_at IS NOT NULL)",
            name="ck_promo_redemptions_released",
        ),
    )
    op.create_index(
        "ix_promo_redemptions_code_org_status",
        "promo_redemptions",
        ["promo_code_id", "organization_id", "status"],
    )
    op.create_index(
        "ix_promo_redemptions_org_created",
        "promo_redemptions",
        ["organization_id", "created_at"],
    )
    op.create_index(
        "uq_promo_redemption_request",
        "promo_redemptions",
        ["subscription_request_id"],
        unique=True,
        postgresql_where=sa.text("subscription_request_id IS NOT NULL"),
        sqlite_where=sa.text("subscription_request_id IS NOT NULL"),
    )

    op.create_table(
        "promo_code_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("promo_code_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("changes", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="fk_promo_code_history_actor",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(_ACTION_CHECK, name="ck_promo_code_history_action"),
    )
    op.create_index(
        "ix_promo_code_history_code_created",
        "promo_code_history",
        ["promo_code_id", "created_at"],
    )

    op.add_column(
        "org_invoices",
        sa.Column(
            "discount_idr",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "org_invoices", sa.Column("promo_code", sa.String(length=32), nullable=True)
    )
    op.create_check_constraint(
        "ck_org_invoices_promo_code_upper",
        "org_invoices",
        "promo_code IS NULL OR promo_code = upper(promo_code)",
    )
    op.create_check_constraint(
        "ck_org_invoices_discount",
        "org_invoices",
        "discount_idr >= 0 AND discount_idr <= amount_idr",
    )

    # The new total invariant includes the discount; make sure every existing
    # row already satisfied the un-discounted form before we lock it in.
    bind = op.get_bind()
    bad_numbers = (
        bind.execute(
            sa.text(
                "SELECT number FROM org_invoices "
                "WHERE total_idr <> amount_idr + ppn_idr"
            )
        )
        .scalars()
        .all()
    )
    if bad_numbers:
        raise RuntimeError(
            "promo_v1 cannot add ck_org_invoices_total: existing invoices violate "
            f"total_idr = amount_idr + ppn_idr: {', '.join(map(str, bad_numbers))}"
        )
    op.create_check_constraint(
        "ck_org_invoices_total",
        "org_invoices",
        "total_idr = amount_idr - discount_idr + ppn_idr",
    )

    op.add_column(
        "subscription_requests",
        sa.Column("promo_code", sa.String(length=32), nullable=True),
    )
    op.create_check_constraint(
        "ck_subscription_request_promo_code_upper",
        "subscription_requests",
        "promo_code IS NULL OR promo_code = upper(promo_code)",
    )

def downgrade() -> None:
    op.drop_constraint(
        "ck_subscription_request_promo_code_upper",
        "subscription_requests",
        type_="check",
    )
    op.drop_column("subscription_requests", "promo_code")

    op.drop_constraint("ck_org_invoices_total", "org_invoices", type_="check")
    op.drop_constraint("ck_org_invoices_discount", "org_invoices", type_="check")
    op.drop_constraint(
        "ck_org_invoices_promo_code_upper", "org_invoices", type_="check"
    )
    op.drop_column("org_invoices", "promo_code")
    op.drop_column("org_invoices", "discount_idr")

    op.drop_index(
        "ix_promo_code_history_code_created", table_name="promo_code_history"
    )
    op.drop_table("promo_code_history")

    op.drop_index("uq_promo_redemption_request", table_name="promo_redemptions")
    op.drop_index(
        "ix_promo_redemptions_org_created", table_name="promo_redemptions"
    )
    op.drop_index(
        "ix_promo_redemptions_code_org_status", table_name="promo_redemptions"
    )
    op.drop_table("promo_redemptions")

    op.drop_index("ix_promo_codes_active", table_name="promo_codes")
    op.drop_table("promo_codes")
