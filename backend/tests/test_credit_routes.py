import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.credit_log import CreditLog
from app.models.pricing import PricingConfig
from app.models.user import User
from app.services.auth import get_current_user as _get_current_user

HEADERS = {"X-API-Key": settings.api_key}


# ---------------------------------------------------------------------------
# Helper: create a credit-specific TestClient that does NOT override
# get_current_user, so auth is real (Bearer token required).
# ---------------------------------------------------------------------------


@pytest.fixture
def credit_auth_client(db_session):
    """TestClient with only get_db overridden; auth dependencies are real."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(_get_current_user, None)
    app.middleware_stack = None

    from fastapi.testclient import TestClient

    class _CreditAuthClient(TestClient):
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

    with _CreditAuthClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# GET /api/credits/balance — happy path
# ---------------------------------------------------------------------------


class TestGetBalance:
    def test_returns_credits_and_admin_status(self, client):
        resp = client.get("/api/credits/balance", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "credits" in data
        assert "is_admin" in data
        assert isinstance(data["credits"], int)
        assert isinstance(data["is_admin"], bool)

    def test_returns_default_user_credits(self, client):
        """The client fixture creates a user with 100 credits."""
        resp = client.get("/api/credits/balance", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["credits"] == 100
        assert data["is_admin"] is False

    def test_unauthenticated_returns_401(self, credit_auth_client):
        resp = credit_auth_client.get("/api/credits/balance")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/credits/history — happy path + pagination + empty
# ---------------------------------------------------------------------------


class TestGetHistory:
    def test_empty_history_returns_zero_items(self, client):
        resp = client.get("/api/credits/history", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_history_with_entries(self, client, db_session, sample_user):
        """Insert credit log entries and verify they appear in history."""
        now = datetime.now(UTC).replace(tzinfo=None)
        log1 = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=10,
            type="credit",
            description="Signup bonus",
            created_at=now - timedelta(hours=2),
        )
        log2 = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=-1,
            type="deduct",
            description="IP scan cost",
            created_at=now - timedelta(hours=1),
        )
        db_session.add_all([log1, log2])
        await db_session.commit()

        resp = client.get("/api/credits/history", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2
        # Most recent first (desc order)
        assert data["items"][0]["type"] == "deduct"
        assert data["items"][1]["type"] == "credit"
        assert data["items"][0]["amount"] == -1
        assert data["items"][1]["amount"] == 10

    @pytest.mark.asyncio
    async def test_history_pagination_page_1(self, client, db_session, sample_user):
        """Insert 25 entries and verify first page returns 20 (default page_size)."""
        now = datetime.now(UTC).replace(tzinfo=None)
        for i in range(25):
            log = CreditLog(
                id=uuid.uuid4(),
                user_id=sample_user.id,
                amount=1,
                type="credit",
                description=f"Entry {i:02d}",
                created_at=now - timedelta(hours=25 - i),
            )
            db_session.add(log)
        await db_session.commit()

        resp = client.get("/api/credits/history", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 25
        assert len(data["items"]) == 20  # default page_size

    @pytest.mark.asyncio
    async def test_history_pagination_page_2(self, client, db_session, sample_user):
        """Insert 25 entries and verify second page returns 5 remaining items."""
        now = datetime.now(UTC).replace(tzinfo=None)
        for i in range(25):
            log = CreditLog(
                id=uuid.uuid4(),
                user_id=sample_user.id,
                amount=1,
                type="credit",
                description=f"Entry {i:02d}",
                created_at=now - timedelta(hours=25 - i),
            )
            db_session.add(log)
        await db_session.commit()

        resp = client.get("/api/credits/history?page=2", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 25
        assert len(data["items"]) == 5

    @pytest.mark.asyncio
    async def test_history_custom_page_size(self, client, db_session, sample_user):
        """Request a custom page_size and verify it is respected."""
        now = datetime.now(UTC).replace(tzinfo=None)
        for i in range(30):
            log = CreditLog(
                id=uuid.uuid4(),
                user_id=sample_user.id,
                amount=1,
                type="credit",
                description=f"Entry {i:02d}",
                created_at=now - timedelta(hours=30 - i),
            )
            db_session.add(log)
        await db_session.commit()

        resp = client.get("/api/credits/history?page_size=5", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 30
        assert len(data["items"]) == 5

    @pytest.mark.asyncio
    async def test_history_only_returns_own_entries(self, client, db_session, sample_user):
        """Verify history only returns entries for the authenticated user."""
        # Create another user with their own credit log
        other_user = User(
            id=uuid.uuid4(),
            email="other@example.com",
            password_hash="fake-hash",
            is_verified=True,
            credits=50,
        )
        db_session.add(other_user)
        await db_session.commit()
        await db_session.refresh(other_user)

        log_own = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=5,
            type="credit",
            description="Own credit",
        )
        log_other = CreditLog(
            id=uuid.uuid4(),
            user_id=other_user.id,
            amount=10,
            type="credit",
            description="Other user credit",
        )
        db_session.add_all([log_own, log_other])
        await db_session.commit()

        resp = client.get("/api/credits/history", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["description"] == "Own credit"

    def test_unauthenticated_returns_401(self, credit_auth_client):
        resp = credit_auth_client.get("/api/credits/history")
        assert resp.status_code == 401

    def test_history_page_less_than_1(self, client):
        resp = client.get("/api/credits/history?page=0", headers=HEADERS)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/credits/eligibility/{scan_type} — happy path + edge cases
# ---------------------------------------------------------------------------


class TestScanEligibility:
    def test_eligible_ip_scan(self, client):
        """User with 100 credits is eligible for IP scan (cost: 1)."""
        resp = client.get("/api/credits/eligibility/ip", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["eligible"] is True
        assert data["required_credits"] == 1
        assert data["current_credits"] == 100
        assert data["scan_type"] == "ip"

    def test_eligible_domain_scan(self, client):
        """User with 100 credits is eligible for domain scan (cost: 2)."""
        resp = client.get("/api/credits/eligibility/domain", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["eligible"] is True
        assert data["required_credits"] == 2
        assert data["scan_type"] == "domain"

    def test_eligible_apk_scan(self, client):
        """User with 100 credits is eligible for APK scan (cost: 3)."""
        resp = client.get("/api/credits/eligibility/apk", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["eligible"] is True
        assert data["required_credits"] == 3
        assert data["scan_type"] == "apk"

    def test_eligible_ipa_scan(self, client):
        """User with 100 credits is eligible for IPA scan (cost: 3)."""
        resp = client.get("/api/credits/eligibility/ipa", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["eligible"] is True
        assert data["required_credits"] == 3
        assert data["scan_type"] == "ipa"

    def test_insufficient_credits(self, client, db_session, sample_user):
        """User with insufficient credits is not eligible."""
        sample_user.credits = 0
        import asyncio
        asyncio.get_event_loop().run_until_complete(db_session.commit())

        resp = client.get("/api/credits/eligibility/apk", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["eligible"] is False
        assert data["required_credits"] == 3
        assert data["current_credits"] == 0

    def test_just_enough_credits(self, client, db_session, sample_user):
        """User with exactly the required credits is eligible."""
        sample_user.credits = 3
        import asyncio
        asyncio.get_event_loop().run_until_complete(db_session.commit())

        resp = client.get("/api/credits/eligibility/apk", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["eligible"] is True
        assert data["current_credits"] == 3
        assert data["required_credits"] == 3

    def test_invalid_scan_type_returns_400(self, client):
        resp = client.get("/api/credits/eligibility/invalid_scan", headers=HEADERS)
        assert resp.status_code == 400
        assert "invalid scan type" in resp.json()["detail"].lower()

    def test_unauthenticated_returns_401(self, credit_auth_client):
        resp = credit_auth_client.get("/api/credits/eligibility/ip")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_eligibility_with_db_pricing_override(self, client, db_session):
        """When PricingConfig exists in DB, it overrides the config default."""
        pricing = PricingConfig(
            id=uuid.uuid4(),
            scan_type="ip",
            credit_cost=10,
        )
        db_session.add(pricing)
        await db_session.commit()

        resp = client.get("/api/credits/eligibility/ip", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["required_credits"] == 10  # DB override, not config default of 1
        # User has 100 credits, so still eligible
        assert data["eligible"] is True
        assert data["current_credits"] == 100

    @pytest.mark.asyncio
    async def test_eligibility_db_override_insufficient(self, client, db_session, sample_user):
        """DB pricing override makes user ineligible when cost > credits."""
        pricing = PricingConfig(
            id=uuid.uuid4(),
            scan_type="domain",
            credit_cost=200,
        )
        db_session.add(pricing)
        await db_session.commit()

        resp = client.get("/api/credits/eligibility/domain", headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["required_credits"] == 200
        assert data["eligible"] is False
        assert data["current_credits"] == 100
