import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

import sqlalchemy as sa
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.user import User

PROVIDER_STATUSES = ("ok", "degraded", "disabled")
RESERVATION_STATUSES = ("open", "settled", "released")
USAGE_SOURCES = ("customer", "admin_trial", "customer_trial")


class AiProvider(Base):
    __tablename__ = "ai_providers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    base_url: Mapped[str] = mapped_column(String(512), nullable=False)
    auth_header: Mapped[str] = mapped_column(String(64), nullable=False, default="Authorization")
    credential_enc: Mapped[str] = mapped_column(Text, nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ok")
    last_probed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    models: Mapped[list["AiModel"]] = relationship(back_populates="provider", passive_deletes=True)

    __table_args__ = (CheckConstraint(f"status IN {PROVIDER_STATUSES}", name="ck_ai_provider_status"),)


class AiModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_providers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    public_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    upstream_id: Mapped[str] = mapped_column(String(256), nullable=False)
    hpp_usd_per_1k_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hpp_usd_per_1k_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    price_idr_per_1k_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    price_idr_per_1k_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    price_usd_per_1m_in: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    price_usd_per_1m_out: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    hpp_usd_per_1m_in: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    hpp_usd_per_1m_out: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    max_ctx: Mapped[int] = mapped_column(Integer, nullable=False, default=8192)
    max_tokens_cap: Mapped[int] = mapped_column(Integer, nullable=False, default=4096)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    provider: Mapped[AiProvider] = relationship(back_populates="models")
    upstreams: Mapped[list["AiModelUpstream"]] = relationship(
        back_populates="model",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AiModelUpstream.rank",
    )

    __table_args__ = (
        CheckConstraint(
            "price_usd_per_1m_in IS NULL OR price_usd_per_1m_in >= 0",
            name="ck_ai_models_price_usd_in_nonnegative",
        ),
        CheckConstraint(
            "price_usd_per_1m_out IS NULL OR price_usd_per_1m_out >= 0",
            name="ck_ai_models_price_usd_out_nonnegative",
        ),
        CheckConstraint(
            "hpp_usd_per_1m_in IS NULL OR hpp_usd_per_1m_in >= 0",
            name="ck_ai_models_hpp_usd_in_nonnegative",
        ),
        CheckConstraint(
            "hpp_usd_per_1m_out IS NULL OR hpp_usd_per_1m_out >= 0",
            name="ck_ai_models_hpp_usd_out_nonnegative",
        ),
    )


class AiModelUpstream(Base):
    __tablename__ = "ai_model_upstreams"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_providers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    upstream_id: Mapped[str] = mapped_column(String(256), nullable=False)
    max_tokens_cap: Mapped[int | None] = mapped_column(Integer)
    hpp_usd_per_1m_in: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    hpp_usd_per_1m_out: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    model: Mapped[AiModel] = relationship(back_populates="upstreams")
    provider: Mapped[AiProvider] = relationship()  # no backref: keep ON DELETE CASCADE the only delete path

    __table_args__ = (
        UniqueConstraint("model_id", "rank", name="uq_ai_model_upstreams_model_rank"),
        UniqueConstraint(
            "model_id",
            "provider_id",
            "upstream_id",
            name="uq_ai_model_upstreams_target",
        ),
        CheckConstraint("rank >= 1", name="ck_ai_model_upstreams_rank_positive"),
        CheckConstraint(
            "max_tokens_cap IS NULL OR max_tokens_cap >= 1",
            name="ck_ai_model_upstreams_max_tokens_cap_positive",
        ),
        CheckConstraint(
            "hpp_usd_per_1m_in IS NULL OR hpp_usd_per_1m_in >= 0",
            name="ck_ai_model_upstreams_hpp_usd_in_nonnegative",
        ),
        CheckConstraint(
            "hpp_usd_per_1m_out IS NULL OR hpp_usd_per_1m_out >= 0",
            name="ck_ai_model_upstreams_hpp_usd_out_nonnegative",
        ),
    )


class AiApiKey(Base):
    __tablename__ = "ai_api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    prefix: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    rate_limit_rpm: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    rate_limit_tpm: Mapped[int] = mapped_column(Integer, nullable=False, default=100_000)
    max_concurrent: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    allowed_model_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    organization: Mapped["Organization"] = relationship()
    created_by: Mapped["User"] = relationship()


class AiWallet(Base):
    __tablename__ = "ai_wallets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    balance_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="IDR")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    organization: Mapped["Organization"] = relationship()


class AiWalletLedger(Base):
    __tablename__ = "ai_wallet_ledger"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_wallets.organization_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    delta_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    reservation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_reservations.id", ondelete="SET NULL"),
        nullable=True,
    )
    usage_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_usage_events.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    note: Mapped[str | None] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (
        CheckConstraint(
            "kind IN ('topup','reserve','settle_adjust','release','manual_adjust','opening')",
            name="ck_ai_wallet_ledger_kind",
        ),
        CheckConstraint("balance_after_idr >= 0", name="ck_ai_wallet_ledger_balance_nonnegative"),
        Index(
            "uq_ai_wallet_ledger_kind_reservation",
            "kind",
            "reservation_id",
            unique=True,
            postgresql_where=text("reservation_id IS NOT NULL"),
            sqlite_where=text("reservation_id IS NOT NULL"),
        ),
    )


