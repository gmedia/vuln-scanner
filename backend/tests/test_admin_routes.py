import asyncio
import types
import uuid

import pytest
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.api_key import ApiKey
from app.models.credit_log import CreditLog
from app.models.pricing import PricingConfig
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.auth import get_current_admin as _get_current_admin
from app.services.auth import get_current_user as _get_current_user

API_HEADERS = {"X-API-Key": settings.api_key}


# ---------------------------------------------------------------------------
# Helper: monkeypatch db_session.execute to convert UUID params to hex
# so that text() SQL works on SQLite (which doesn't support UUID binding).
# This is needed because admin_routes.py:147-150 uses raw text() with UUID.
# ---------------------------------------------------------------------------


def _patch_db_for_uuid(db_session):
    """Monkeypatch db_session.execute to convert UUID values to hex strings.

    SQLite's DBAPI does not support UUID objects as bind parameters.
    The source code at admin_routes.py:147-150 passes a uuid.UUID to
    text() SQL which fails on SQLite.  This patch intercepts execute()
    calls and converts UUID values to their hex representation (32 chars,
    no dashes) which matches the UUIDType column storage format.
    """
    _original_execute = db_session.execute

    async def _patched_execute(self, statement, params=None, **kwargs):
        if isinstance(params, dict):
            params = {
                k: v.hex if isinstance(v, uuid.UUID) else v
                for k, v in params.items()
            }
        elif isinstance(params, list):
            params = [
                {
                    k: v.hex if isinstance(v, uuid.UUID) else v
                    for k, v in p.items()
                }
                if isinstance(p, dict) else p
                for p in params
            ]
        return await _original_execute(statement, params, **kwargs)

    db_session.execute = types.MethodType(_patched_execute, db_session)


# ---------------------------------------------------------------------------
# Fixture: wraps the standard `client` with X-API-Key header auto-injected.
# The `client` fixture bypasses get_current_admin via dependency override,
# but the ApiKeyMiddleware still checks for X-API-Key.
# ---------------------------------------------------------------------------



# ---------------------------------------------------------------------------
# Fixture: auth client that does NOT bypass get_current_admin (tests 403s).
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_auth_client(db_session):
    """TestClient with only get_db overridden; admin dependency is real."""

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

        def post(self, *args, **kwargs):
            return self.request("POST", *args, **kwargs)

        def get(self, *args, **kwargs):
            return self.request("GET", *args, **kwargs)

        def put(self, *args, **kwargs):
            return self.request("PUT", *args, **kwargs)

        def delete(self, *args, **kwargs):
            return self.request("DELETE", *args, **kwargs)

    with _AdminAuthClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helper: create a user with a token
# ---------------------------------------------------------------------------


async def _create_user_with_token(db_session, email, is_admin=False, credits=100):
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("TestPass1"),
        is_verified=True,
        is_admin=is_admin,
        credits=credits,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(
        user_id=str(user.id), email=user.email, is_admin=user.is_admin
    )
    return user, token


# ---------------------------------------------------------------------------
# GET /api/admin/stats
# ---------------------------------------------------------------------------


