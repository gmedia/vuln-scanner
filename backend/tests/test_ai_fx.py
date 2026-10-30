from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base
from app.models.ai_gateway import AiFxRate
from app.services.ai_fx import (
    FX_BASE,
    FX_QUOTE,
    FxFetchError,
    effective_rate,
    fetch_rate,
    history,
    parse_rate_payload,
    set_manual,
    source_label,
    upsert_rate,
    upsert_rate_sync,
)

FRANKFURTER_PAYLOAD = {
    "amount": 1.0,
    "base": "USD",
    "date": "2026-10-30",
    "rates": {"IDR": 16300.5},
}
ER_API_PAYLOAD = {
    "result": "success",
    "base_code": "USD",
    "rates": {"IDR": 16250.25},
    "time_last_update_unix": 1793318400,
}


def test_parse_rate_payload_frankfurter_shape() -> None:
    rate, effective_date = parse_rate_payload(FRANKFURTER_PAYLOAD)

    assert rate == Decimal("16300.5")
    assert effective_date == date(2026, 10, 30)


def test_parse_rate_payload_open_er_api_shape_uses_today() -> None:
    rate, effective_date = parse_rate_payload(ER_API_PAYLOAD)

    assert rate == Decimal("16250.25")
    assert effective_date == datetime.now(UTC).date()


@pytest.mark.parametrize(
    "payload",
    [
        {"base": "USD", "date": "2026-10-30"},
        {"base": "USD", "date": "2026-10-30", "rates": {"EUR": 0.91}},
        {"base": "USD", "date": "2026-10-30", "rates": {"IDR": "not-a-number"}},
        {"base": "USD", "date": "2026-10-30", "rates": {"IDR": 0}},
        {"base": "USD", "date": "2026-10-30", "rates": {"IDR": -5}},
    ],
)
def test_parse_rate_payload_rejects_unusable_idr(payload: dict[str, object]) -> None:
    with pytest.raises(FxFetchError):
        parse_rate_payload(payload)


def test_parse_rate_payload_rejects_non_object_rates() -> None:
    with pytest.raises(FxFetchError):
        parse_rate_payload({"date": "2026-10-30", "rates": ["16300"]})


@pytest.mark.asyncio
async def test_fetch_rate_reads_json_through_injected_client() -> None:
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, json=FRANKFURTER_PAYLOAD)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    rate, effective_date = await fetch_rate("https://fx.invalid/latest", client=client)

    assert rate == Decimal("16300.5")
    assert effective_date == date(2026, 10, 30)
    assert seen == ["https://fx.invalid/latest"]
    assert client.is_closed is False
    await client.aclose()


@pytest.mark.asyncio
async def test_fetch_rate_raises_fetch_error_on_500_without_leaking_url() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    with pytest.raises(FxFetchError) as excinfo:
        await fetch_rate("https://secret-fx-host.invalid/latest?token=abc", client=client)

    assert "secret-fx-host.invalid" not in str(excinfo.value)
    assert "token" not in str(excinfo.value)
    await client.aclose()


@pytest.mark.asyncio
async def test_fetch_rate_raises_fetch_error_on_non_json_body() -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>nope</html>")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    with pytest.raises(FxFetchError):
        await fetch_rate("https://fx.invalid/latest", client=client)
    await client.aclose()


def test_source_label_uses_hostname_or_auto() -> None:
    assert source_label("https://api.frankfurter.app/latest?from=USD&to=IDR") == "api.frankfurter.app"
    assert source_label("not a url") == "auto"


@pytest.mark.asyncio
async def test_upsert_rate_same_date_keeps_one_row_with_newer_values(db_session) -> None:
    day = date(2026, 10, 30)

    first = await upsert_rate(db_session, rate=Decimal("16000"), source="api", effective_date=day)
    second = await upsert_rate(db_session, rate=Decimal("16300.25"), source="manual", effective_date=day)

    count = await db_session.scalar(select(func.count()).select_from(AiFxRate))
    assert count == 1
    assert second.id == first.id
    assert second.rate == Decimal("16300.25")
    assert second.source == "manual"
    assert second.base == FX_BASE
    assert second.quote == FX_QUOTE


@pytest.mark.asyncio
async def test_set_manual_stores_manual_source_and_user(db_session, sample_user) -> None:
    row = await set_manual(db_session, rate=Decimal("16200"), user_id=sample_user.id)

    assert row.source == "manual"
    assert row.created_by == sample_user.id
    assert row.rate == Decimal("16200")
    assert row.effective_date == datetime.now(UTC).date()


@pytest.mark.asyncio
async def test_effective_rate_falls_back_to_env_then_uses_stored_row(db_session) -> None:
    fallback_rate, fallback_source, fallback_row = await effective_rate(db_session)
    assert fallback_rate == Decimal(settings.ai_usd_idr)
    assert fallback_source == "env"
    assert fallback_row is None

    stored = await upsert_rate(db_session, rate=Decimal("16123.75"), source="api", effective_date=date(2026, 10, 30))
    rate, source, row = await effective_rate(db_session)

    assert rate == Decimal("16123.75")
    assert source == "api"
    assert row is not None
    assert row.id == stored.id


@pytest.mark.asyncio
async def test_history_orders_by_effective_date_desc(db_session) -> None:
    for day, value in (
        (date(2026, 10, 28), "16000"),
        (date(2026, 10, 30), "16300"),
        (date(2026, 10, 29), "16100"),
    ):
        await upsert_rate(db_session, rate=Decimal(value), source="api", effective_date=day)

    rows = await history(db_session)

    assert [row.effective_date for row in rows] == [date(2026, 10, 30), date(2026, 10, 29), date(2026, 10, 28)]


@pytest.mark.asyncio
async def test_history_respects_limit(db_session) -> None:
    for offset in range(3):
        await upsert_rate(
            db_session,
            rate=Decimal("16000"),
            source="api",
            effective_date=date(2026, 10, 30 - offset),
        )

    rows = await history(db_session, limit=2)

    assert len(rows) == 2


@pytest.mark.asyncio
async def test_upsert_rate_accepts_none_user(db_session) -> None:
    row = await upsert_rate(
        db_session,
        rate=Decimal("16000"),
        source="api",
        effective_date=date(2026, 10, 30),
        user_id=None,
    )

    assert isinstance(row.id, uuid.UUID)
    assert row.created_by is None


def test_upsert_rate_sync_same_date_keeps_one_row_with_newer_values() -> None:
    day = date(2026, 10, 30)
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        first = upsert_rate_sync(session, rate=Decimal("16000"), source="api", effective_date=day)
        second = upsert_rate_sync(session, rate=Decimal("16350.75"), source="manual", effective_date=day)

        assert session.scalar(select(func.count()).select_from(AiFxRate)) == 1
        assert second.id == first.id
        assert second.rate == Decimal("16350.75")
        assert second.source == "manual"

    engine.dispose()
