"""AI wallet top-up v1 (S1): order/pack tables, wallet credit idempotency.

Revision ID: ai_topup_v1_s1
Revises: ai_usage_latency_details
Create Date: 2026-11-07

Adds the prepaid top-up catalog and order tables, links ``payment_attempts`` and
``ai_wallet_ledger`` to an order, and widens accumulating IDR columns to
``BIGINT``. No pack rows are seeded: prices are an owner/finance decision.

The ledger partial unique index is scoped to ``kind = 'topup'`` so a refund row
(the clawback for the same order) can coexist with the single credit row.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "ai_topup_v1_s1"
down_revision: str | None = "ai_usage_latency_details"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PACK_CHECKS = (
    ("ck_ai_topup_packs_amount_positive", "amount_idr > 0"),
    ("ck_ai_topup_packs_bonus_nonnegative", "bonus_idr >= 0"),
)

ORDER_CHECKS = (
    ("ck_ai_topup_orders_amount_nonnegative", "amount_idr >= 0"),
    ("ck_ai_topup_orders_credit_positive", "credit_idr > 0"),
    ("ck_ai_topup_orders_bonus_nonnegative", "bonus_idr >= 0"),
    ("ck_ai_topup_orders_credit_balance", "credit_idr = amount_idr + bonus_idr"),
    ("ck_ai_topup_orders_currency_idr", "currency = 'IDR'"),
    (
        "ck_ai_topup_orders_payment_method",
        "payment_method IN ('manual_transfer', 'midtrans', 'admin_credit')",
    ),
    (
        "ck_ai_topup_orders_status",
        "status IN ('pending_payment', 'awaiting_verification', 'paid', 'rejected', "
        "'expired', 'canceled', 'refunded', 'refund_review')",
    ),
    (
        "ck_ai_topup_orders_proof_required",
        "status <> 'awaiting_verification' OR proof_object_key IS NOT NULL",
    ),
    (
        "ck_ai_topup_orders_admin_credit_amount_zero",
        "payment_method <> 'admin_credit' OR amount_idr = 0",
    ),
    (
        "ck_ai_topup_orders_admin_credit_bonus_equals_credit",
        "payment_method <> 'admin_credit' OR bonus_idr = credit_idr",
    ),
    (
        "ck_ai_topup_orders_paid_amount_positive",
        "payment_method = 'admin_credit' OR amount_idr > 0",
    ),
)

PAYMENT_ATTEMPT_CHECKS = (
    ("ck_payment_attempt_payable_kind", "payable_kind IN ('invoice', 'topup')"),
    (
        "ck_payment_attempt_invoice_required",
        "payable_kind <> 'invoice' OR invoice_id IS NOT NULL",
    ),
    (
        "ck_payment_attempt_topup_required",
        "payable_kind <> 'topup' OR topup_order_id IS NOT NULL",
    ),
    (
        "ck_payment_attempt_payable_exclusive",
        "NOT (invoice_id IS NOT NULL AND topup_order_id IS NOT NULL)",
    ),
)

LEDGER_KINDS_WITH_REFUND = (
    "kind IN ('topup', 'reserve', 'settle_adjust', 'release', 'manual_adjust', 'opening', 'refund')"
)
LEDGER_KINDS_WITHOUT_REFUND = "kind IN ('topup', 'reserve', 'settle_adjust', 'release', 'manual_adjust', 'opening')"


def upgrade() -> None:
    op.create_table(
        "ai_topup_packs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("label", sa.String(length=64), nullable=False),
        sa.Column("amount_idr", sa.BigInteger(), nullable=False),
        sa.Column("bonus_idr", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_ai_topup_packs_code"),
        *[sa.CheckConstraint(expression, name=name) for name, expression in PACK_CHECKS],
    )

    op.create_table(
        "ai_topup_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pack_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("pack_code", sa.String(length=32), nullable=True),
        sa.Column("reference_code", sa.String(length=32), nullable=False),
        sa.Column("amount_idr", sa.BigInteger(), nullable=False),
        sa.Column("credit_idr", sa.BigInteger(), nullable=False),
        sa.Column("bonus_idr", sa.BigInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="IDR"),
        sa.Column("payment_method", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending_payment"),
        sa.Column("proof_object_key", sa.String(length=512), nullable=True),
        sa.Column("proof_mime", sa.String(length=64), nullable=True),
        sa.Column("proof_size_bytes", sa.Integer(), nullable=True),
        sa.Column("proof_uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bank_ref", sa.String(length=64), nullable=True),
        sa.Column("verified_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.String(length=255), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pack_id"], ["ai_topup_packs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["verified_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reference_code", name="uq_ai_topup_orders_reference_code"),
        *[sa.CheckConstraint(expression, name=name) for name, expression in ORDER_CHECKS],
    )
    op.create_index("ix_ai_topup_orders_organization_id", "ai_topup_orders", ["organization_id"])
    op.create_index(
        "ix_ai_topup_orders_org_created",
        "ai_topup_orders",
        ["organization_id", sa.text("created_at DESC")],
    )
    op.create_index("ix_ai_topup_orders_status_created", "ai_topup_orders", ["status", "created_at"])

    with op.batch_alter_table("payment_attempts") as batch_op:
        batch_op.add_column(sa.Column("topup_order_id", postgresql.UUID(as_uuid=True), nullable=True))
        batch_op.add_column(sa.Column("payable_kind", sa.String(length=10), nullable=False, server_default="invoice"))
        batch_op.create_foreign_key(
            "fk_payment_attempts_topup_order",
            "ai_topup_orders",
            ["topup_order_id"],
            ["id"],
            ondelete="SET NULL",
        )
        for name, expression in PAYMENT_ATTEMPT_CHECKS:
            batch_op.create_check_constraint(name, expression)
        batch_op.create_index("ix_payment_attempts_topup_order_id", ["topup_order_id"])
        batch_op.create_index(
            "uq_payment_attempt_pending_topup",
            ["topup_order_id"],
            unique=True,
            postgresql_where=sa.text("status = 'pending' AND topup_order_id IS NOT NULL"),
            sqlite_where=sa.text("status = 'pending' AND topup_order_id IS NOT NULL"),
        )
        batch_op.alter_column(
            "amount_idr",
            existing_type=sa.Integer(),
            type_=sa.BigInteger(),
            existing_nullable=False,
            existing_server_default="0",
        )
        batch_op.alter_column(
            "refunded_amount_idr",
            existing_type=sa.Integer(),
            type_=sa.BigInteger(),
            existing_nullable=False,
            existing_server_default=sa.text("0"),
        )

    with op.batch_alter_table("ai_wallet_ledger") as batch_op:
        batch_op.add_column(sa.Column("topup_order_id", postgresql.UUID(as_uuid=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_ai_wallet_ledger_topup_order",
            "ai_topup_orders",
            ["topup_order_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.drop_constraint("ck_ai_wallet_ledger_kind", type_="check")
        batch_op.create_check_constraint("ck_ai_wallet_ledger_kind", LEDGER_KINDS_WITH_REFUND)
        batch_op.create_index(
            "uq_ai_wallet_ledger_topup_order",
            ["topup_order_id"],
            unique=True,
            postgresql_where=sa.text("kind = 'topup' AND topup_order_id IS NOT NULL"),
            sqlite_where=sa.text("kind = 'topup' AND topup_order_id IS NOT NULL"),
        )
        batch_op.alter_column(
            "delta_idr",
            existing_type=sa.Integer(),
            type_=sa.BigInteger(),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "balance_after_idr",
            existing_type=sa.Integer(),
            type_=sa.BigInteger(),
            existing_nullable=False,
        )

    with op.batch_alter_table("ai_wallets") as batch_op:
        batch_op.alter_column(
            "balance_idr",
            existing_type=sa.Integer(),
            type_=sa.BigInteger(),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("ai_wallets") as batch_op:
        batch_op.alter_column(
            "balance_idr",
            existing_type=sa.BigInteger(),
            type_=sa.Integer(),
            existing_nullable=False,
        )

    with op.batch_alter_table("ai_wallet_ledger") as batch_op:
        batch_op.alter_column(
            "balance_after_idr",
            existing_type=sa.BigInteger(),
            type_=sa.Integer(),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "delta_idr",
            existing_type=sa.BigInteger(),
            type_=sa.Integer(),
            existing_nullable=False,
        )
        batch_op.drop_index("uq_ai_wallet_ledger_topup_order")
        batch_op.drop_constraint("ck_ai_wallet_ledger_kind", type_="check")
        batch_op.create_check_constraint("ck_ai_wallet_ledger_kind", LEDGER_KINDS_WITHOUT_REFUND)
        batch_op.drop_constraint("fk_ai_wallet_ledger_topup_order", type_="foreignkey")
        batch_op.drop_column("topup_order_id")

    with op.batch_alter_table("payment_attempts") as batch_op:
        batch_op.alter_column(
            "refunded_amount_idr",
            existing_type=sa.BigInteger(),
            type_=sa.Integer(),
            existing_nullable=False,
            existing_server_default=sa.text("0"),
        )
        batch_op.alter_column(
            "amount_idr",
            existing_type=sa.BigInteger(),
            type_=sa.Integer(),
            existing_nullable=False,
            existing_server_default="0",
        )
        batch_op.drop_index("uq_payment_attempt_pending_topup")
        batch_op.drop_index("ix_payment_attempts_topup_order_id")
        for name, _expression in reversed(PAYMENT_ATTEMPT_CHECKS):
            batch_op.drop_constraint(name, type_="check")
        batch_op.drop_constraint("fk_payment_attempts_topup_order", type_="foreignkey")
        batch_op.drop_column("payable_kind")
        batch_op.drop_column("topup_order_id")

    op.drop_index("ix_ai_topup_orders_status_created", table_name="ai_topup_orders")
    op.drop_index("ix_ai_topup_orders_org_created", table_name="ai_topup_orders")
    op.drop_index("ix_ai_topup_orders_organization_id", table_name="ai_topup_orders")
    op.drop_table("ai_topup_orders")
    op.drop_table("ai_topup_packs")
