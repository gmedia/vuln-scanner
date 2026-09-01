import asyncio
import types
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.api_key import ApiKey
from app.models.credit_log import CreditLog
from app.models.email_send_log import EmailSendLog
from app.models.hpp import HppRate
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
            params = {k: v.hex if isinstance(v, uuid.UUID) else v for k, v in params.items()}
        elif isinstance(params, list):
            params = [
                {k: v.hex if isinstance(v, uuid.UUID) else v for k, v in p.items()} if isinstance(p, dict) else p
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

    token = create_access_token(user_id=str(user.id), email=user.email, is_admin=user.is_admin)
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
            json={"amount": 25, "description": "Bonus credits"},
            headers=API_HEADERS,
        )
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
            json={"amount": -30, "description": "Manual deduction"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["credits"] == old_credits - 30

    def test_user_not_found_returns_404(self, client):
        fake_id = uuid.uuid4()
        resp = client.post(
            f"/api/admin/users/{fake_id}/credits", json={"amount": 10, "description": "Grant"}, headers=API_HEADERS
        )
        assert resp.status_code == 404

    def test_deduct_exceeds_balance_returns_400(self, client, db_session, sample_user):
        sample_user.credits = 10
        asyncio.get_event_loop().run_until_complete(db_session.commit())

        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": -50, "description": "Overdraft attempt"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 400
        assert "insufficient" in resp.json()["detail"].lower()

    def test_missing_amount_returns_422(self, client, sample_user):
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits", json={"description": "No amount"}, headers=API_HEADERS
        )
        assert resp.status_code == 422

    def test_invalid_amount_type_returns_422(self, client, sample_user):
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": "not-a-number", "description": "Bad input"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_creates_credit_log_on_grant(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 42, "description": "Test grant"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 200

        result = await db_session.execute(select(CreditLog).where(CreditLog.user_id == sample_user.id))
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
            json={"amount": -15, "description": "Test deduction"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 200

        result = await db_session.execute(select(CreditLog).where(CreditLog.user_id == sample_user.id))
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].amount == 15  # abs value stored
        assert logs[0].type == "deduct"
        assert logs[0].description == "Test deduction"

    def test_default_description(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        old_credits = sample_user.credits
        resp = client.post(f"/api/admin/users/{sample_user.id}/credits", json={"amount": 5}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["credits"] == old_credits + 5

    def test_credit_with_zero_amount(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        old_credits = sample_user.credits
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 0, "description": "Zero adjustment"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["credits"] == old_credits

    @pytest.mark.asyncio
    async def test_credit_log_description_stored(self, client, db_session, sample_user):
        _patch_db_for_uuid(db_session)
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 77, "description": "Custom description here"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 200

        result = await db_session.execute(select(CreditLog).where(CreditLog.user_id == sample_user.id))
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].description == "Custom description here"

    @pytest.mark.asyncio
    async def test_performed_by_set_on_credit_log(self, client, db_session, sample_user):
        """Verify performed_by is set to the admin who made the adjustment."""
        _patch_db_for_uuid(db_session)

        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": 50, "description": "Audit trail check"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 200

        result = await db_session.execute(select(CreditLog).where(CreditLog.user_id == sample_user.id))
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].performed_by is not None
        assert isinstance(logs[0].performed_by, uuid.UUID)

    @pytest.mark.asyncio
    async def test_performed_by_set_on_deduction(self, client, db_session, sample_user):
        """Verify performed_by is also set on deduction credit logs."""
        _patch_db_for_uuid(db_session)

        resp = client.post(
            f"/api/admin/users/{sample_user.id}/credits",
            json={"amount": -30, "description": "Deduction audit trail"},
            headers=API_HEADERS,
        )
        assert resp.status_code == 200

        result = await db_session.execute(select(CreditLog).where(CreditLog.user_id == sample_user.id))
        logs = result.scalars().all()
        assert len(logs) == 1
        assert logs[0].type == "deduct"
        assert logs[0].performed_by is not None
        assert isinstance(logs[0].performed_by, uuid.UUID)

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
# POST /api/admin/users/{user_id}/resend-verification
# ---------------------------------------------------------------------------


class TestAdminResendVerification:
    @pytest.mark.asyncio
    async def test_resend_success(self, client, db_session):
        from unittest.mock import AsyncMock, patch

        from app.models.email_verification import EmailVerificationToken

        user = User(
            id=uuid.uuid4(),
            email="unverified-admin-resend@example.com",
            password_hash=hash_password("TestPass1"),
            is_verified=False,
            credits=10,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        with patch("app.api.admin_routes.send_verification_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            resp = client.post(
                f"/api/admin/users/{user.id}/resend-verification",
                headers=API_HEADERS,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["email_sent"] is True
        assert "sent" in data["message"].lower()
        mock_send.assert_awaited_once()
        assert mock_send.await_args.kwargs["email_to"] == user.email

        token_result = await db_session.execute(
            select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
        )
        token = token_result.scalar_one_or_none()
        assert token is not None
        assert token.token == mock_send.await_args.kwargs["token"]

    @pytest.mark.asyncio
    async def test_resend_email_failed(self, client, db_session):
        from unittest.mock import AsyncMock, patch

        user = User(
            id=uuid.uuid4(),
            email="unverified-fail@example.com",
            password_hash=hash_password("TestPass1"),
            is_verified=False,
            credits=10,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        with patch("app.api.admin_routes.send_verification_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = False
            resp = client.post(
                f"/api/admin/users/{user.id}/resend-verification",
                headers=API_HEADERS,
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["email_sent"] is False
        assert "failed" in data["message"].lower()

    def test_resend_already_verified_returns_400(self, client, sample_user):
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/resend-verification",
            headers=API_HEADERS,
        )
        assert resp.status_code == 400
        assert resp.json()["detail"] == "User email is already verified"

    def test_resend_user_not_found_returns_404(self, client):
        fake_id = uuid.uuid4()
        resp = client.post(
            f"/api/admin/users/{fake_id}/resend-verification",
            headers=API_HEADERS,
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "User not found"

    @pytest.mark.asyncio
    async def test_resend_rotates_existing_token(self, client, db_session):
        from datetime import UTC, datetime, timedelta
        from unittest.mock import AsyncMock, patch

        from app.models.email_verification import EmailVerificationToken

        user = User(
            id=uuid.uuid4(),
            email="rotate-token@example.com",
            password_hash=hash_password("TestPass1"),
            is_verified=False,
            credits=10,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        old = EmailVerificationToken(
            user_id=user.id,
            token="old-token-value",
            expires_at=datetime.now(UTC) + timedelta(hours=12),
        )
        db_session.add(old)
        await db_session.commit()

        with patch("app.api.admin_routes.send_verification_email", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            resp = client.post(
                f"/api/admin/users/{user.id}/resend-verification",
                headers=API_HEADERS,
            )

        assert resp.status_code == 200
        token_result = await db_session.execute(
            select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
        )
        tokens = token_result.scalars().all()
        assert len(tokens) == 1
        assert tokens[0].token != "old-token-value"
        assert tokens[0].token == mock_send.await_args.kwargs["token"]

    def test_resend_unauthorized_non_admin_returns_403(self, admin_auth_client, db_session, sample_user):
        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular-resend@example.com", is_admin=False)
        )
        resp = admin_auth_client.post(
            f"/api/admin/users/{sample_user.id}/resend-verification",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/admin/users/{user_id}/force-verify
# ---------------------------------------------------------------------------


class TestAdminForceVerify:
    @pytest.mark.asyncio
    async def test_force_verify_unverified_user(self, client, db_session):
        from datetime import UTC, datetime, timedelta

        from app.models.email_verification import EmailVerificationToken

        user = User(
            id=uuid.uuid4(),
            email="force-verify@example.com",
            password_hash=hash_password("TestPass1"),
            is_verified=False,
            credits=10,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        pending = EmailVerificationToken(
            user_id=user.id,
            token="pending-verify-token",
            expires_at=datetime.now(UTC) + timedelta(hours=12),
        )
        db_session.add(pending)
        await db_session.commit()

        resp = client.post(
            f"/api/admin/users/{user.id}/force-verify",
            headers=API_HEADERS,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_verified"] is True
        assert data["email"] == user.email

        await db_session.refresh(user)
        assert user.is_verified is True
        assert user.verified_at is not None

        token_result = await db_session.execute(
            select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
        )
        assert token_result.scalar_one_or_none() is None

    def test_force_verify_already_verified_idempotent(self, client, sample_user):
        resp = client.post(
            f"/api/admin/users/{sample_user.id}/force-verify",
            headers=API_HEADERS,
        )
        assert resp.status_code == 200
        assert resp.json()["is_verified"] is True

    def test_force_verify_user_not_found(self, client):
        fake_id = uuid.uuid4()
        resp = client.post(
            f"/api/admin/users/{fake_id}/force-verify",
            headers=API_HEADERS,
        )
        assert resp.status_code == 404
        assert resp.json()["detail"] == "User not found"

    def test_force_verify_unauthorized_non_admin(self, admin_auth_client, db_session, sample_user):
        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular-force-verify@example.com", is_admin=False)
        )
        resp = admin_auth_client.post(
            f"/api/admin/users/{sample_user.id}/force-verify",
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

        resp = client.put("/api/admin/pricing/ip", json={"credit_cost": 15}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["scan_type"] == "ip"
        assert data["credit_cost"] == 15

    def test_create_new_pricing(self, client):
        resp = client.put("/api/admin/pricing/apk", json={"credit_cost": 8}, headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["scan_type"] == "apk"
        assert data["credit_cost"] == 8

    def test_invalid_scan_type_returns_400(self, client):
        resp = client.put("/api/admin/pricing/invalid_type", json={"credit_cost": 5}, headers=API_HEADERS)
        assert resp.status_code == 400
        assert "invalid scan type" in resp.json()["detail"].lower()

    def test_negative_cost_returns_422(self, client):
        resp = client.put("/api/admin/pricing/ip", json={"credit_cost": -1}, headers=API_HEADERS)
        assert resp.status_code == 422

    def test_missing_cost_returns_422(self, client):
        resp = client.put("/api/admin/pricing/ip", json={}, headers=API_HEADERS)
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
        client.post("/api/keys/generate", json={"name": "shape-test", "rate_limit": 10}, headers=API_HEADERS)
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


# ---------------------------------------------------------------------------
# Admin rate-limit-hit tests (coverage: lines 44,84,128,158,207,223)
# ---------------------------------------------------------------------------


class TestAdminRateLimits:
    """Verify that hitting admin rate limits returns 429 across all admin endpoints."""

    @pytest.fixture(autouse=True)
    def _patch_admin_limiter(self, monkeypatch):
        import app.api.admin_routes as admin_routes

        monkeypatch.setattr(admin_routes.admin_limiter, "max_requests", 3)
        monkeypatch.setattr(admin_routes.admin_limiter, "window_seconds", 3600)

    def test_stats_rate_limit_returns_429(self, client):
        """GET /api/admin/stats — 4th request hits rate limit (line 44)."""
        for _ in range(3):
            resp = client.get("/api/admin/stats", headers=API_HEADERS)
            assert resp.status_code == 200
        resp = client.get("/api/admin/stats", headers=API_HEADERS)
        assert resp.status_code == 429

    def test_users_rate_limit_returns_429(self, client):
        """GET /api/admin/users — 4th request hits rate limit (line 84)."""
        for _ in range(3):
            resp = client.get("/api/admin/users", headers=API_HEADERS)
            assert resp.status_code == 200
        resp = client.get("/api/admin/users", headers=API_HEADERS)
        assert resp.status_code == 429

    def test_user_detail_rate_limit_returns_429(self, client, sample_user):
        """GET /api/admin/users/{id} — 4th request hits rate limit (line 128)."""
        url = f"/api/admin/users/{sample_user.id}"
        for _ in range(3):
            resp = client.get(url, headers=API_HEADERS)
            assert resp.status_code == 200
        resp = client.get(url, headers=API_HEADERS)
        assert resp.status_code == 429

    def test_user_credits_rate_limit_returns_429(self, client, db_session, sample_user):
        """POST /api/admin/users/{id}/credits — 4th request hits rate limit (line 158)."""
        _patch_db_for_uuid(db_session)
        url = f"/api/admin/users/{sample_user.id}/credits"
        for _ in range(3):
            resp = client.post(url, json={"amount": 10, "description": "test"}, headers=API_HEADERS)
            assert resp.status_code == 200
        resp = client.post(url, json={"amount": 10, "description": "test"}, headers=API_HEADERS)
        assert resp.status_code == 429

    def test_pricing_list_rate_limit_returns_429(self, client):
        """GET /api/admin/pricing — 4th request hits rate limit (line 207)."""
        for _ in range(3):
            resp = client.get("/api/admin/pricing", headers=API_HEADERS)
            assert resp.status_code == 200
        resp = client.get("/api/admin/pricing", headers=API_HEADERS)
        assert resp.status_code == 429

    def test_pricing_update_rate_limit_returns_429(self, client):
        """PUT /api/admin/pricing/ip — 4th request hits rate limit (line 223)."""
        for _ in range(3):
            resp = client.put("/api/admin/pricing/ip", json={"credit_cost": 10}, headers=API_HEADERS)
            assert resp.status_code == 200
        resp = client.put("/api/admin/pricing/ip", json={"credit_cost": 10}, headers=API_HEADERS)
        assert resp.status_code == 429


class TestAdminHpp:
    def test_get_hpp_empty(self, client):
        resp = client.get("/api/admin/hpp", headers=API_HEADERS)
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    @pytest.mark.asyncio
    async def test_put_and_get_hpp(self, client, db_session):
        resp = client.put("/api/admin/hpp/ip", json={"amount_idr": 1500}, headers=API_HEADERS)
        assert resp.status_code == 200
        assert resp.json()["key"] == "ip"
        assert resp.json()["amount_idr"] == 1500
        listed = client.get("/api/admin/hpp", headers=API_HEADERS)
        assert listed.status_code == 200
        assert listed.json()["items"][0]["amount_idr"] == 1500

    def test_put_invalid_key(self, client):
        resp = client.put("/api/admin/hpp/uptime", json={"amount_idr": 1}, headers=API_HEADERS)
        assert resp.status_code == 400

    def test_put_negative_rejected(self, client):
        resp = client.put("/api/admin/hpp/ip", json={"amount_idr": -1}, headers=API_HEADERS)
        assert resp.status_code == 422

    def test_hpp_unauthorized(self, admin_auth_client, db_session):
        user, token = asyncio.get_event_loop().run_until_complete(
            _create_user_with_token(db_session, "regular-hpp@example.com", is_admin=False)
        )
        resp = admin_auth_client.get("/api/admin/hpp", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_report_jobs_times_rate(self, client, db_session, sample_user):
        from datetime import UTC, datetime

        db_session.add(HppRate(key="ip", amount_idr=1000, updated_at=datetime.now(UTC)))
        db_session.add(HppRate(key="domain", amount_idr=2000, updated_at=datetime.now(UTC)))
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type="ip",
            target="203.0.113.10",
            status="completed",
            user_id=sample_user.id,
            credit_cost=1,
            completed_at=datetime.now(UTC),
        )
        db_session.add(job)
        db_session.add(
            PricingConfig(id=uuid.uuid4(), scan_type="ip", credit_cost=1),
        )
        db_session.add(
            PricingConfig(id=uuid.uuid4(), scan_type="domain", credit_cost=2),
        )
        await db_session.commit()
        resp = client.get("/api/admin/hpp/report", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        ip_line = next(x for x in data["lines"] if x["key"] == "ip")
        assert ip_line["count"] == 1
        assert ip_line["hpp_idr"] == 1000
        assert ip_line["overhead_share_idr"] == 0
        assert ip_line["fully_loaded_hpp_idr"] == 1000
        assert data["total_hpp_idr"] == 1000
        assert data["overhead_idr"] == 0
        assert data["total_fully_loaded_hpp_idr"] == 1000
        assert data["sku_estimates"][0]["label"] == "estimasi"
        assert data["sku_estimates"][0]["sku"] == "basic"

    @pytest.mark.asyncio
    async def test_report_statushost_from_credit_logs(self, client, db_session, sample_user):
        from datetime import UTC, datetime

        db_session.add(HppRate(key="statushost", amount_idr=500, updated_at=datetime.now(UTC)))
        db_session.add(
            CreditLog(
                user_id=sample_user.id,
                amount=1,
                type="deduct",
                description="Status hostname: example.test",
            )
        )
        await db_session.commit()
        resp = client.get("/api/admin/hpp/report", headers=API_HEADERS)
        assert resp.status_code == 200
        line = next(x for x in resp.json()["lines"] if x["key"] == "statushost")
        assert line["count"] == 1
        assert line["hpp_idr"] == 500

    @pytest.mark.asyncio
    async def test_report_hostscan_from_completed_scans(self, client, db_session, sample_user):
        from datetime import UTC, datetime

        from app.models.guard import GuardAgent
        from app.models.host_protect import HostScan, HostSite
        from app.models.organization import Organization, OrganizationMembership

        org = Organization(
            id=uuid.uuid4(),
            name="hpp-hostscan-org",
            slug=f"hpp-hostscan-{uuid.uuid4().hex[:8]}",
            kind="company",
            sku="multi",
            created_by_user_id=sample_user.id,
        )
        db_session.add(org)
        db_session.add(
            OrganizationMembership(
                organization_id=org.id,
                user_id=sample_user.id,
                role="owner",
            )
        )
        agent = GuardAgent(
            id=uuid.uuid4(),
            organization_id=org.id,
            wazuh_agent_id="001",
            name="hpp-lab",
            status="active",
        )
        db_session.add(agent)
        await db_session.flush()
        site = HostSite(
            id=uuid.uuid4(),
            organization_id=org.id,
            guard_agent_id=agent.id,
            name="fixture",
            root_path="/var/www/host-protect-fixture",
            created_by=sample_user.id,
        )
        db_session.add(site)
        await db_session.flush()
        db_session.add(HppRate(key="hostscan", amount_idr=250, updated_at=datetime.now(UTC)))
        db_session.add(
            HostScan(
                id=uuid.uuid4(),
                organization_id=org.id,
                site_id=site.id,
                status="completed",
                trigger="manual",
                finished_at=datetime.now(UTC),
            )
        )
        await db_session.commit()
        resp = client.get("/api/admin/hpp/report", headers=API_HEADERS)
        assert resp.status_code == 200
        line = next(x for x in resp.json()["lines"] if x["key"] == "hostscan")
        assert line["count"] == 1
        assert line["hpp_idr"] == 250

    def test_report_bad_range(self, client):
        resp = client.get("/api/admin/hpp/report?from=2026-08-10&to=2026-08-01", headers=API_HEADERS)
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_overhead_put_and_report_share(self, client, db_session, sample_user):
        from datetime import UTC, datetime

        db_session.add(HppRate(key="ip", amount_idr=1000, updated_at=datetime.now(UTC)))
        db_session.add(HppRate(key="domain", amount_idr=2000, updated_at=datetime.now(UTC)))
        db_session.add(
            ScanJob(
                id=uuid.uuid4(),
                scan_type="ip",
                target="203.0.113.11",
                status="completed",
                user_id=sample_user.id,
                credit_cost=1,
                completed_at=datetime.now(UTC),
            )
        )
        db_session.add(
            ScanJob(
                id=uuid.uuid4(),
                scan_type="domain",
                target="example.test",
                status="completed",
                user_id=sample_user.id,
                credit_cost=1,
                completed_at=datetime.now(UTC),
            )
        )
        await db_session.commit()
        put = client.put("/api/admin/hpp/overhead", json={"amount_idr": 100}, headers=API_HEADERS)
        assert put.status_code == 200
        assert put.json()["amount_idr"] == 100
        got = client.get("/api/admin/hpp/overhead", headers=API_HEADERS)
        assert got.status_code == 200
        assert got.json()["amount_idr"] == 100
        resp = client.get("/api/admin/hpp/report", headers=API_HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert data["overhead_idr"] == 100
        assert data["total_count"] == 2
        assert data["unallocated_overhead_idr"] == 0
        shares = {x["key"]: x["overhead_share_idr"] for x in data["lines"]}
        assert shares["ip"] + shares["domain"] == 100
        ip_line = next(x for x in data["lines"] if x["key"] == "ip")
        assert ip_line["fully_loaded_hpp_idr"] == ip_line["hpp_idr"] + ip_line["overhead_share_idr"]
        assert data["total_fully_loaded_hpp_idr"] == data["total_hpp_idr"] + 100

    def test_overhead_negative_rejected(self, client):
        resp = client.put("/api/admin/hpp/overhead", json={"amount_idr": -1}, headers=API_HEADERS)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_cost_journal_adds_to_overhead_pool(self, client, db_session, sample_user):
        from datetime import UTC, datetime

        db_session.add(HppRate(key="ip", amount_idr=1000, updated_at=datetime.now(UTC)))
        db_session.add(
            ScanJob(
                id=uuid.uuid4(),
                scan_type="ip",
                target="203.0.113.12",
                status="completed",
                user_id=sample_user.id,
                credit_cost=1,
                completed_at=datetime.now(UTC),
            )
        )
        await db_session.commit()
        created = client.post(
            "/api/admin/hpp/costs",
            json={
                "incurred_on": datetime.now(UTC).date().isoformat(),
                "amount_idr": 40,
                "category": "opex",
                "note": "CF",
            },
            headers=API_HEADERS,
        )
        assert created.status_code == 201
        line_id = created.json()["id"]
        listed = client.get("/api/admin/hpp/costs", headers=API_HEADERS)
        assert listed.status_code == 200
        assert listed.json()["items"][0]["amount_idr"] == 40
        client.put("/api/admin/hpp/overhead", json={"amount_idr": 10}, headers=API_HEADERS)
        resp = client.get("/api/admin/hpp/report", headers=API_HEADERS)
        data = resp.json()
        assert data["journal_opex_idr"] == 40
        assert data["journal_variable_idr"] == 0
        assert data["overhead_idr"] == 50
        ip_line = next(x for x in data["lines"] if x["key"] == "ip")
        assert ip_line["overhead_share_idr"] == 50
        gone = client.delete(f"/api/admin/hpp/costs/{line_id}", headers=API_HEADERS)
        assert gone.status_code == 204
        after = client.get("/api/admin/hpp/report", headers=API_HEADERS).json()
        assert after["journal_opex_idr"] == 0
        assert after["overhead_idr"] == 10

    def test_cost_invalid_category(self, client):
        resp = client.post(
            "/api/admin/hpp/costs",
            json={"incurred_on": "2026-08-01", "amount_idr": 1, "category": "invoice", "note": ""},
            headers=API_HEADERS,
        )
        assert resp.status_code == 422


class TestAdminEmailLogs:
    def test_list_empty(self, client):
        resp = client.get("/api/admin/email-logs", headers=API_HEADERS)
        assert resp.status_code == 200
        assert resp.json() == {"items": [], "total": 0}

    @pytest.mark.asyncio
    async def test_list_masks_and_filters(self, client, db_session):
        db_session.add(
            EmailSendLog(
                id=uuid.uuid4(),
                kind="verification",
                status="sent",
                recipient_masked="u***@example.com",
                attempts=1,
                created_at=datetime.now(UTC),
            )
        )
        db_session.add(
            EmailSendLog(
                id=uuid.uuid4(),
                kind="uptime",
                status="failed",
                recipient_masked="o***@example.com",
                attempts=3,
                error_message="SMTP timeout",
                created_at=datetime.now(UTC),
            )
        )
        await db_session.commit()
        all_rows = client.get("/api/admin/email-logs", headers=API_HEADERS)
        assert all_rows.status_code == 200
        body = all_rows.json()
        assert body["total"] == 2
        assert all("@" in i["recipient_masked"] for i in body["items"])
        assert all("***" in i["recipient_masked"] for i in body["items"])
        failed = client.get("/api/admin/email-logs?status=failed", headers=API_HEADERS)
        assert failed.json()["total"] == 1
        assert failed.json()["items"][0]["kind"] == "uptime"
        bad = client.get("/api/admin/email-logs?kind=inbox", headers=API_HEADERS)
        assert bad.status_code == 400