class TestAdminStats:
    def test_returns_stats_with_zeroes_when_empty(self, client):
        resp = client.get("/api/admin/stats", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_users"] >= 0
        assert data["total_scans"] == 0
        assert data["total_findings"] == 0
        assert data["credits_distributed"] == 0
        assert data["credits_used"] == 0

    @pytest.mark.asyncio
    async def test_returns_accurate_counts(self, client, db_session, sample_user):
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type="ip",
            target="10.0.0.1",
            status="completed",
            progress=100,
            user_id=sample_user.id,
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        finding = ScanFinding(
            id=uuid.uuid4(),
            job_id=job.id,
            severity="high",
            category="Network",
            title="Open port",
            description="SSH open",
        )
        db_session.add(finding)
        await db_session.commit()

        credit = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=50,
            type="credit",
            description="Admin grant",
        )
        deduct = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=10,
            type="deduct",
            description="Scan cost",
        )
        db_session.add_all([credit, deduct])
        await db_session.commit()

        resp = client.get("/api/admin/stats", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_users"] >= 1
        assert data["total_scans"] == 1
        assert data["total_findings"] == 1
        assert data["credits_distributed"] == 50
        assert data["credits_used"] == 10

    def test_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session):
        import asyncio

        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular@example.com", is_admin=False)
        )
        resp = admin_auth_client.get(
            "/api/admin/stats",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/admin/users
# ---------------------------------------------------------------------------


class TestAdminUsers:
    def test_returns_user_list(self, client):
        resp = client.get("/api/admin/users", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "users" in data
        assert "total" in data
        assert isinstance(data["users"], list)
        assert data["total"] >= 1

    def test_user_item_shape(self, client):
        resp = client.get("/api/admin/users", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["users"]) >= 1
        user = data["users"][0]
        assert "id" in user
        assert "email" in user
        assert "is_admin" in user
        assert "is_verified" in user
        assert "credits" in user
        assert "scan_count" in user
        assert "created_at" in user

    def test_pagination_defaults(self, client):
        resp = client.get("/api/admin/users", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["users"]) <= 20

    @pytest.mark.asyncio
    async def test_search_by_email(self, client, db_session):
        user2 = User(
            id=uuid.uuid4(),
            email="searchable@example.com",
            password_hash="fake-hash",
            is_verified=True,
            credits=50,
        )
        db_session.add(user2)
        await db_session.commit()

        resp = client.get("/api/admin/users?search=searchable", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        emails = [u["email"] for u in data["users"]]
        assert "searchable@example.com" in emails

    @pytest.mark.asyncio
    async def test_search_no_match(self, client, db_session):
        resp = client.get("/api/admin/users?search=nonexistent_xyz123", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["users"] == []

    def test_page_less_than_1_returns_422(self, client):
        resp = client.get("/api/admin/users?page=0", headers=API_HEADERS)
        assert resp.status_code == 422

    def test_page_size_exceeds_100_returns_422(self, client):
        resp = client.get("/api/admin/users?page_size=101", headers=API_HEADERS)
        assert resp.status_code == 422

    def test_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session):
        import asyncio

        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular2@example.com", is_admin=False)
        )
        resp = admin_auth_client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/admin/users/{user_id}
# ---------------------------------------------------------------------------


class TestAdminUserDetail:
    def test_returns_user_by_id(self, client, db_session, sample_user):
        resp = client.get(f"/api/admin/users/{sample_user.id}", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(sample_user.id)
        assert data["email"] == sample_user.email
        assert data["is_admin"] == sample_user.is_admin
        assert data["is_verified"] == sample_user.is_verified
        assert data["credits"] == sample_user.credits
        assert data["scan_count"] == 0

    def test_user_not_found_returns_404(self, client):
        fake_id = uuid.uuid4()
        resp = client.get(f"/api/admin/users/{fake_id}", headers=API_HEADERS)
        assert resp.status_code == 404
        assert resp.json()["detail"] == "User not found"

    def test_invalid_uuid_returns_422(self, client):
        resp = client.get("/api/admin/users/not-a-uuid", headers=API_HEADERS)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_includes_scan_count(self, client, db_session, sample_user):
        job1 = ScanJob(
            id=uuid.uuid4(),
            scan_type="ip",
            target="10.0.0.1",
            status="completed",
            progress=100,
            user_id=sample_user.id,
        )
        job2 = ScanJob(
            id=uuid.uuid4(),
            scan_type="domain",
            target="example.com",
            status="completed",
            progress=100,
            user_id=sample_user.id,
        )
        db_session.add_all([job1, job2])
        await db_session.commit()

        resp = client.get(f"/api/admin/users/{sample_user.id}", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["scan_count"] == 2

    def test_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session, sample_user):
        import asyncio

        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular3@example.com", is_admin=False)
        )
        resp = admin_auth_client.get(
            f"/api/admin/users/{sample_user.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/admin/users/{user_id}/credits
# ---------------------------------------------------------------------------


class TestAdminCredits:
    def test_credit_user_success(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        old_credits = sample_user.credits
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 25, "description": "Bonus credits"}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["credits"] == old_credits + 25
        assert data["id"] == str(sample_user.id)
        assert "email" in data
        assert "scan_count" in data

    def test_deduct_user_success(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        old_credits = sample_user.credits
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": -30, "description": "Manual deduction"}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["credits"] == old_credits - 30

    def test_user_not_found_returns_404(self, client):
        fake_id = uuid.uuid4()
        resp = client.post(
            f"/api/admin/users/{fake_id}/credits",
            json={"amount": 10, "description": "Grant"}, headers=API_HEADERS)
        assert resp.status_code == 404

    def test_deduct_exceeds_balance_returns_400(self, client, db_session, sample_user):
        sample_user.credits = 10
        asyncio.get_event_loop().run_until_complete(db_session.commit())

        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": -50, "description": "Overdraft attempt"}, headers=API_HEADERS)
        assert resp.status_code == 400
        assert "insufficient" in resp.json()["detail"].lower()

    def test_missing_amount_returns_422(self, client, sample_user):
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"description": "No amount"}, headers=API_HEADERS)
        assert resp.status_code == 422

    def test_invalid_amount_type_returns_422(self, client, sample_user):
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": "not-a-number", "description": "Bad input"}, headers=API_HEADERS)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_creates_credit_log_on_grant(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 42, "description": "Test grant"}, headers=API_HEADERS)
        assert resp.status_code == 200

        result = await db_session.execute(
            select(CreditLog).where(CreditLog.user_id == sample_user.id)
        )
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].amount == 42
        assert logs[0].type == "credit"
        assert logs[0].description == "Test grant"

    @pytest.mark.asyncio
    async def test_creates_credit_log_on_deduction(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": -15, "description": "Test deduction"}, headers=API_HEADERS)
        assert resp.status_code == 200

        result = await db_session.execute(
            select(CreditLog).where(CreditLog.user_id == sample_user.id)
        )
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].amount == 15  # abs value stored
        assert logs[0].type == "deduct"
        assert logs[0].description == "Test deduction"

    def test_default_description(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        old_credits = sample_user.credits
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 5}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["credits"] == old_credits + 5

    def test_credit_with_zero_amount(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        old_credits = sample_user.credits
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 0, "description": "Zero adjustment"}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["credits"] == old_credits

    @pytest.mark.asyncio
    async def test_credit_log_description_stored(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 77, "description": "Custom description here"}, headers=API_HEADERS)
        assert resp.status_code == 200

        result = await db_session.execute(
            select(CreditLog).where(CreditLog.user_id == sample_user.id)
        )
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].description == "Custom description here"

    def test_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session, sample_user):
        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular4@example.com", is_admin=False)
        )
        resp = admin_auth_client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 10, "description": "Unauthorized grant"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/admin/pricing
