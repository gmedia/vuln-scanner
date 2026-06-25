import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.email_verification import EmailVerificationToken
from app.models.user import User
from app.services.auth import get_current_user as _get_current_user, hash_password


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

    def test_invalid_token_returns_400(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/verify-email",
            json={"token": "nonexistent-token"},
        )
        assert resp.status_code == 400

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
