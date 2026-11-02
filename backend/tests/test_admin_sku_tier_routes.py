from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.invoice import SkuCatalog
from app.models.organization import Organization
from app.models.sku_tier import SkuTier
from app.models.user import User
from app.services.auth import create_access_token, hash_password


async def _make_user(db: AsyncSession, email: str, *, is_admin: bool = False) -> User:
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


def _prices(scan: int = 500_000) -> dict[str, dict[str, object]]:
    return {
        product: {"list_idr": scan + index * 100_000, "invoicable": True}
        for index, product in enumerate(("scan", "host", "uptime", "guard"))
    }


def _payload(code: str = "pro_plus", rank: int = 10, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "code": code,
        "label": code.replace("_", " ").title(),
        "rank": rank,
        "limit_scan": 5,
        "limit_host": 5,
        "limit_uptime": 60,
        "limit_guard": 5,
        "bundle_idr": 1_500_000,
        "allow_status_page": True,
        "allow_waf_protect": True,
        "prices": _prices(),
    }
    body.update(overrides)
    return body


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    admin = await _make_user(db_session, "sku-admin@example.com", is_admin=True)
    regular = await _make_user(db_session, "sku-regular@example.com")
    return {"admin": admin, "regular": regular}


@pytest.mark.asyncio
async def test_create_tier_writes_four_catalog_rows(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload()
            )
            assert response.status_code == 201, response.text
            body = response.json()
            assert body["code"] == "pro_plus"
            assert body["has_catalog"] is True
            assert body["usage"] == {"orgs": 0, "subscriptions": 0, "invoices": 0, "requests": 0}

            rows = (
                await db_session.execute(select(SkuCatalog).where(SkuCatalog.sku == "pro_plus"))
            ).scalars().all()
            assert len(rows) == 4
            by_product = {row.product: row for row in rows}
            assert by_product["scan"].seats == 5
            assert by_product["uptime"].seats == 60
            assert by_product["host"].list_idr == 600_000
            assert all(row.invoicable for row in rows)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_sales_led_tier_has_no_catalog(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = _payload("quoted", rank=11, sales_led=True, prices=None)
            response = await client.post("/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=body)
            assert response.status_code == 201, response.text
            data = response.json()
            assert data["sales_led"] is True
            assert data["requestable"] is False
            assert data["features"]["allow_siem"] is True
            assert data["features"]["billing_unrestricted"] is True
            assert data["has_catalog"] is False

            count = await db_session.scalar(
                select(func.count()).select_from(SkuCatalog).where(SkuCatalog.sku == "quoted")
            )
            assert count == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_duplicate_code_conflict(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload(rank=12)
            )
            assert first.status_code == 201
            second = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload(rank=13)
            )
            assert second.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_duplicate_rank_conflict(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload("tier_a", rank=14)
            )
            assert first.status_code == 201
            second = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload("tier_b", rank=14)
            )
            assert second.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_ignores_code_and_keeps_it_immutable(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.patch(
                "/api/admin/sku-tiers/pro",
                headers=_auth(ctx["admin"]),
                json={"code": "renamed", "label": "Pro X"},
            )
            assert response.status_code == 200, response.text
            assert response.json()["code"] == "pro"
            assert response.json()["label"] == "Pro X"

            listed = await client.get("/api/admin/sku-tiers", headers=_auth(ctx["admin"]))
            codes = {tier["code"] for tier in listed.json()}
            assert "pro" in codes
            assert "renamed" not in codes
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_default_move_keeps_exactly_one_default(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/sku-tiers",
                headers=_auth(ctx["admin"]),
                json=_payload("new_default", rank=15, is_default=True),
            )
            assert created.status_code == 201, created.text
            assert created.json()["is_default"] is True

            listed = await client.get("/api/admin/sku-tiers", headers=_auth(ctx["admin"]))
            defaults = [tier for tier in listed.json() if tier["is_default"]]
            assert [tier["code"] for tier in defaults] == ["new_default"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_deactivate_and_reactivate_tier(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            off = await client.post("/api/admin/sku-tiers/pro/deactivate", headers=_auth(ctx["admin"]))
            assert off.status_code == 200
            assert off.json()["active"] is False
            on = await client.post("/api/admin/sku-tiers/pro/reactivate", headers=_auth(ctx["admin"]))
            assert on.status_code == 200
            assert on.json()["active"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_default_tier_cannot_be_deactivated_or_deleted(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            off = await client.post("/api/admin/sku-tiers/basic/deactivate", headers=_auth(ctx["admin"]))
            assert off.status_code == 409
            deleted = await client.delete("/api/admin/sku-tiers/basic", headers=_auth(ctx["admin"]))
            assert deleted.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_in_use_reports_per_table_counts(db_session, ctx):
    db_session.add(
        Organization(
            id=uuid.uuid4(),
            name="Usage Org",
            slug=f"usage-{uuid.uuid4().hex[:8]}",
            kind="company",
            sku="pro",
            created_by_user_id=ctx["admin"].id,
        )
    )
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete("/api/admin/sku-tiers/pro", headers=_auth(ctx["admin"]))
            assert response.status_code == 409
            detail = response.json()["detail"]
            assert "orgs=1" in detail
            assert "subscriptions=0" in detail
            assert "invoices=0" in detail
            assert "requests=0" in detail
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_unused_tier_cascades_catalog(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload("unused", rank=16)
            )
            assert created.status_code == 201
            deleted = await client.delete("/api/admin/sku-tiers/unused", headers=_auth(ctx["admin"]))
            assert deleted.status_code == 204
            assert await db_session.get(SkuTier, "unused") is None
            count = await db_session.scalar(
                select(func.count()).select_from(SkuCatalog).where(SkuCatalog.sku == "unused")
            )
            assert count == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reactivate_rejects_rank_that_is_now_taken(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            off = await client.post("/api/admin/sku-tiers/pro/deactivate", headers=_auth(ctx["admin"]))
            assert off.status_code == 200
            await db_session.execute(text("DROP INDEX uq_sku_tiers_rank"))
            await db_session.execute(update(SkuTier).where(SkuTier.code == "multi").values(rank=2))
            await db_session.commit()
            on = await client.post("/api/admin/sku-tiers/pro/reactivate", headers=_auth(ctx["admin"]))
            assert on.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_non_admin_is_forbidden(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/admin/sku-tiers", headers=_auth(ctx["regular"]))
            assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_rate_limit_returns_429(db_session, ctx, monkeypatch):
    import app.api.admin_sku_tier_routes as routes

    monkeypatch.setattr(routes.admin_limiter, "max_requests", 2)
    monkeypatch.setattr(routes.admin_limiter, "window_seconds", 3600)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for _ in range(2):
                response = await client.get("/api/admin/sku-tiers", headers=_auth(ctx["admin"]))
                assert response.status_code == 200
            limited = await client.get("/api/admin/sku-tiers", headers=_auth(ctx["admin"]))
            assert limited.status_code == 429
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cross_field_validation_rejects_inconsistent_tiers(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            bad_custom_host = await client.post(
                "/api/admin/sku-tiers",
                headers=_auth(ctx["admin"]),
                json=_payload("bad_custom", rank=17, allow_custom_host=True, allow_status_page=False),
            )
            assert bad_custom_host.status_code == 400

            bad_siem = await client.post(
                "/api/admin/sku-tiers",
                headers=_auth(ctx["admin"]),
                json=_payload("bad_siem", rank=18, allow_siem=True),
            )
            assert bad_siem.status_code == 400

            bad_billing = await client.post(
                "/api/admin/sku-tiers",
                headers=_auth(ctx["admin"]),
                json=_payload("bad_billing", rank=19, billing_unrestricted=True),
            )
            assert bad_billing.status_code == 400

            missing_prices = await client.post(
                "/api/admin/sku-tiers",
                headers=_auth(ctx["admin"]),
                json=_payload("no_prices", rank=20, prices=None),
            )
            assert missing_prices.status_code == 400

            bad_code = await client.post(
                "/api/admin/sku-tiers",
                headers=_auth(ctx["admin"]),
                json=_payload("BadCode", rank=21),
            )
            assert bad_code.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_syncs_prices_and_missing_catalog_rows(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload("sync_me", rank=22)
            )
            assert created.status_code == 201

            await db_session.execute(
                delete(SkuCatalog).where(
                    SkuCatalog.product == "host",
                    SkuCatalog.sku == "sync_me",
                )
            )
            await db_session.commit()

            response = await client.patch(
                "/api/admin/sku-tiers/sync_me",
                headers=_auth(ctx["admin"]),
                json={
                    "limit_scan": 9,
                    "prices": {"host": {"list_idr": 123_000, "invoicable": False}},
                },
            )
            assert response.status_code == 200, response.text

            scan = await db_session.get(SkuCatalog, ("scan", "sync_me"))
            host = await db_session.get(SkuCatalog, ("host", "sync_me"))
            assert scan is not None and host is not None
            assert scan.seats == 9
            assert host.seats == 5
            assert host.list_idr == 123_000
            assert host.invoicable is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_switches_sales_led_and_back(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload("flip", rank=23)
            )
            assert created.status_code == 201

            to_sales_led = await client.patch(
                "/api/admin/sku-tiers/flip",
                headers=_auth(ctx["admin"]),
                json={"sales_led": True},
            )
            assert to_sales_led.status_code == 200, to_sales_led.text
            assert to_sales_led.json()["sales_led"] is True
            assert to_sales_led.json()["requestable"] is False
            count = await db_session.scalar(
                select(func.count()).select_from(SkuCatalog).where(SkuCatalog.sku == "flip")
            )
            assert count == 0

            missing_prices = await client.patch(
                "/api/admin/sku-tiers/flip",
                headers=_auth(ctx["admin"]),
                json={"sales_led": False},
            )
            assert missing_prices.status_code == 400

            back = await client.patch(
                "/api/admin/sku-tiers/flip",
                headers=_auth(ctx["admin"]),
                json={"sales_led": False, "requestable": True, "prices": _prices()},
            )
            assert back.status_code == 200, back.text
            assert back.json()["sales_led"] is False
            count = await db_session.scalar(
                select(func.count()).select_from(SkuCatalog).where(SkuCatalog.sku == "flip")
            )
            assert count == 4
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_duplicate_rank_conflict(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload("rank_a", rank=24)
            )
            second = await client.post(
                "/api/admin/sku-tiers", headers=_auth(ctx["admin"]), json=_payload("rank_b", rank=25)
            )
            assert first.status_code == 201 and second.status_code == 201
            conflict = await client.patch(
                "/api/admin/sku-tiers/rank_b",
                headers=_auth(ctx["admin"]),
                json={"rank": 24},
            )
            assert conflict.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_unknown_tier_returns_404(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            patched = await client.patch(
                "/api/admin/sku-tiers/missing", headers=_auth(ctx["admin"]), json={"label": "X"}
            )
            assert patched.status_code == 404
            deleted = await client.delete("/api/admin/sku-tiers/missing", headers=_auth(ctx["admin"]))
            assert deleted.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_includes_inactive_tiers_with_usage_and_catalog_flag(db_session, ctx):
    tier = await db_session.get(SkuTier, "multi")
    assert tier is not None
    tier.active = False
    await db_session.commit()
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/admin/sku-tiers", headers=_auth(ctx["admin"]))
            assert response.status_code == 200
            rows = {row["code"]: row for row in response.json()}
            assert rows["multi"]["active"] is False
            assert rows["multi"]["has_catalog"] is True
            assert set(rows["multi"]["usage"]) == {"orgs", "subscriptions", "invoices", "requests"}
    finally:
        app.dependency_overrides.clear()
