import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from email.mime.multipart import MIMEMultipart
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

import app.services.email as email_module
from app.config import settings
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.services.auth import hash_password
from app.services.email import send_password_reset_email
from tests.conftest import _fake_redis, _incr_counters

_fake_redis.set = AsyncMock(return_value=True)


# ---------------------------------------------------------------------------
# Helper: create a verified user in the test DB
# ---------------------------------------------------------------------------


async def _create_verified_user(db_session, email="test@example.com", password="Test1234"):
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(password),
        is_verified=True,
        is_admin=False,
        credits=30,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Helper: auth_client fixture (same pattern as test_auth_routes.py)
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_client(db_session):
    """TestClient with only get_db overridden; auth dependencies are real."""

    from fastapi.testclient import TestClient

    from app.database import get_db
    from app.main import app
    from app.services.auth import get_current_user as _get_current_user

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(_get_current_user, None)
    app.middleware_stack = None

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


# ===========================================================================
# POST /api/auth/forgot-password
# ===========================================================================


class TestForgotPassword:
    def test_always_returns_200_even_for_unknown_email(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "noone@example.com"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data

    def test_returns_200_for_existing_user(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(_create_verified_user(db_session, email="real@example.com"))

        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "real@example.com"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data

    def test_message_is_in_indonesian(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(_create_verified_user(db_session, email="bahasa@example.com"))

        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "bahasa@example.com"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "terdaftar" in data["message"] or "tautan" in data["message"]

    def test_creates_password_reset_token_for_existing_user(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session, email="tokencheck@example.com")
        )

        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "tokencheck@example.com"},
        )
        assert resp.status_code == 200

        async def check_token():
            result = await db_session.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
            return result.scalar_one_or_none()

        token = asyncio.get_event_loop().run_until_complete(check_token())
        assert token is not None
        assert token.token is not None
        assert len(token.token) > 0

    def test_token_expires_in_1_hour(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session, email="expirecheck@example.com")
        )

        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "expirecheck@example.com"},
        )
        assert resp.status_code == 200

        async def check_expiry():
            result = await db_session.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
            token = result.scalar_one_or_none()
            return token

        token = asyncio.get_event_loop().run_until_complete(check_expiry())
        assert token is not None
        # Token should expire ~1 hour from now (allow 5 seconds margin)
        from datetime import UTC

        expected = datetime.now(UTC) + timedelta(hours=1)
        diff = abs((token.expires_at.replace(tzinfo=UTC) - expected).total_seconds())
        assert diff < 10  # Within 10 seconds

    def test_second_request_replaces_old_token(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session, email="replacetoken@example.com")
        )

        # First request
        resp1 = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "replacetoken@example.com"},
        )
        assert resp1.status_code == 200

        async def get_token():
            result = await db_session.execute(select(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
            return result.scalar_one_or_none()

        token1 = asyncio.get_event_loop().run_until_complete(get_token())

        # Second request
        resp2 = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "replacetoken@example.com"},
        )
        assert resp2.status_code == 200

        token2 = asyncio.get_event_loop().run_until_complete(get_token())
        assert token2 is not None
        assert token2.token != token1.token

    def test_attempts_to_send_email(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(_create_verified_user(db_session, email="sendcheck@example.com"))

        with patch("app.api.auth_routes.send_password_reset_email") as mock_send:
            mock_send.return_value = True
            resp = auth_client.post(
                "/api/auth/forgot-password",
                json={"email": "sendcheck@example.com"},
            )
            assert resp.status_code == 200
            mock_send.assert_awaited_once()

    def test_email_send_failure_still_returns_200(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(_create_verified_user(db_session, email="emailfail@example.com"))

        with patch("app.api.auth_routes.send_password_reset_email") as mock_send:
            mock_send.side_effect = Exception("SMTP connection failed")
            resp = auth_client.post(
                "/api/auth/forgot-password",
                json={"email": "emailfail@example.com"},
            )
            assert resp.status_code == 200

    def test_missing_email_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={},
        )
        assert resp.status_code == 422

    def test_invalid_email_format_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "not-an-email"},
        )
        assert resp.status_code == 422

    def test_no_token_created_for_unknown_email(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "nonexistent@example.com"},
        )
        assert resp.status_code == 200

        async def count_tokens():
            result = await db_session.execute(select(PasswordResetToken))
            return result.scalars().all()

        tokens = asyncio.get_event_loop().run_until_complete(count_tokens())
        assert len(tokens) == 0


