"""Audit trail for HPP settings (``hpp_setting_history``).

Covers the two PUT writers (rate + overhead), the idempotence rule (an
identical amount writes nothing), the read endpoint (filters, ordering,
pagination, auth) and the transactional coupling with the setting update.
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.hpp import HppOverhead, HppRate
from app.models.hpp_history import HppSettingHistory
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.auth import get_current_admin as _get_current_admin
from app.services.auth import get_current_user as _get_current_user
from app.services.hpp import record_setting_change

API_HEADERS = {"X-API-Key": settings.api_key}


async def _history_rows(db_session) -> list[HppSettingHistory]:
    result = await db_session.execute(
        select(HppSettingHistory).order_by(
            HppSettingHistory.created_at.asc(), HppSettingHistory.id.asc()
        )
    )
    return list(result.scalars().all())


async def _history_count(db_session) -> int:
    return int(
        (
            await db_session.execute(select(func.count(HppSettingHistory.id)))
        ).scalar()
        or 0
    )


async def _create_user_with_token(db_session, email: str, is_admin: bool = False):
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("TestPass1"),
        is_verified=True,
        is_admin=is_admin,
        credits=100,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    token = create_access_token(
        user_id=str(user.id), email=user.email, is_admin=user.is_admin
    )
    return user, token


@pytest.fixture
def admin_auth_client(db_session):
    """TestClient with only get_db overridden; the admin dependency is real."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(_get_current_user, None)
    app.dependency_overrides.pop(_get_current_admin, None)
    app.middleware_stack = None

    from fastapi.testclient import TestClient

    class _AdminAuthClient(TestClient):
        def request(self, method, url, **kwargs):
            headers = kwargs.get("headers", {})
            if "x-api-key" not in {k.lower() for k in headers}:
                headers["X-API-Key"] = settings.api_key
                kwargs["headers"] = headers
            return super().request(method, url, **kwargs)

        def get(self, *args, **kwargs):
            return self.request("GET", *args, **kwargs)

        def put(self, *args, **kwargs):
            return self.request("PUT", *args, **kwargs)

    with _AdminAuthClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_rate_update_records_previous_and_new(client, db_session):
    db_session.add(HppRate(key="ip", amount_idr=1000, updated_at=datetime.now(UTC)))
    await db_session.commit()

    resp = client.put(
        "/api/admin/hpp/ip", json={"amount_idr": 1500}, headers=API_HEADERS
    )
    assert resp.status_code == 200

    rows = await _history_rows(db_session)
    assert len(rows) == 1
    row = rows[0]
    assert row.scope == "rate"
    assert row.key == "ip"
    assert row.amount_from == 1000
    assert row.amount_to == 1500
    assert row.actor_user_id is not None


@pytest.mark.asyncio
async def test_identical_rate_amount_writes_no_history(client, db_session):
    db_session.add(HppRate(key="ip", amount_idr=1500, updated_at=datetime.now(UTC)))
    await db_session.commit()

    first = client.put(
        "/api/admin/hpp/ip", json={"amount_idr": 2500}, headers=API_HEADERS
    )
    assert first.status_code == 200
    second = client.put(
        "/api/admin/hpp/ip", json={"amount_idr": 2500}, headers=API_HEADERS
    )
    assert second.status_code == 200

    rows = await _history_rows(db_session)
    assert len(rows) == 1
    assert (rows[0].amount_from, rows[0].amount_to) == (1500, 2500)


@pytest.mark.asyncio
async def test_new_rate_key_has_null_previous_amount(client, db_session):
    resp = client.put(
        "/api/admin/hpp/domain", json={"amount_idr": 2500}, headers=API_HEADERS
    )
    assert resp.status_code == 200

    rows = await _history_rows(db_session)
    assert len(rows) == 1
    assert rows[0].scope == "rate"
    assert rows[0].key == "domain"
    assert rows[0].amount_from is None
    assert rows[0].amount_to == 2500


@pytest.mark.asyncio
async def test_overhead_records_one_row_and_skips_identical_amount(
    client, db_session
):
    created = client.put(
        "/api/admin/hpp/overhead", json={"amount_idr": 5000}, headers=API_HEADERS
    )
    assert created.status_code == 200

    rows = await _history_rows(db_session)
    assert len(rows) == 1
    assert rows[0].scope == "overhead"
    assert rows[0].key is None
    assert rows[0].amount_from is None
    assert rows[0].amount_to == 5000

    same = client.put(
        "/api/admin/hpp/overhead", json={"amount_idr": 5000}, headers=API_HEADERS
    )
    assert same.status_code == 200
    assert len(await _history_rows(db_session)) == 1

    changed = client.put(
        "/api/admin/hpp/overhead", json={"amount_idr": 7500}, headers=API_HEADERS
    )
    assert changed.status_code == 200
    rows = await _history_rows(db_session)
    assert len(rows) == 2
    assert (rows[1].amount_from, rows[1].amount_to) == (5000, 7500)