class AiReservation(Base):
    __tablename__ = "ai_reservations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_api_keys.id", ondelete="SET NULL"),
        nullable=True,
    )
    model_public_id: Mapped[str | None] = mapped_column(String(128))
    price_usd_per_1m_in: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    price_usd_per_1m_out: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    hpp_usd_per_1m_in: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    hpp_usd_per_1m_out: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    fx_source: Mapped[str | None] = mapped_column(String(64))
    fx_effective_date: Mapped[date | None] = mapped_column(Date)
    prompt_tokens_est: Mapped[int | None] = mapped_column(Integer)
    completion_tokens_max: Mapped[int | None] = mapped_column(Integer)
    hold_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (
        CheckConstraint(f"status IN {RESERVATION_STATUSES}", name="ck_ai_reservation_status"),
        CheckConstraint("fx_rate IS NULL OR fx_rate > 0", name="ck_ai_reservations_fx_rate_positive"),
    )


class AiUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    key_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_api_keys.id", ondelete="SET NULL"),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    model_public_id: Mapped[str] = mapped_column(String(128), nullable=False)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_providers.id", ondelete="SET NULL"),
        nullable=True,
    )
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cached_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ttft_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    billed_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cogs_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    billed_usd: Mapped[Decimal | None] = mapped_column(Numeric(24, 12))
    cogs_usd: Mapped[Decimal | None] = mapped_column(Numeric(24, 12))
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    fx_source: Mapped[str | None] = mapped_column(String(64))
    fx_effective_date: Mapped[date | None] = mapped_column(Date)
    price_usd_per_1m_in: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    price_usd_per_1m_out: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    hpp_usd_per_1m_in: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    hpp_usd_per_1m_out: Mapped[Decimal | None] = mapped_column(Numeric(18, 6))
    shortfall_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    usage_missing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=sa.false())
    billed_estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=sa.false())
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    finish_reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    provider_request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reservation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_reservations.id", ondelete="SET NULL"),
        nullable=True,
    )
    request_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    response_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (
        CheckConstraint(f"source IN {USAGE_SOURCES}", name="ck_ai_usage_source"),
        CheckConstraint("shortfall_idr >= 0", name="ck_ai_usage_events_shortfall_nonnegative"),
        CheckConstraint(
            "billed_idr >= 0 AND cogs_idr >= 0",
            name="ck_ai_usage_events_amounts_nonnegative",
        ),
        Index("uq_ai_usage_events_reservation_id", "reservation_id", unique=True),
        Index("ix_ai_usage_events_provider_request", "provider_id", "provider_request_id"),
    )


class AiFxRate(Base):
    __tablename__ = "ai_fx_rates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    base: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    quote: Mapped[str] = mapped_column(String(3), nullable=False, default="IDR")
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("base", "quote", "effective_date", name="uq_ai_fx_rates_pair_date"),
        Index("ix_ai_fx_rates_pair_date", "base", "quote", "effective_date"),
    )