# ===========================================================================
# POST /api/auth/reset-password
# ===========================================================================


class TestResetPassword:
    async def _setup(self, db_session, email="resetuser@example.com", password="OldPass1"):
        user = await _create_verified_user(db_session, email=email, password=password)
        token_str = "test-reset-token-32-bytes!!"
        reset_token = PasswordResetToken(
            user_id=user.id,
            token=token_str,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db_session.add(reset_token)
        await db_session.commit()
        await db_session.refresh(reset_token)
        return user, token_str

    def test_success_resets_password(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        with patch("app.api.auth_routes.datetime") as mock_dt:
            mock_dt.now.return_value = datetime.now(UTC)
            resp = auth_client.post(
                "/api/auth/reset-password",
                json={
                    "token": token_str,
                    "new_password": "NewPass1",
                    "confirm_password": "NewPass1",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data

    def test_password_changed_in_database(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        with patch("app.api.auth_routes.datetime") as mock_dt:
            mock_dt.now.return_value = datetime.now(UTC)
            auth_client.post(
                "/api/auth/reset-password",
                json={
                    "token": token_str,
                    "new_password": "Changed1",
                    "confirm_password": "Changed1",
                },
            )

        async def check_password():
            result = await db_session.execute(select(User).where(User.id == user.id))
            u = result.scalar_one()
            return u

        updated_user = asyncio.get_event_loop().run_until_complete(check_password())
        assert updated_user.password_hash != hash_password("OldPass1")

    def test_token_deleted_after_reset(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        with patch("app.api.auth_routes.datetime") as mock_dt:
            mock_dt.now.return_value = datetime.now(UTC)
            auth_client.post(
                "/api/auth/reset-password",
                json={
                    "token": token_str,
                    "new_password": "NewPass1",
                    "confirm_password": "NewPass1",
                },
            )

        async def check_token():
            result = await db_session.execute(select(PasswordResetToken).where(PasswordResetToken.token == token_str))
            return result.scalar_one_or_none()

        deleted = asyncio.get_event_loop().run_until_complete(check_token())
        assert deleted is None

    def test_can_login_with_new_password(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        with patch("app.api.auth_routes.datetime") as mock_dt:
            mock_dt.now.return_value = datetime.now(UTC)
            auth_client.post(
                "/api/auth/reset-password",
                json={
                    "token": token_str,
                    "new_password": "NewLogin1",
                    "confirm_password": "NewLogin1",
                },
            )

        # Try login with new password
        resp = auth_client.post(
            "/api/auth/login",
            json={"email": "resetuser@example.com", "password": "NewLogin1"},
        )
        assert resp.status_code == 200

    def test_invalid_token_returns_400(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": "nonexistent-token-1234567890",
                "new_password": "NewPass1",
                "confirm_password": "NewPass1",
            },
        )
        assert resp.status_code == 400

    def test_expired_token_returns_400(self, auth_client, db_session):
        import asyncio

        user = asyncio.get_event_loop().run_until_complete(
            _create_verified_user(db_session, email="expired@example.com")
        )
        token_str = "expired-token-32-bytes-long!!"
        reset_token = PasswordResetToken(
            user_id=user.id,
            token=token_str,
            expires_at=datetime.now(UTC) - timedelta(hours=1),
        )
        db_session.add(reset_token)
        asyncio.get_event_loop().run_until_complete(db_session.commit())

        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": token_str,
                "new_password": "NewPass1",
                "confirm_password": "NewPass1",
            },
        )
        assert resp.status_code == 400

    def test_password_mismatch_returns_400(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": token_str,
                "new_password": "NewPass1",
                "confirm_password": "Different1",
            },
        )
        assert resp.status_code == 400

    def test_weak_password_no_uppercase_returns_422(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": token_str,
                "new_password": "alllowercase1",
                "confirm_password": "alllowercase1",
            },
        )
        assert resp.status_code == 422

    def test_weak_password_no_digit_returns_422(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": token_str,
                "new_password": "NoDigitHere",
                "confirm_password": "NoDigitHere",
            },
        )
        assert resp.status_code == 422

    def test_weak_password_no_lowercase_returns_422(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": token_str,
                "new_password": "ALLUPPERCASE1",
                "confirm_password": "ALLUPPERCASE1",
            },
        )
        assert resp.status_code == 422

    def test_short_password_returns_422(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": token_str,
                "new_password": "Ab1",
                "confirm_password": "Ab1",
            },
        )
        assert resp.status_code == 422

    def test_missing_token_returns_422(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "new_password": "NewPass1",
                "confirm_password": "NewPass1",
            },
        )
        assert resp.status_code == 422

    def test_missing_password_returns_422(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": token_str,
                "confirm_password": "NewPass1",
            },
        )
        assert resp.status_code == 422

    def test_empty_token_returns_400(self, auth_client, db_session):
        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": "",
                "new_password": "NewPass1",
                "confirm_password": "NewPass1",
            },
        )
        assert resp.status_code == 400

    def test_user_not_found_returns_400(self, auth_client, db_session):
        """Token exists but user was deleted — should return 400."""
        import asyncio

        token_str = "orphan-token-32-bytes-long!!"
        reset_token = PasswordResetToken(
            user_id=uuid.uuid4(),
            token=token_str,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db_session.add(reset_token)
        asyncio.get_event_loop().run_until_complete(db_session.commit())

        resp = auth_client.post(
            "/api/auth/reset-password",
            json={
                "token": token_str,
                "new_password": "NewPass1",
                "confirm_password": "NewPass1",
            },
        )
        assert resp.status_code == 400

    def test_message_is_in_indonesian(self, auth_client, db_session):
        import asyncio

        user, token_str = asyncio.get_event_loop().run_until_complete(self._setup(db_session))

        with patch("app.api.auth_routes.datetime") as mock_dt:
            mock_dt.now.return_value = datetime.now(UTC)
            resp = auth_client.post(
                "/api/auth/reset-password",
                json={
                    "token": token_str,
                    "new_password": "NewPass1",
                    "confirm_password": "NewPass1",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "direset" in data["message"] or "Kata sandi" in data["message"]


# ===========================================================================
# Rate limiting tests
# ===========================================================================


class TestForgotPasswordRateLimit:
    def test_rate_limit_returns_429(self, auth_client, db_session):
        _incr_counters["ratelimit:forgot_password:testclient"] = 6

        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "ratelimit@example.com"},
        )
        assert resp.status_code == 429

    def test_rate_limit_not_triggered_below_threshold(self, auth_client, db_session):
        import asyncio

        asyncio.get_event_loop().run_until_complete(_create_verified_user(db_session, email="belowlimit@example.com"))

        _incr_counters["ratelimit:forgot_password:testclient"] = 3

        resp = auth_client.post(
            "/api/auth/forgot-password",
            json={"email": "belowlimit@example.com"},
        )
        assert resp.status_code == 200


# ===========================================================================
# send_password_reset_email — email service tests
# ===========================================================================


class TestSendPasswordResetEmailSuccess:
    @pytest.mark.asyncio
    async def test_returns_true_on_success(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "abc123token")

        assert result is True
        mock_smtp.connect.assert_awaited_once()
        mock_smtp.login.assert_not_awaited()
        mock_smtp.send_message.assert_awaited_once()
        mock_smtp.quit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_login_called_when_credentials_provided(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_USER", "smtpuser")
        monkeypatch.setattr(email_module, "SMTP_PASS", "smtppass")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "token123")

        assert result is True
        mock_smtp.login.assert_awaited_once_with("smtpuser", "smtppass")


class TestPasswordResetMimeMessage:
    @pytest.mark.asyncio
    async def test_subject_header(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_password_reset_email("user@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        assert sent_msg["Subject"] == "VulnScanner — Reset Your Password"

    @pytest.mark.asyncio
    async def test_message_is_multipart_alternative(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_password_reset_email("user@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        assert isinstance(sent_msg, MIMEMultipart)
        assert sent_msg.get_content_subtype() == "alternative"

    @pytest.mark.asyncio
    async def test_html_body_contains_reset_link(self, monkeypatch):
        monkeypatch.setattr(email_module, "FRONTEND_URL", "https://custom.example.com")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_password_reset_email("user@example.com", "special-token-456")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert "https://custom.example.com/reset-password?token=special-token-456" in html_body

    @pytest.mark.asyncio
    async def test_html_body_uses_default_frontend_url(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_password_reset_email("user@example.com", "token789")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert "https://vs.appmedia.id/reset-password?token=token789" in html_body

    @pytest.mark.asyncio
    async def test_html_content_type(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_password_reset_email("user@example.com", "token123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        assert html_part.get_content_type() == "text/html"
        assert html_part.get_content_charset() == "utf-8"


class TestSendPasswordResetEmailFailure:
    @pytest.mark.asyncio
    async def test_connect_failure_returns_false(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock(side_effect=OSError("Connection refused"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "token123")

        assert result is False
        mock_smtp.connect.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_send_failure_returns_false(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock(side_effect=Exception("Send failed"))
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "token123")

        assert result is False
        mock_smtp.send_message.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_login_failure_returns_false(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_USER", "baduser")
        monkeypatch.setattr(email_module, "SMTP_PASS", "badpass")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock(side_effect=Exception("Auth failed"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "token123")

        assert result is False
        mock_smtp.login.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_timeout_returns_false(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock(side_effect=TimeoutError("Connection timed out"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "token123")

        assert result is False


class TestPasswordResetTokenInLink:
    @pytest.mark.asyncio
    async def test_token_appears_in_link(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_password_reset_email("user@example.com", "test-token-abc123")

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert "reset-password?token=test-token-abc123" in html_body

    @pytest.mark.asyncio
    async def test_special_characters_in_token(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        special_token = "aB3-._~+/=xYz"
        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_password_reset_email("user@example.com", special_token)

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert special_token in html_body

    @pytest.mark.asyncio
    async def test_empty_token(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "")

        assert result is True
        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert "reset-password?token=" in html_body


class TestPasswordResetEmailEdgeCases:
    @pytest.mark.asyncio
    async def test_quit_failure_still_returns_false(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock(side_effect=OSError("Broken pipe"))

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "token123")

        assert result is False
        mock_smtp.send_message.assert_awaited_once()
        mock_smtp.quit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_no_credentials_no_login(self, monkeypatch):
        monkeypatch.setattr(email_module, "SMTP_USER", "")
        monkeypatch.setattr(email_module, "SMTP_PASS", "")

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.login = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            result = await send_password_reset_email("user@example.com", "token123")

        assert result is True
        mock_smtp.login.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_very_long_token(self):
        long_token = "x" * 1000

        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            await send_password_reset_email("user@example.com", long_token)

        sent_msg = mock_smtp.send_message.call_args[0][0]
        html_part = sent_msg.get_payload()[0]
        html_body = html_part.get_payload(decode=True).decode("utf-8")
        assert long_token in html_body

    @pytest.mark.asyncio
    async def test_concurrent_email_sends(self):
        mock_smtp = AsyncMock()
        mock_smtp.connect = AsyncMock()
        mock_smtp.send_message = AsyncMock()
        mock_smtp.quit = AsyncMock()

        with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
            results = await asyncio.gather(
                send_password_reset_email("user1@example.com", "tokenA"),
                send_password_reset_email("user2@example.com", "tokenB"),
                send_password_reset_email("user3@example.com", "tokenC"),
            )

        assert results == [True, True, True]
        assert mock_smtp.send_message.await_count == 3