# ---------------------------------------------------------------------------


class TestAdminPricing:
    def test_returns_pricing_list_empty(self, client):
        resp = client.get("/api/admin/pricing", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    @pytest.mark.asyncio
    async def test_returns_existing_pricing(self, client, db_session):
        pricing = PricingConfig(
            id=uuid.uuid4(),
            scan_type="ip",
            credit_cost=10,
        )
        db_session.add(pricing)
        await db_session.commit()

        resp = client.get("/api/admin/pricing", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["scan_type"] == "ip"
        assert data["items"][0]["credit_cost"] == 10

    @pytest.mark.asyncio
    async def test_pricing_ordered_by_scan_type(self, client, db_session):
        pricing_domain = PricingConfig(
            id=uuid.uuid4(),
            scan_type="domain",
            credit_cost=2,
        )
        pricing_ip = PricingConfig(
            id=uuid.uuid4(),
            scan_type="ip",
            credit_cost=1,
        )
        db_session.add_all([pricing_domain, pricing_ip])
        await db_session.commit()

        resp = client.get("/api/admin/pricing", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["items"][0]["scan_type"] == "domain"
        assert data["items"][1]["scan_type"] == "ip"

    def test_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session):
        import asyncio

        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular5@example.com", is_admin=False)
        )
        resp = admin_auth_client.get(
            "/api/admin/pricing",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PUT /api/admin/pricing/{scan_type}
# ---------------------------------------------------------------------------


class TestAdminUpdatePricing:
    def test_update_existing_pricing(self, client, db_session):
        import asyncio

        async def setup():
            pricing = PricingConfig(
                id=uuid.uuid4(),
                scan_type="ip",
                credit_cost=5,
            )
            db_session.add(pricing)
            await db_session.commit()
            return pricing

        asyncio.get_event_loop().run_until_complete(setup())

        resp = client.put(
            "/api/admin/pricing/ip",
            json={"credit_cost": 15}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["scan_type"] == "ip"
        assert data["credit_cost"] == 15

    def test_create_new_pricing(self, client):
        resp = client.put(
            "/api/admin/pricing/apk",
            json={"credit_cost": 8}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["scan_type"] == "apk"
        assert data["credit_cost"] == 8

    def test_invalid_scan_type_returns_400(self, client):
        resp = client.put(
            "/api/admin/pricing/invalid_type",
            json={"credit_cost": 5}, headers=API_HEADERS)
        assert resp.status_code == 400
        assert "invalid scan type" in resp.json()["detail"].lower()

    def test_negative_cost_returns_422(self, client):
        resp = client.put(
            "/api/admin/pricing/ip",
            json={"credit_cost": -1}, headers=API_HEADERS)
        assert resp.status_code == 422

    def test_missing_cost_returns_422(self, client):
        resp = client.put(
            "/api/admin/pricing/ip",
            json={}, headers=API_HEADERS)
        assert resp.status_code == 422

    def test_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session):
        import asyncio

        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular6@example.com", is_admin=False)
        )
        resp = admin_auth_client.put(
            "/api/admin/pricing/ip",
            json={"credit_cost": 10},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/keys  (admin-only endpoint from key_routes.py)
# ---------------------------------------------------------------------------


class TestAdminListKeys:
    def test_returns_keys_list(self, client):
        resp = client.get("/api/keys", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "keys" in data
        assert isinstance(data["keys"], list)

    def test_key_item_shape(self, client):
        # Generate a key so there's something to list
        client.post(
            "/api/keys/generate",
            json={"name": "shape-test", "rate_limit": 10},
            headers=API_HEADERS)
        resp = client.get("/api/keys", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["keys"]) >= 1
        key = data["keys"][0]
        assert "id" in key
        assert "name" in key
        assert "is_active" in key
        assert "rate_limit" in key
        assert "created_at" in key
        # Plain-text key should NOT be exposed in list (None = hidden)
        assert key.get("key") is None

    def test_empty_keys_list(self, client):
        resp = client.get("/api/keys", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["keys"] == []

    def test_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session):
        import asyncio

        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular7@example.com", is_admin=False)
        )
        resp = admin_auth_client.get(
            "/api/keys",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /api/keys/{key_id}  (admin-only endpoint from key_routes.py)
# ---------------------------------------------------------------------------


class TestAdminDeleteKey:
    def test_delete_key_success(self, client, db_session):
        import asyncio

        async def setup():
            api_key = ApiKey(
                id=uuid.uuid4(),
                key_hash="abc123hash",
                name="to-delete",
                is_active=True,
                rate_limit=10,
            )
            db_session.add(api_key)
            await db_session.commit()
            await db_session.refresh(api_key)
            return api_key

        key = asyncio.get_event_loop().run_until_complete(setup())

        resp = client.delete(f"/api/keys/{key.id}", headers=API_HEADERS)
        assert resp.status_code == 204

    def test_delete_nonexistent_key_returns_404(self, client):
        resp = client.delete("/api/keys/00000000-0000-0000-0000-000000000000", headers=API_HEADERS)
        assert resp.status_code == 404

    def test_delete_invalid_uuid_returns_404(self, client):
        resp = client.delete("/api/keys/not-a-uuid", headers=API_HEADERS)
        assert resp.status_code == 404

    def test_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session):
        import asyncio

        async def setup():
            api_key = ApiKey(
                id=uuid.uuid4(),
                key_hash="xyz789hash",
                name="unauth-delete",
                is_active=True,
                rate_limit=10,
            )
            db_session.add(api_key)
            await db_session.commit()
            return api_key

        key = asyncio.get_event_loop().run_until_complete(setup())
        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular8@example.com", is_admin=False)
        )
        resp = admin_auth_client.delete(
            f"/api/keys/{key.id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