@pytest.mark.asyncio
async def test_overhead_row_created_only_once(client, db_session):
    assert (
        await db_session.execute(
            select(HppOverhead).where(HppOverhead.id == 1)
        )
    ).scalar_one_or_none() is None

    resp = client.put(
        "/api/admin/hpp/overhead", json={"amount_idr": 1000}, headers=API_HEADERS
    )
    assert resp.status_code == 200

    overhead = (
        await db_session.execute(select(HppOverhead).where(HppOverhead.id == 1))
    ).scalar_one()
    assert overhead.amount_idr == 1000
    rows = await _history_rows(db_session)
    assert len(rows) == 1
    assert rows[0].amount_from is None


@pytest.mark.asyncio
async def test_history_endpoint_filters_orders_and_paginates(client, db_session):
    actor, _ = await _create_user_with_token(db_session, "history-actor@example.com")
    now = datetime.now(UTC)
    db_session.add_all(
        [
            HppSettingHistory(
                id=uuid.uuid4(),
                scope="rate",
                key="ip",
                amount_from=None,
                amount_to=100,
                actor_user_id=actor.id,
                created_at=now - timedelta(minutes=3),
            ),
            HppSettingHistory(
                id=uuid.uuid4(),
                scope="rate",
                key="domain",
                amount_from=100,
                amount_to=200,
                created_at=now - timedelta(minutes=2),
            ),
            HppSettingHistory(
                id=uuid.uuid4(),
                scope="rate",
                key="apk",
                amount_from=200,
                amount_to=300,
                created_at=now - timedelta(minutes=1),
            ),
        ]
    )
    await db_session.commit()

    all_rates = client.get(
        "/api/admin/hpp/history?scope=rate", headers=API_HEADERS
    )
    assert all_rates.status_code == 200
    body = all_rates.json()
    assert body["total"] == 3
    assert [item["key"] for item in body["items"]] == ["apk", "domain", "ip"]
    assert body["items"][2]["actor_email"] == "history-actor@example.com"
    assert body["items"][1]["actor_email"] is None

    by_key = client.get(
        "/api/admin/hpp/history?scope=rate&key=domain", headers=API_HEADERS
    )
    assert by_key.status_code == 200
    assert by_key.json()["total"] == 1
    assert by_key.json()["items"][0]["key"] == "domain"

    overhead_only = client.get(
        "/api/admin/hpp/history?scope=overhead", headers=API_HEADERS
    )
    assert overhead_only.status_code == 200
    assert overhead_only.json()["items"] == []
    assert overhead_only.json()["total"] == 0

    page_one = client.get(
        "/api/admin/hpp/history?scope=rate&page=1&page_size=2", headers=API_HEADERS
    )
    assert page_one.status_code == 200
    assert page_one.json()["total"] == 3
    assert page_one.json()["page_size"] == 2
    assert len(page_one.json()["items"]) == 2
    assert [item["key"] for item in page_one.json()["items"]] == ["apk", "domain"]

    page_two = client.get(
        "/api/admin/hpp/history?scope=rate&page=2&page_size=2", headers=API_HEADERS
    )
    assert page_two.status_code == 200
    assert page_two.json()["total"] == 3
    assert [item["key"] for item in page_two.json()["items"]] == ["ip"]


def test_history_endpoint_rejects_invalid_scope(client):
    resp = client.get("/api/admin/hpp/history?scope=bogus", headers=API_HEADERS)
    assert resp.status_code == 400


def test_history_non_admin_returns_403(admin_auth_client, db_session):
    _user, token = asyncio.get_event_loop().run_until_complete(
        _create_user_with_token(db_session, "regular-hpp-history@example.com")
    )
    resp = admin_auth_client.get(
        "/api/admin/hpp/history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


def test_history_anonymous_returns_401(admin_auth_client):
    resp = admin_auth_client.get("/api/admin/hpp/history")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_invalid_key_returns_400_and_writes_no_history(client, db_session):
    resp = client.put(
        "/api/admin/hpp/uptime", json={"amount_idr": 1}, headers=API_HEADERS
    )
    assert resp.status_code == 400
    assert await _history_count(db_session) == 0


@pytest.mark.asyncio
async def test_history_row_rolls_back_with_caller_transaction(db_session):
    await record_setting_change(
        db_session,
        scope="rate",
        key="ip",
        amount_from=100,
        amount_to=200,
        actor_id=None,
    )
    await db_session.flush()
    assert await _history_count(db_session) == 1
    await db_session.rollback()
    assert await _history_count(db_session) == 0
