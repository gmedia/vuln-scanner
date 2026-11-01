"""AI pricing in USD per 1M tokens, with daily FX snapshots.

Revision ID: add_ai_pricing_usd
Revises: add_ai_fx_rates
Create Date: 2026-11-01

Schema + backfill only. Legacy IDR columns stay authoritative for this release;
the new USD columns are nullable and are populated from the newest FX rate at or
before today (falling back to ``AI_USD_IDR`` when no FX row exists yet).
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "add_ai_pricing_usd"
down_revision: str | None = "add_ai_fx_rates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    env_rate = os.environ.get("AI_USD_IDR", "16000")

    # 1. ai_models — USD per 1M token prices (nullable until backfilled).
    op.add_column("ai_models", sa.Column("price_usd_per_1m_in", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_models", sa.Column("price_usd_per_1m_out", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_models", sa.Column("hpp_usd_per_1m_in", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_models", sa.Column("hpp_usd_per_1m_out", sa.Numeric(18, 6), nullable=True))
    op.create_check_constraint(
        "ck_ai_models_price_usd_in_nonnegative",
        "ai_models",
        "price_usd_per_1m_in IS NULL OR price_usd_per_1m_in >= 0",
    )
    op.create_check_constraint(
        "ck_ai_models_price_usd_out_nonnegative",
        "ai_models",
        "price_usd_per_1m_out IS NULL OR price_usd_per_1m_out >= 0",
    )
    op.create_check_constraint(
        "ck_ai_models_hpp_usd_in_nonnegative",
        "ai_models",
        "hpp_usd_per_1m_in IS NULL OR hpp_usd_per_1m_in >= 0",
    )
    op.create_check_constraint(
        "ck_ai_models_hpp_usd_out_nonnegative",
        "ai_models",
        "hpp_usd_per_1m_out IS NULL OR hpp_usd_per_1m_out >= 0",
    )

    # 2. ai_reservations — quote snapshot used when the hold was placed.
    op.add_column("ai_reservations", sa.Column("model_public_id", sa.String(length=128), nullable=True))
    op.add_column("ai_reservations", sa.Column("price_usd_per_1m_in", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_reservations", sa.Column("price_usd_per_1m_out", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_reservations", sa.Column("hpp_usd_per_1m_in", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_reservations", sa.Column("hpp_usd_per_1m_out", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_reservations", sa.Column("fx_rate", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_reservations", sa.Column("fx_source", sa.String(length=64), nullable=True))
    op.add_column("ai_reservations", sa.Column("fx_effective_date", sa.Date(), nullable=True))
    op.add_column("ai_reservations", sa.Column("prompt_tokens_est", sa.Integer(), nullable=True))
    op.add_column("ai_reservations", sa.Column("completion_tokens_max", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_ai_reservations_fx_rate_positive",
        "ai_reservations",
        "fx_rate IS NULL OR fx_rate > 0",
    )

    # 3. ai_usage_events — audit snapshot and settlement flags.
    op.add_column("ai_usage_events", sa.Column("billed_usd", sa.Numeric(24, 12), nullable=True))
    op.add_column("ai_usage_events", sa.Column("cogs_usd", sa.Numeric(24, 12), nullable=True))
    op.add_column("ai_usage_events", sa.Column("fx_rate", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_usage_events", sa.Column("fx_source", sa.String(length=64), nullable=True))
    op.add_column("ai_usage_events", sa.Column("fx_effective_date", sa.Date(), nullable=True))
    op.add_column("ai_usage_events", sa.Column("price_usd_per_1m_in", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_usage_events", sa.Column("price_usd_per_1m_out", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_usage_events", sa.Column("hpp_usd_per_1m_in", sa.Numeric(18, 6), nullable=True))
    op.add_column("ai_usage_events", sa.Column("hpp_usd_per_1m_out", sa.Numeric(18, 6), nullable=True))
    op.add_column(
        "ai_usage_events",
        sa.Column("shortfall_idr", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "ai_usage_events",
        sa.Column("usage_missing", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "ai_usage_events",
        sa.Column("billed_estimated", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_check_constraint(
        "ck_ai_usage_events_shortfall_nonnegative",
        "ai_usage_events",
        "shortfall_idr >= 0",
    )
    op.create_check_constraint(
        "ck_ai_usage_events_amounts_nonnegative",
        "ai_usage_events",
        "billed_idr >= 0 AND cogs_idr >= 0",
    )
    op.create_index(
        "uq_ai_usage_events_reservation_id",
        "ai_usage_events",
        ["reservation_id"],
        unique=True,
    )
    op.create_index(
        "ix_ai_usage_events_provider_request",
        "ai_usage_events",
        ["provider_id", "provider_request_id"],
    )

    # 4. ai_wallet_ledger — append-only IDR ledger.
    op.create_table(
        "ai_wallet_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("delta_idr", sa.Integer(), nullable=False),
        sa.Column("balance_after_idr", sa.Integer(), nullable=False),
        sa.Column("reservation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("usage_event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("note", sa.String(length=256), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('topup','reserve','settle_adjust','release','manual_adjust')",
            name="ck_ai_wallet_ledger_kind",
        ),
        sa.CheckConstraint("balance_after_idr >= 0", name="ck_ai_wallet_ledger_balance_nonnegative"),
        sa.ForeignKeyConstraint(["organization_id"], ["ai_wallets.organization_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reservation_id"], ["ai_reservations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["usage_event_id"], ["ai_usage_events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_wallet_ledger_organization_id",
        "ai_wallet_ledger",
        ["organization_id"],
    )
    op.create_index(
        "uq_ai_wallet_ledger_kind_reservation",
        "ai_wallet_ledger",
        ["kind", "reservation_id"],
        unique=True,
        postgresql_where=sa.text("reservation_id IS NOT NULL"),
        sqlite_where=sa.text("reservation_id IS NOT NULL"),
    )

    # 5. Backfill ai_models from the newest rate at or before today.
    op.get_bind().execute(
        sa.text(
            """
            WITH picked AS (
              SELECT rate FROM ai_fx_rates
              WHERE base = 'USD' AND quote = 'IDR' AND effective_date <= CURRENT_DATE
              ORDER BY effective_date DESC, fetched_at DESC
              LIMIT 1
            ), chosen AS (
              SELECT COALESCE((SELECT rate FROM picked), :env_rate) AS rate
            )
            UPDATE ai_models
            SET price_usd_per_1m_in  = ROUND(price_idr_per_1k_in  * 1000.0 / c.rate, 6),
                price_usd_per_1m_out = ROUND(price_idr_per_1k_out * 1000.0 / c.rate, 6),
                hpp_usd_per_1m_in    = hpp_usd_per_1k_in  * 1000.0,
                hpp_usd_per_1m_out   = hpp_usd_per_1k_out * 1000.0,
                updated_at = now()
            FROM chosen c
            WHERE price_usd_per_1m_in IS NULL OR price_usd_per_1m_out IS NULL
               OR hpp_usd_per_1m_in IS NULL OR hpp_usd_per_1m_out IS NULL
            """
        ),
        {"env_rate": env_rate},
    )

    # 6. Legacy rows: record the rate that was implicitly in use.
    op.get_bind().execute(
        sa.text("UPDATE ai_usage_events SET fx_rate = :env_rate, fx_source = 'legacy_env' WHERE fx_rate IS NULL"),
        {"env_rate": env_rate},
    )
    op.get_bind().execute(
        sa.text("UPDATE ai_reservations SET fx_rate = :env_rate, fx_source = 'legacy_env' WHERE fx_rate IS NULL"),
        {"env_rate": env_rate},
    )


def downgrade() -> None:
    # Indexes first.
    op.drop_index("ix_ai_usage_events_provider_request", table_name="ai_usage_events")
    op.drop_index("uq_ai_usage_events_reservation_id", table_name="ai_usage_events")
    op.drop_index("uq_ai_wallet_ledger_kind_reservation", table_name="ai_wallet_ledger")
    op.drop_index("ix_ai_wallet_ledger_organization_id", table_name="ai_wallet_ledger")

    # Ledger table (constraints and FKs go with it).
    op.drop_table("ai_wallet_ledger")

    # ai_usage_events.
    op.drop_constraint("ck_ai_usage_events_amounts_nonnegative", "ai_usage_events", type_="check")
    op.drop_constraint("ck_ai_usage_events_shortfall_nonnegative", "ai_usage_events", type_="check")
    for column in (
        "billed_estimated",
        "usage_missing",
        "shortfall_idr",
        "hpp_usd_per_1m_out",
        "hpp_usd_per_1m_in",
        "price_usd_per_1m_out",
        "price_usd_per_1m_in",
        "fx_effective_date",
        "fx_source",
        "fx_rate",
        "cogs_usd",
        "billed_usd",
    ):
        op.drop_column("ai_usage_events", column)

    # ai_reservations.
    op.drop_constraint("ck_ai_reservations_fx_rate_positive", "ai_reservations", type_="check")
    for column in (
        "completion_tokens_max",
        "prompt_tokens_est",
        "fx_effective_date",
        "fx_source",
        "fx_rate",
        "hpp_usd_per_1m_out",
        "hpp_usd_per_1m_in",
        "price_usd_per_1m_out",
        "price_usd_per_1m_in",
        "model_public_id",
    ):
        op.drop_column("ai_reservations", column)

    # ai_models.
    op.drop_constraint("ck_ai_models_hpp_usd_out_nonnegative", "ai_models", type_="check")
    op.drop_constraint("ck_ai_models_hpp_usd_in_nonnegative", "ai_models", type_="check")
    op.drop_constraint("ck_ai_models_price_usd_out_nonnegative", "ai_models", type_="check")
    op.drop_constraint("ck_ai_models_price_usd_in_nonnegative", "ai_models", type_="check")
    for column in (
        "hpp_usd_per_1m_out",
        "hpp_usd_per_1m_in",
        "price_usd_per_1m_out",
        "price_usd_per_1m_in",
    ):
        op.drop_column("ai_models", column)
