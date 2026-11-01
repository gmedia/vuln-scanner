from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_gateway import (
    AiModel,
    AiProvider,
    AiReservation,
    AiUsageEvent,
    AiWallet,
    AiWalletLedger,
)
from app.models.organization import Organization
from app.models.user import User


async def _provider(db: AsyncSession) -> AiProvider:
    provider = AiProvider(name="OR", base_url="https://example.com/v1", credential_enc="x")
    db.add(provider)
    await db.flush()
    return provider


async def _org(db: AsyncSession) -> Organization:
    user = User(
        id=uuid.uuid4(),
        email=f"pricing-{uuid.uuid4().hex[:8]}@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=10,
    )
    db.add(user)
    await db.flush()
    org = Organization(
        id=uuid.uuid4(),
        name="Pricing Org",
        slug=f"pricing-{uuid.uuid4().hex[:8]}",
        kind="hotel",
        created_by_user_id=user.id,
    )
    db.add(org)
    await db.flush()
    return org


@pytest.mark.asyncio
async def test_legacy_model_keeps_usd_columns_null(db_session: AsyncSession) -> None:
    provider = await _provider(db_session)
    model = AiModel(
        provider_id=provider.id,
        public_id=f"legacy/{uuid.uuid4().hex[:8]}",
        upstream_id="legacy",
        price_idr_per_1k_in=1000,
        price_idr_per_1k_out=2000,
        hpp_usd_per_1k_in=1,
        hpp_usd_per_1k_out=2,
    )
    db_session.add(model)
    await db_session.commit()
    await db_session.refresh(model)

    assert model.price_idr_per_1k_in == 1000
    assert model.price_idr_per_1k_out == 2000
    assert model.price_usd_per_1m_in is None
    assert model.price_usd_per_1m_out is None
    assert model.hpp_usd_per_1m_in is None
    assert model.hpp_usd_per_1m_out is None


@pytest.mark.asyncio
async def test_model_usd_prices_round_trip_as_decimal(db_session: AsyncSession) -> None:
    provider = await _provider(db_session)
    model = AiModel(
        provider_id=provider.id,
        public_id=f"usd/{uuid.uuid4().hex[:8]}",
        upstream_id="usd",
        price_usd_per_1m_in=Decimal("0.15"),
        price_usd_per_1m_out=Decimal("0.60"),
        hpp_usd_per_1m_in=Decimal("0.075"),
        hpp_usd_per_1m_out=Decimal("0.30"),
    )
    db_session.add(model)
    await db_session.commit()
    await db_session.refresh(model)

    assert model.price_usd_per_1m_in == Decimal("0.15")
    assert model.price_usd_per_1m_out == Decimal("0.60")
    assert model.hpp_usd_per_1m_in == Decimal("0.075")
    assert model.hpp_usd_per_1m_out == Decimal("0.30")
    assert isinstance(model.price_usd_per_1m_in, Decimal)
    assert isinstance(model.hpp_usd_per_1m_in, Decimal)


@pytest.mark.asyncio
async def test_reservation_snapshot_columns_round_trip(db_session: AsyncSession) -> None:
    org = await _org(db_session)
    reservation = AiReservation(
        organization_id=org.id,
        hold_idr=500,
        model_public_id="openai/gpt-4o-mini",
        price_usd_per_1m_in=Decimal("0.15"),
        price_usd_per_1m_out=Decimal("0.60"),
        hpp_usd_per_1m_in=Decimal("0.10"),
        hpp_usd_per_1m_out=Decimal("0.40"),
        fx_rate=Decimal("16300.123456"),
        fx_source="manual",
        fx_effective_date=date.today(),
        prompt_tokens_est=120,
        completion_tokens_max=800,
    )
    db_session.add(reservation)
    await db_session.commit()
    await db_session.refresh(reservation)

    assert reservation.model_public_id == "openai/gpt-4o-mini"
    assert reservation.fx_rate == Decimal("16300.123456")
    assert reservation.fx_source == "manual"
    assert reservation.fx_effective_date == date.today()
    assert reservation.prompt_tokens_est == 120
    assert reservation.completion_tokens_max == 800


@pytest.mark.asyncio
async def test_usage_event_flags_default_to_false_and_zero(db_session: AsyncSession) -> None:
    event = AiUsageEvent(
        source="customer",
        model_public_id="sinexis/test",
        billed_idr=42,
        cogs_idr=7,
    )
    db_session.add(event)
    await db_session.commit()
    await db_session.refresh(event)

    assert event.shortfall_idr == 0
    assert event.usage_missing is False
    assert event.billed_estimated is False
    assert event.billed_usd is None
    assert event.cogs_usd is None


@pytest.mark.asyncio
async def test_wallet_ledger_round_trip_and_kind_check(db_session: AsyncSession) -> None:
    org = await _org(db_session)
    db_session.add(AiWallet(organization_id=org.id, balance_idr=10_000))
    await db_session.flush()

    entry = AiWalletLedger(
        organization_id=org.id,
        kind="topup",
        delta_idr=10_000,
        balance_after_idr=10_000,
        note="initial credit",
    )
    db_session.add(entry)
    await db_session.commit()
    await db_session.refresh(entry)

    assert entry.kind == "topup"
    assert entry.delta_idr == 10_000
    assert entry.balance_after_idr == 10_000
    assert entry.created_at is not None

    bogus = AiWalletLedger(
        organization_id=org.id,
        kind="bogus",
        delta_idr=1,
        balance_after_idr=1,
    )
    db_session.add(bogus)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # SQLite enforces CHECK constraints, so the insert above was rejected.
    constraint_names = {c.name for c in AiWalletLedger.__table__.constraints}
    assert "ck_ai_wallet_ledger_kind" in constraint_names


def test_usage_reservation_unique_index_exists() -> None:
    index_names = {idx.name for idx in AiUsageEvent.__table__.indexes}
    assert "uq_ai_usage_events_reservation_id" in index_names


def test_ledger_partial_unique_index_exists() -> None:
    index_names = {idx.name for idx in AiWalletLedger.__table__.indexes}
    assert "uq_ai_wallet_ledger_kind_reservation" in index_names
