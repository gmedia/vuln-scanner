import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.credit_log import CreditLog
from app.models.email_verification import EmailVerificationToken
from app.models.user import User
from app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user as _get_current_user,
    hash_password,
    logout_all,
    revoke_token,
)
from tests.conftest import _fake_redis, _incr_counters

# Monkeypatch _fake_redis.set as AsyncMock so that revoke_token() and
# logout_all() can await it during tests
_fake_redis.set = AsyncMock(return_value=True)


# ---------------------------------------------------------------------------
# Helper: create an auth-specific TestClient that only overrides get_db,
# not get_current_user (so auth routes actually validate Bearer tokens).
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_client(db_session):
    """TestClient with only get_db overridden; auth dependencies are real."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(_get_current_user, None)
    app.middleware_stack = None

    # Build a client that always sends the API key header so login routes
    # (which require X-API-Key now) pass through the middleware.
    class _AuthClient(TestClient):
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

        def patch(self, *args, **kwargs):
            return self.request("PATCH", *args, **kwargs)

    with _AuthClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helper: create a verified user in the test DB
# ---------------------------------------------------------------------------


async def _create_verified_user(db_session, email="test@example.com", password="Test1234", is_admin=False):
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(password),
        is_verified=True,
        is_admin=is_admin,
        credits=30,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _create_unverified_user(db_session, email="unverified@example.com", password="Test1234"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(password),
        is_verified=False,
        is_admin=False,
        credits=30,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# POST /api/auth/register
# ---------------------------------------------------------------------------


class TestRegister:
    def test_success_returns_201(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "message" in data

    def test_duplicate_email_returns_409(self, auth_client, db_session):
        auth_client.post(
            "/api/auth/register",
            json={
                "email": "dup@example.com",
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
        )
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "dup@example.com",
                "password": "AnotherPass1",
                "confirm_password": "AnotherPass1",
            },
        )
        assert resp.status_code == 409

    def test_password_mismatch_returns_400(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "mismatch@example.com",
                "password": "StrongPass1",
                "confirm_password": "DifferentPass1",
            },
        )
        assert resp.status_code == 400

    def test_weak_password_no_uppercase_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "weak@example.com",
                "password": "alllowercase1",
                "confirm_password": "alllowercase1",
            },
        )
        assert resp.status_code == 422

    def test_weak_password_no_digit_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "weak@example.com",
                "password": "NoDigitHere",
                "confirm_password": "NoDigitHere",
            },
        )
        assert resp.status_code == 422

    def test_short_password_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "short@example.com",
                "password": "Ab1",
                "confirm_password": "Ab1",
            },
        )
        assert resp.status_code == 422

    def test_missing_email_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
        )
        assert resp.status_code == 422

    def test_missing_password_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "nopass@example.com",
                "confirm_password": "StrongPass1",
            },
        )
        assert resp.status_code == 422

    def test_invalid_email_format_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "not-an-email",
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
        )
        assert resp.status_code == 422

    def test_creates_user_in_database(self, auth_client, db_session):
        auth_client.post(
            "/api/auth/register",
            json={
                "email": "dbcheck@example.com",
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
        )

        import asyncio

        async def check():
            result = await db_session.execute(
                select(User).where(User.email == "dbcheck@example.com")
            )
            return result.scalar_one_or_none()

        user = asyncio.get_event_loop().run_until_complete(check())
        assert user is not None
        assert user.email == "dbcheck@example.com"
        assert user.is_verified is False
        assert user.credits == settings.default_register_credits

    def test_creates_verification_token(self, auth_client, db_session):
        auth_client.post(
            "/api/auth/register",
            json={
                "email": "verifytoken@example.com",
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
        )

        import asyncio

        async def check():
            user_result = await db_session.execute(
                select(User).where(User.email == "verifytoken@example.com")
            )
            user = user_result.scalar_one_or_none()
            token_result = await db_session.execute(
                select(EmailVerificationToken).where(
                    EmailVerificationToken.user_id == user.id
                )
            )
            return token_result.scalar_one_or_none()

        token = asyncio.get_event_loop().run_until_complete(check())
        assert token is not None
        assert token.expires_at > datetime.now(UTC)


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------


class TestLogin:
    async def _setup_user(self, db_session):
        return await _create_verified_user(db_session)

    def test_success_returns_200_with_tokens(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0
        assert "user" in data
        assert data["user"]["email"] == "test@example.com"

    def test_wrong_password_returns_401(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "WrongPass1"},
        )
        assert resp.status_code == 401

    def test_nonexistent_user_returns_401(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "noone@example.com", "password": "Test1234"},
        )
        assert resp.status_code == 401

    def test_missing_email_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/login",
            json={"password": "Test1234"},
        )
        assert resp.status_code == 422

    def test_missing_password_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com"},
        )
        assert resp.status_code == 422

    def test_unverified_user_returns_403(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_unverified_user(db_session)
        )

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "unverified@example.com", "password": "Test1234"},
        )
        assert resp.status_code == 403

    def test_login_sets_refresh_cookie(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        assert "refresh_token" in resp.cookies
        cookie = resp.cookies["refresh_token"]
        assert cookie != ""


# ---------------------------------------------------------------------------
# GET /api/auth/me
# ---------------------------------------------------------------------------


class TestMe:
    async def _get_token(self, db_session):
        user = await _create_verified_user(db_session)
        from app.services.auth import create_access_token

        return create_access_token(
            user_id=str(user.id), email=user.email, is_admin=user.is_admin
        )

    def test_with_valid_token_returns_200(self, auth_client, db_session):
        import asyncio

        token = asyncio.get_event_loop().run_until_complete(self._get_token(db_session))

        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["is_verified"] is True
        assert "id" in data

    def test_without_token_returns_401(self, auth_client, db_session):
        resp = auth_client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_with_invalid_scheme_returns_401(self, auth_client, db_session):
        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": "Basic somebase64stuff"},
        )
        assert resp.status_code == 401

    def test_with_empty_token_returns_401(self, auth_client, db_session):
        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer "},
        )
        assert resp.status_code == 401

    def test_with_malformed_token_returns_401(self, auth_client, db_session):
        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer not.a.valid.jwt"},
        )
        assert resp.status_code == 401

    def test_with_expired_token_returns_401(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        expired_payload = {
            "sub": str(user.id),
            "email": user.email,
            "is_admin": user.is_admin,
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(minutes=5),
        }
        expired_token = jwt.encode(expired_payload, secret, algorithm=algorithm)

        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code == 401

    def test_with_tampered_token_returns_401(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        algorithm = settings.jwt_algorithm
        tampered_payload = {
            "sub": str(user.id),
            "email": user.email,
            "is_admin": True,
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        tampered_token = jwt.encode(tampered_payload, "wrong-secret", algorithm=algorithm)

        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {tampered_token}"},
        )
        assert resp.status_code == 401

    def test_token_with_nonexistent_user_returns_401(self, auth_client, db_session):
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        payload = {
            "sub": "00000000-0000-0000-0000-000000000000",
            "email": "ghost@example.com",
            "is_admin": False,
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        token = jwt.encode(payload, secret, algorithm=algorithm)

        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    def test_token_with_invalid_uuid_sub_returns_401(self, auth_client, db_session):
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        payload = {
            "sub": "not-a-uuid",
            "email": "bad@example.com",
            "is_admin": False,
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        token = jwt.encode(payload, secret, algorithm=algorithm)

        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    def test_token_without_sub_returns_401(self, auth_client, db_session):
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        payload = {
            "email": "nosub@example.com",
            "is_admin": False,
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        token = jwt.encode(payload, secret, algorithm=algorithm)

        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/auth/refresh
# ---------------------------------------------------------------------------


class TestRefresh:
    async def _setup(self, db_session):
        user = await _create_verified_user(db_session)
        from app.services.auth import create_access_token, create_refresh_token

        return {
            "user": user,
            "access": create_access_token(
                user_id=str(user.id), email=user.email, is_admin=user.is_admin
            ),
            "refresh": create_refresh_token(user_id=str(user.id)),
        }

    def test_with_valid_refresh_token_returns_200(self, auth_client, db_session):
        import asyncio

        tokens = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": tokens["refresh"]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0

    def test_new_tokens_differ_from_old(self, auth_client, db_session):
        import asyncio
        import time

        tokens = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        # Ensure at least 1 second passes so JWT iat/exp differ
        time.sleep(1.1)

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": tokens["refresh"]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] != tokens["access"]
        assert data["refresh_token"] != tokens["refresh"]

    def test_with_access_token_instead_returns_401(self, auth_client, db_session):
        import asyncio

        tokens = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": tokens["access"]},
        )
        assert resp.status_code == 401

    def test_with_expired_refresh_token_returns_401(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        expired_payload = {
            "sub": str(user.id),
            "type": "refresh",
            "exp": datetime.now(UTC) - timedelta(days=1),
        }
        expired_refresh = jwt.encode(expired_payload, secret, algorithm=algorithm)

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": expired_refresh},
        )
        assert resp.status_code == 401

    def test_without_token_body_returns_400(self, auth_client, db_session):
        resp = auth_client.post("/api/auth/refresh", json={})
        assert resp.status_code == 400

    def test_with_null_refresh_token_returns_400(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": None},
        )
        assert resp.status_code == 400

    def test_with_malformed_token_returns_401(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": "not.a.valid.jwt"},
        )
        assert resp.status_code == 401

    def test_with_tampered_token_returns_401(self, auth_client, db_session):
        algorithm = settings.jwt_algorithm
        payload = {
            "sub": "00000000-0000-0000-0000-000000000000",
            "type": "refresh",
            "exp": datetime.now(UTC) + timedelta(days=7),
        }
        tampered = jwt.encode(payload, "wrong-secret", algorithm=algorithm)

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": tampered},
        )
        assert resp.status_code == 401

    def test_with_nonexistent_user_returns_401(self, auth_client, db_session):
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        payload = {
            "sub": "00000000-0000-0000-0000-000000000000",
            "type": "refresh",
            "exp": datetime.now(UTC) + timedelta(days=7),
        }
        token = jwt.encode(payload, secret, algorithm=algorithm)

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": token},
        )
        assert resp.status_code == 401

    def test_refresh_from_cookie(self, auth_client, db_session):
        """Refresh token can come from cookie set by login endpoint."""
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )
        from app.services.auth import create_refresh_token

        refresh_token = create_refresh_token(user_id=str(user.id))

        auth_client.cookies.set("refresh_token", refresh_token, path="/api/auth")
        resp = auth_client.post("/api/auth/refresh", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_refresh_sets_new_cookie(self, auth_client, db_session):
        import asyncio

        tokens = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": tokens["refresh"]},
        )
        assert resp.status_code == 200
        assert "refresh_token" in resp.cookies


# ---------------------------------------------------------------------------
# POST /api/auth/verify-email
# ---------------------------------------------------------------------------


class TestVerifyEmail:
    async def _setup(self, db_session):
        user = await _create_unverified_user(db_session)
        token_str = "test-verification-token-32-bytes!!"
        verification_token = EmailVerificationToken(
            user_id=user.id,
            token=token_str,
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=24),
        )
        db_session.add(verification_token)
        await db_session.commit()
        await db_session.refresh(verification_token)
        return user, token_str

    def test_success_verifies_user(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session)
        )

        # SQLite strips timezone from DateTime(timezone=True), making expires_at naive.
        # The source code compares with datetime.now(UTC) (aware), which raises TypeError.
        # Patch to return a naive UTC datetime so comparison works.
        with patch("app.api.auth_routes.datetime") as mock_dt:
            mock_dt.now.return_value = datetime.now(UTC).replace(tzinfo=None)
            resp = auth_client.post(
                "/api/auth/verify-email",
                json={"token": token_str},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data

        async def check():
            from sqlalchemy import select
            result = await db_session.execute(select(User).where(User.id == user.id))
            return result.scalar_one()

        updated_user = asyncio.get_event_loop().run_until_complete(check())
        assert updated_user.is_verified is True
        assert updated_user.verified_at is not None

    def test_already_verified_user_still_returns_200(self, auth_client, db_session):
        """Verify with already verified user — token gets deleted, still returns 200."""
        import asyncio

        # Create a verified user with a verification token
        user, token_str = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session)
        )
        # Manually verify the user first
        async def verify():
            u = await db_session.get(User, user.id)
            u.is_verified = True
            u.verified_at = datetime.now(UTC)
            await db_session.commit()

        asyncio.get_event_loop().run_until_complete(verify())

        with patch("app.api.auth_routes.datetime") as mock_dt:
            mock_dt.now.return_value = datetime.now(UTC).replace(tzinfo=None)
            resp = auth_client.post(
                "/api/auth/verify-email",
                json={"token": token_str},
            )
        # Should still return 200 — user is already verified
        assert resp.status_code == 200

        # Token should be deleted after verification
        async def check_token():
            result = await db_session.execute(
                select(EmailVerificationToken).where(
                    EmailVerificationToken.token == token_str
                )
            )
            return result.scalar_one_or_none()

        remaining = asyncio.get_event_loop().run_until_complete(check_token())
        assert remaining is None

    def test_token_deleted_after_success(self, auth_client, db_session):
        """Verification token is deleted from DB after successful verify."""
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session)
        )

        with patch("app.api.auth_routes.datetime") as mock_dt:
            mock_dt.now.return_value = datetime.now(UTC).replace(tzinfo=None)
            resp = auth_client.post(
                "/api/auth/verify-email",
                json={"token": token_str},
            )
        assert resp.status_code == 200

        # Verify token was deleted
        async def check_deleted():
            result = await db_session.execute(
                select(EmailVerificationToken).where(
                    EmailVerificationToken.token == token_str
                )
            )
            return result.scalar_one_or_none()

        deleted_token = asyncio.get_event_loop().run_until_complete(check_deleted())
        assert deleted_token is None


# ---------------------------------------------------------------------------
# POST /api/auth/revoke
# ---------------------------------------------------------------------------


class TestRevoke:
    async def _setup(self, db_session):
        user = await _create_verified_user(db_session)
        refresh_token = create_refresh_token(user_id=str(user.id))
        return user, refresh_token

    def test_valid_revoke_returns_200(self, auth_client, db_session):
        import asyncio

        user, refresh_token = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session)
        )

        # First login to get an access token for auth header
        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        assert resp.status_code == 200
        access_token = resp.json()["access_token"]

        resp = auth_client.post(
            "/api/auth/revoke",
            json={"token": refresh_token},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data

    def test_revoke_invalid_token_returns_400(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        access_token = resp.json()["access_token"]

        resp = auth_client.post(
            "/api/auth/revoke",
            json={"token": "not.a.valid.jwt"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 400

    def test_revoke_tampered_token_returns_400(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        access_token = resp.json()["access_token"]

        tampered = jwt.encode(
            {"sub": "test", "type": "refresh", "exp": datetime.now(UTC) + timedelta(days=7)},
            "wrong-secret",
            algorithm=settings.jwt_algorithm,
        )

        resp = auth_client.post(
            "/api/auth/revoke",
            json={"token": tampered},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 400

    def test_revoke_token_missing_jti_returns_400(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        access_token = resp.json()["access_token"]

        # Create a token without jti
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        token_without_jti = jwt.encode(
            {
                "sub": "00000000-0000-0000-0000-000000000000",
                "type": "access",
                "exp": datetime.now(UTC) + timedelta(minutes=30),
            },
            secret,
            algorithm=algorithm,
        )

        resp = auth_client.post(
            "/api/auth/revoke",
            json={"token": token_without_jti},
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/auth/logout-all
# ---------------------------------------------------------------------------


class TestLogoutAll:
    async def _setup(self, db_session):
        user = await _create_verified_user(db_session)
        access_token = create_access_token(
            user_id=str(user.id), email=user.email, is_admin=user.is_admin
        )
        return user, access_token

    def test_successful_logout_returns_200(self, auth_client, db_session):
        import asyncio

        user, access_token = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session)
        )

        resp = auth_client.post(
            "/api/auth/logout-all",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data
        assert "revoked_count" in data
        assert data["revoked_count"] >= 0

    def test_logout_all_revoked_count_increments(self, auth_client, db_session):
        import asyncio

        user, access_token = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session)
        )

        # First, revoke one token to increment the count
        refresh_token = create_refresh_token(user_id=str(user.id))
        asyncio.get_event_loop().run_until_complete(
            revoke_token(decode_token(refresh_token)["jti"], str(user.id))
        )

        resp = auth_client.post(
            "/api/auth/logout-all",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["revoked_count"] >= 1

    def test_subsequent_token_fails_after_logout_all(self, auth_client, db_session):
        import asyncio

        user, access_token = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session)
        )

        # Logout all first
        resp = auth_client.post(
            "/api/auth/logout-all",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200

        # Now try to use /me with the same access token — should be revoked
        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/auth/login — additional tests
# ---------------------------------------------------------------------------


class TestLoginExtra:
    def test_login_sets_correct_cookie_attributes(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        assert resp.status_code == 200

        # Check Set-Cookie header
        set_cookie = resp.headers.get("set-cookie", "")
        assert "HttpOnly" in set_cookie
        assert "SameSite=strict" in set_cookie
        assert "Path=/api/auth" in set_cookie
        assert "refresh_token=" in set_cookie


# ---------------------------------------------------------------------------
# POST /api/auth/register — additional tests
# ---------------------------------------------------------------------------


class TestRegisterExtra:
    def test_register_with_email_sending_failure_still_returns_201(
        self, auth_client, db_session
    ):
        with patch("app.api.auth_routes.send_verification_email") as mock_send:
            mock_send.side_effect = Exception("SMTP connection failed")

            resp = auth_client.post(
                "/api/auth/register",
                json={
                    "email": "smtpfail@example.com",
                    "password": "StrongPass1",
                    "confirm_password": "StrongPass1",
                },
            )
            assert resp.status_code == 201
            data = resp.json()
            assert "message" in data

    def test_register_creates_credit_log_entry(self, auth_client, db_session):
        import asyncio

        auth_client.post(
            "/api/auth/register",
            json={
                "email": "creditlog@example.com",
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
        )

        async def check():
            user_result = await db_session.execute(
                select(User).where(User.email == "creditlog@example.com")
            )
            user = user_result.scalar_one_or_none()
            assert user is not None
            log_result = await db_session.execute(
                select(CreditLog).where(CreditLog.user_id == user.id)
            )
            log = log_result.scalar_one_or_none()
            return log

        log = asyncio.get_event_loop().run_until_complete(check())
        assert log is not None
        assert log.amount == settings.default_register_credits
        assert log.type == "credit"
        assert log.description == "Welcome bonus"

    def test_register_password_missing_lowercase_returns_422(
        self, auth_client, db_session
    ):
        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "nolower@example.com",
                "password": "ALLUPPERCASE1",
                "confirm_password": "ALLUPPERCASE1",
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/auth/refresh — additional tests
# ---------------------------------------------------------------------------


class TestRefreshExtra:
    async def _setup(self, db_session):
        user = await _create_verified_user(db_session)
        return user

    def test_refresh_with_revoked_token_returns_401(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        refresh_token = create_refresh_token(user_id=str(user.id))
        jti = decode_token(refresh_token)["jti"]
        asyncio.get_event_loop().run_until_complete(
            revoke_token(jti, str(user.id))
        )

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert resp.status_code == 401

    def test_refresh_with_nonexistent_user_in_token_returns_401(
        self, auth_client, db_session
    ):
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        payload = {
            "sub": "00000000-0000-0000-0000-000000000000",
            "type": "refresh",
            "exp": datetime.now(UTC) + timedelta(days=7),
            "jti": "some-jti-here",
        }
        token = jwt.encode(payload, secret, algorithm=algorithm)

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": token},
        )
        assert resp.status_code == 401

    def test_refresh_with_invalid_uuid_sub_returns_401(
        self, auth_client, db_session
    ):
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        payload = {
            "sub": "not-a-valid-uuid",
            "type": "refresh",
            "exp": datetime.now(UTC) + timedelta(days=7),
            "jti": "some-jti-here",
        }
        token = jwt.encode(payload, secret, algorithm=algorithm)

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": token},
        )
        assert resp.status_code == 401

    def test_refresh_with_token_missing_sub_returns_401(
        self, auth_client, db_session
    ):
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        payload = {
            "type": "refresh",
            "exp": datetime.now(UTC) + timedelta(days=7),
            "jti": "some-jti-here",
        }
        token = jwt.encode(payload, secret, algorithm=algorithm)

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": token},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/auth/me — additional tests
# ---------------------------------------------------------------------------


class TestMeExtra:
    async def _setup(self, db_session, is_admin=False):
        user = await _create_verified_user(
            db_session, email="me@example.com", is_admin=is_admin
        )
        access_token = create_access_token(
            user_id=str(user.id), email=user.email, is_admin=user.is_admin
        )
        return user, access_token

    def test_me_returns_correct_user_shape(self, auth_client, db_session):
        import asyncio

        user, access_token = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session)
        )

        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "email" in data
        assert data["email"] == "me@example.com"
        assert "is_verified" in data
        assert data["is_verified"] is True
        assert "is_admin" in data
        assert "credits" in data
        assert "created_at" in data

    def test_me_with_admin_token(self, auth_client, db_session):
        import asyncio

        user, access_token = asyncio.get_event_loop().run_until_complete(
            self._setup(db_session, is_admin=True)
        )

        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_admin"] is True
        assert data["email"] == "me@example.com"


# ---------------------------------------------------------------------------
# Rate limiting tests
# ---------------------------------------------------------------------------


class TestRateLimit:
    def test_login_rate_limit_returns_429(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        # Simulate exceeding the login rate limit (max_requests=5)
        # TestClient uses "testclient" as client host
        _incr_counters["ratelimit:login:testclient"] = 6

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        assert resp.status_code == 429

    def test_register_rate_limit_returns_429(self, auth_client, db_session):
        # Simulate exceeding the register rate limit (max_requests=3)
        _incr_counters["ratelimit:register:testclient"] = 4

        resp = auth_client.post(
            "/api/auth/register",
            json={
                "email": "ratelimit@example.com",
                "password": "StrongPass1",
                "confirm_password": "StrongPass1",
            },
        )
        assert resp.status_code == 429

    def test_refresh_rate_limit_returns_429(self, auth_client, db_session):
        # Simulate exceeding the refresh rate limit (max_requests=10)
        _incr_counters["ratelimit:refresh:testclient"] = 11

        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": "some-token"},
        )
        assert resp.status_code == 429

    def test_verify_email_rate_limit_returns_429(self, auth_client, db_session):
        # Simulate exceeding the verify_email rate limit (max_requests=5)
        _incr_counters["ratelimit:verify_email:testclient"] = 6

        resp = auth_client.post(
            "/api/auth/verify-email",
            json={"token": "some-token"},
        )
        assert resp.status_code == 429

    def test_rate_limit_not_triggered_below_threshold(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session)
        )

        # Below threshold — should work fine
        _incr_counters["ratelimit:login:testclient"] = 3

        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "Test1234"},
        )
        assert resp.status_code == 200

    def test_expired_token_returns_400(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_unverified_user(db_session)
        )
        token_str = "expired-token-32-bytes-long!!"
        verification_token = EmailVerificationToken(
            user_id=user.id,
            token=token_str,
            expires_at=datetime.now(UTC) - timedelta(hours=1),
        )
        db_session.add(verification_token)
        asyncio.get_event_loop().run_until_complete(db_session.commit())

        resp = auth_client.post(
            "/api/auth/verify-email",
            json={"token": token_str},
        )
        assert resp.status_code == 400

    def test_missing_token_field_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/verify-email",
            json={},
        )
        assert resp.status_code == 422

    def test_empty_token_returns_400(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/verify-email",
            json={"token": ""},
        )
        assert resp.status_code == 400

    def test_user_not_found_returns_400(self, auth_client, db_session):
        """Verification token exists but user was deleted."""
        import asyncio

        token_str = "orphan-token-32-bytes-long!!"
        verification_token = EmailVerificationToken(
            user_id=uuid.uuid4(),
            token=token_str,
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
        db_session.add(verification_token)
        asyncio.get_event_loop().run_until_complete(db_session.commit())

        resp = auth_client.post(
            "/api/auth/verify-email",
            json={"token": token_str},
        )
        assert resp.status_code == 400
