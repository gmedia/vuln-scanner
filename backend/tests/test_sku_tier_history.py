from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.sku_tier_history import SkuTierHistory
from app.models.user import User
from app.schemas.sku_tier import SkuTierCreate, SkuTierUpdate
from app.services.auth import create_access_token, hash_password
from app.services.sku_tier import SkuTierService


def _prices(scan: int = 600_000) -> dict[str, dict[str, object]]:
    return {
        product: {"list_idr": scan + index * 100_000, "invoicable": True}
        for index, product in enumerate(("scan", "host", "uptime", "guard"))
    }

async def _make_user(db: AsyncSession, email: str, *, is_admin: bool = True) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=is_admin,
        credits=100,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

def _auth(user: User) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=None,
    )
    return {"Authorization": f"Bearer {token}"}

def _bind(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

@pytest_asyncio.fixture
async def admin(db_session: AsyncSession) -> User:
    return await _make_user(db_session, "history-admin@example.com")

async def _history_rows(db: AsyncSession, code: str) -> list[SkuTierHistory]:
    result = await db.execute(
        select(SkuTierHistory)
        .where(SkuTierHistory.sku_code == code)
        .order_by(SkuTierHistory.created_at.asc())
    )
    return list(result.scalars().all())

@pytest.mark.asyncio
async def test_create_records_price_fields_and_actor(db_session: AsyncSession, admin: User) -> None:
    await SkuTierService(db_session).create(
        SkuTierCreate(
            code="hist_pro",
            label="History Pro",
            rank=40,
            limit_scan=5,
            limit_host=5,
            limit_uptime=50,
            limit_guard=5,
            prices=_prices(),
        ),
        admin,
    )

    rows = await _history_rows(db_session, "hist_pro")
    assert len(rows) == 1
    row = rows[0]
    assert row.action == "created"
    assert row.actor_user_id == admin.id
    assert row.changes["label"] == {"from": None, "to": "History Pro"}
    assert row.changes["price.scan.list_idr"] == {"from": None, "to": 600_000}
    assert row.changes["price.guard.invoicable"] == {"from": None, "to": True}
    assert "allow_siem" not in row.changes

@pytest.mark.asyncio
async def test_update_records_only_changed_keys(db_session: AsyncSession, admin: User) -> None:
    await SkuTierService(db_session).update(
        "pro", SkuTierUpdate(label="Pro Plus", limit_scan=4), admin
    )

    rows = await _history_rows(db_session, "pro")
    assert len(rows) == 1
    row = rows[0]
    assert row.action == "updated"
    assert row.actor_user_id == admin.id
    assert set(row.changes) == {"label", "limit_scan"}
    assert row.changes["label"] == {"from": "Pro", "to": "Pro Plus"}
    assert row.changes["limit_scan"] == {"from": 3, "to": 4}

@pytest.mark.asyncio
async def test_noop_update_writes_no_history(db_session: AsyncSession, admin: User) -> None:
    await SkuTierService(db_session).update(
        "pro", SkuTierUpdate(label="Pro", limit_scan=3), admin
    )

    rows = await _history_rows(db_session, "pro")
    assert rows == []

@pytest.mark.asyncio
async def test_deactivate_and_reactivate_record_active_flip(db_session: AsyncSession, admin: User) -> None:
    service = SkuTierService(db_session)
    await service.deactivate("pro", admin)
    await service.reactivate("pro", admin)

    rows = await _history_rows(db_session, "pro")
    assert [row.action for row in rows] == ["deactivated", "reactivated"]
    assert rows[0].changes == {"active": {"from": True, "to": False}}
    assert rows[1].changes == {"active": {"from": False, "to": True}}

@pytest.mark.asyncio
async def test_delete_keeps_snapshot_history_and_endpoint_still_serves_it(
    db_session: AsyncSession, admin: User
) -> None:
    _bind(db_session)
    service = SkuTierService(db_session)
    await service.create(
        SkuTierCreate(
            code="hist_del",
            label="History Delete",
            rank=41,
            limit_scan=2,
            limit_host=2,
            limit_uptime=20,
            limit_guard=2,
            prices=_prices(700_000),
        ),
        admin,
    )
    await service.delete("hist_del", admin)

    rows = await _history_rows(db_session, "hist_del")
    assert [row.action for row in rows] == ["created", "deleted"]
    snapshot = rows[-1].changes
    assert snapshot["label"] == {"from": None, "to": "History Delete"}
    assert snapshot["price.scan.list_idr"] == {"from": None, "to": 700_000}

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/admin/sku-tiers/hist_del/history", headers=_auth(admin)
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert [item["action"] for item in body["items"]] == ["deleted", "created"]
    assert body["items"][0]["actor_email"] == admin.email

@pytest.mark.asyncio
async def test_price_put_records_only_changed_price_keys(
    db_session: AsyncSession, admin: User
) -> None:
    _bind(db_session)
    headers = {**_auth(admin), "X-E2E-Test": "true"}
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.put(
                "/api/admin/sku-catalog/scan/basic",
                headers=headers,
                json={"list_idr": 999_999, "invoicable": True},
            )
            assert first.status_code == 200, first.text
            second = await client.put(
                "/api/admin/sku-catalog/scan/basic",
                headers=headers,
                json={"list_idr": 999_999, "invoicable": True},
            )
            assert second.status_code == 200, second.text
    finally:
        app.dependency_overrides.clear()

    rows = await _history_rows(db_session, "basic")
    assert len(rows) == 1
    row = rows[0]
    assert row.action == "price_updated"
    assert row.actor_user_id == admin.id
    assert set(row.changes) == {"price.scan.list_idr"}
    assert row.changes["price.scan.list_idr"]["to"] == 999_999

@pytest.mark.asyncio
async def test_history_endpoint_paginates_and_orders_newest_first(
    db_session: AsyncSession, admin: User
) -> None:
    _bind(db_session)
    now = datetime.now(UTC)
    db_session.add_all(
        [
            SkuTierHistory(
                id=uuid.uuid4(),
                sku_code="pager",
                action="created",
                actor_user_id=admin.id,
                changes={"label": {"from": None, "to": "Pager"}},
                created_at=now - timedelta(minutes=1),
            ),
            SkuTierHistory(
                id=uuid.uuid4(),
                sku_code="pager",
                action="updated",
                actor_user_id=admin.id,
                changes={"label": {"from": "Pager", "to": "Pager 2"}},
                created_at=now,
            ),
        ]
    )
    await db_session.commit()

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/admin/sku-tiers/pager/history?page=1&page_size=1",
                headers=_auth(admin),
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert body["page"] == 1
    assert body["page_size"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["action"] == "updated"

@pytest.mark.asyncio
async def test_history_endpoint_rejects_non_admin_and_anonymous(
    db_session: AsyncSession,
) -> None:
    regular = await _make_user(db_session, "history-regular@example.com", is_admin=False)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            anonymous = await client.get("/api/admin/sku-tiers/basic/history")
            forbidden = await client.get(
                "/api/admin/sku-tiers/basic/history", headers=_auth(regular)
            )
    finally:
        app.dependency_overrides.clear()

    assert anonymous.status_code == 401
    assert forbidden.status_code == 403

@pytest.mark.asyncio
async def test_history_total_counts_rows_not_page(db_session: AsyncSession, admin: User) -> None:
    service = SkuTierService(db_session)
    for page_row in range(3):
        db_session.add(
            SkuTierHistory(
                sku_code="counter",
                action="updated",
                actor_user_id=admin.id,
                changes={"rank": {"from": page_row, "to": page_row + 1}},
            )
        )
    await db_session.flush()
    rows, total = await service.history("counter", page=1, page_size=2)

    assert total == 3
    assert len(rows) == 2
