import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
import redis

from app.services.auth import (
    _check_redis_revocation_sync,
    _get_sync_redis,
    _revoked_tokens,
    _revoked_users,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    is_token_revoked,
    logout_all,
    revoke_token,
    verify_password,
)

# ---------------------------------------------------------------------------
# hash_password / verify_password
# ---------------------------------------------------------------------------


class TestHashPassword:
    def test_returns_string(self):
        result = hash_password("mysecret")
        assert isinstance(result, str)

    def test_does_not_return_plaintext(self):
        result = hash_password("mysecret")
        assert result != "mysecret"

    def test_different_hashes_for_same_password(self):
        h1 = hash_password("same")
        h2 = hash_password("same")
        # bcrypt generates different salts, so hashes differ
        assert h1 != h2

    def test_long_password(self):
        result = hash_password("a" * 256)
        assert isinstance(result, str)
        assert len(result) > 0


class TestVerifyPassword:
    def test_correct_password_returns_true(self):
        plain = "CorrectHorseBatteryStaple"
        hashed = hash_password(plain)
        assert verify_password(plain, hashed) is True

    def test_wrong_password_returns_false(self):
        hashed = hash_password("real_password")
        assert verify_password("wrong_password", hashed) is False

    def test_case_sensitive(self):
        hashed = hash_password("CaseSensitive")
        assert verify_password("casesensitive", hashed) is False

    def test_empty_password(self):
        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("x", hashed) is False

    def test_wrong_hash_format(self):
        # passlib raises for completely invalid hash format
        with pytest.raises(ValueError):
            verify_password("anything", "not-a-valid-bcrypt-hash")


# ---------------------------------------------------------------------------
# create_access_token / create_refresh_token / decode_token
# ---------------------------------------------------------------------------


class TestCreateAccessToken:
    def test_returns_string(self):
        token = create_access_token("user-123", "test@example.com")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_payload_contains_expected_fields(self):
        token = create_access_token("user-abc", "admin@example.com", is_admin=True)
        payload = decode_token(token)
        assert payload["sub"] == "user-abc"
        assert payload["email"] == "admin@example.com"
        assert payload["is_admin"] is True
        assert payload["type"] == "access"
        assert "exp" in payload

    def test_payload_non_admin_default(self):
        token = create_access_token("user-xyz", "normal@example.com")
        payload = decode_token(token)
        assert payload["is_admin"] is False

    def test_expiry_in_future(self):
        token = create_access_token("user-123", "test@example.com")
        payload = decode_token(token)
        exp = payload["exp"]
        now_ts = datetime.now(UTC).timestamp()
        assert exp > now_ts
        # Should expire within ~31 minutes (default 30 + 1 min tolerance)
        assert exp < now_ts + 31 * 60


class TestCreateRefreshToken:
    def test_returns_string(self):
        token = create_refresh_token("user-456")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_payload_has_type_refresh(self):
        token = create_refresh_token("user-789")
        payload = decode_token(token)
        assert payload["sub"] == "user-789"
        assert payload["type"] == "refresh"
        assert "email" not in payload  # refresh tokens don't carry email
        assert "exp" in payload

    def test_expiry_in_future(self):
        token = create_refresh_token("user-123")
        payload = decode_token(token)
        exp = payload["exp"]
        now_ts = datetime.now(UTC).timestamp()
        assert exp > now_ts
        # Should expire within ~8 days (default 7 + 1 day tolerance)
        assert exp < now_ts + 8 * 86400


class TestDecodeToken:
    def test_valid_token_returns_dict(self):
        token = create_access_token("user-1", "a@b.com")
        payload = decode_token(token)
        assert isinstance(payload, dict)
        assert payload["sub"] == "user-1"

    def test_tampered_payload_raises(self):
        """A token signed with a different payload should raise jwt.PyJWTError."""
        from app.config import settings

        fake_payload = {
            "sub": "attacker",
            "email": "evil@hack.com",
            "is_admin": True,
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        algorithm = settings.jwt_algorithm
        tampered = jwt.encode(fake_payload, "wrong-secret-key-12345", algorithm=algorithm)
        with pytest.raises(jwt.PyJWTError):
            decode_token(tampered)

    def test_wrong_secret_raises(self):
        """Token created with a different secret should fail decode."""
        from app.config import settings

        fake_payload = {
            "sub": "user-1",
            "email": "a@b.com",
            "is_admin": False,
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        algorithm = settings.jwt_algorithm
        tampered = jwt.encode(fake_payload, "completely-different-secret", algorithm=algorithm)
        with pytest.raises(jwt.PyJWTError):
            decode_token(tampered)

    def test_expired_token_raises(self):
        """Token with past expiry should raise jwt.PyJWTError."""
        from app.config import settings

        expired_payload = {
            "sub": "user-1",
            "email": "a@b.com",
            "is_admin": False,
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        expired_token = jwt.encode(expired_payload, secret, algorithm=algorithm)
        with pytest.raises(jwt.PyJWTError):
            decode_token(expired_token)

    def test_nearly_expired_token_still_valid(self):
        """Token expiring in 1 second should still decode successfully."""
        from app.config import settings

        payload = {
            "sub": "user-1",
            "email": "a@b.com",
            "is_admin": False,
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(seconds=1),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        token = jwt.encode(payload, secret, algorithm=algorithm)
        result = decode_token(token)
        assert result["sub"] == "user-1"

    def test_token_without_sub_still_decodes(self):
        """JWT without 'sub' claim still decodes (validation happens in get_current_user)."""
        from app.config import settings

        payload = {
            "email": "a@b.com",
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        token = jwt.encode(payload, secret, algorithm=algorithm)
        result = decode_token(token)
        assert "email" in result
        assert "sub" not in result

    def test_malformed_token_raises(self):
        with pytest.raises(jwt.PyJWTError):
            decode_token("this.is.not.a.valid.jwt")

    def test_empty_token_raises(self):
        with pytest.raises(jwt.PyJWTError):
            decode_token("")

    def test_none_token_raises(self):
        with pytest.raises((jwt.PyJWTError, TypeError, AttributeError)):
            decode_token(None)  # type: ignore[arg-type]

    def test_token_with_bad_algorithm_raises(self):
        """Token signed with HS384 instead of HS256 should fail."""
        from app.config import settings

        payload = {
            "sub": "user-1",
            "email": "a@b.com",
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        secret = settings.jwt_secret or settings.secret_key
        token = jwt.encode(payload, secret, algorithm="HS384")
        with pytest.raises(jwt.PyJWTError):
            decode_token(token)

    def test_access_token_does_not_have_refresh_type(self):
        token = create_access_token("user-1", "a@b.com")
        payload = decode_token(token)
        assert payload["type"] == "access"

    def test_refresh_token_does_not_have_access_type(self):
        token = create_refresh_token("user-1")
        payload = decode_token(token)
        assert payload["type"] == "refresh"


# ---------------------------------------------------------------------------
# Token expiry with real time (sleep-based)
# ---------------------------------------------------------------------------


class TestTokenExpiryWithSleep:
    def test_token_expires_after_short_ttl(self):
        """Create a token that expires in 1 second, wait 2 seconds, verify it raises."""
        from app.config import settings

        payload = {
            "sub": "user-ephemeral",
            "email": "ephemeral@test.com",
            "is_admin": False,
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(seconds=1),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        token = jwt.encode(payload, secret, algorithm=algorithm)

        # Verify it's valid immediately
        decoded = decode_token(token)
        assert decoded["sub"] == "user-ephemeral"

        # Wait for expiry
        time.sleep(2)

        with pytest.raises(jwt.PyJWTError):
            decode_token(token)


# ---------------------------------------------------------------------------
# _get_sync_redis
# ---------------------------------------------------------------------------


class TestGetSyncRedis:
    def test_returns_redis_instance(self):
        """_get_sync_redis() returns a sync Redis instance (mocked)."""
        import app.services.auth as auth_mod

        mock_redis = MagicMock()
        with (
            patch.object(auth_mod, "_sync_redis", None),
            patch.object(auth_mod.sync_redis.Redis, "from_url", return_value=mock_redis),
        ):
            result = _get_sync_redis()
            assert result is mock_redis

    def test_singleton_returns_same_instance(self):
        """Calling _get_sync_redis() twice returns the same instance."""
        # Reset module-level singleton to force fresh creation
        import app.services.auth as auth_mod

        with (
            patch.object(auth_mod, "_sync_redis", None),
            patch.object(auth_mod.sync_redis.Redis, "from_url") as mock_from_url,
        ):
            mock_redis = MagicMock()
            mock_from_url.return_value = mock_redis
            r1 = _get_sync_redis()
            r2 = _get_sync_redis()
            assert r1 is r2
            assert mock_from_url.call_count == 1  # only called once for singleton

    def test_can_call_get_method(self):
        """_get_sync_redis().get() can be called (mocked)."""
        import app.services.auth as auth_mod

        mock_redis = MagicMock()
        mock_redis.get.return_value = None
        with (
            patch.object(auth_mod, "_sync_redis", None),
            patch.object(auth_mod.sync_redis.Redis, "from_url", return_value=mock_redis),
        ):
            r = _get_sync_redis()
            result = r.get("some_key")
            assert result is None
            mock_redis.get.assert_called_once_with("some_key")


# ---------------------------------------------------------------------------
# decode_token — revocation edge cases
# ---------------------------------------------------------------------------


class TestDecodeTokenRevocation:
    def test_revoked_jti_raises(self):
        """decode_token raises PyJWTError when jti is in _revoked_tokens."""
        token = create_access_token("user-revoked", "revoked@test.com")
        payload_before = decode_token(token)
        jti = payload_before["jti"]

        # Manually add to in-memory revoked tokens (simulate revoke_token)
        _revoked_tokens[jti] = "user-revoked"

        try:
            with pytest.raises(jwt.PyJWTError, match="revoked"):
                decode_token(token)
        finally:
            _revoked_tokens.pop(jti, None)

    def test_revoked_user_raises(self):
        """decode_token raises PyJWTError when sub is in _revoked_users."""
        token = create_access_token("user-logged-out", "loggedout@test.com")
        payload_before = decode_token(token)
        sub = payload_before["sub"]

        _revoked_users.add(sub)

        try:
            with pytest.raises(jwt.PyJWTError, match="revoked"):
                decode_token(token)
        finally:
            _revoked_users.discard(sub)

    def test_invalid_signature_raises(self):
        """Modifying one character in a valid token raises PyJWTError."""
        token = create_access_token("user-sig", "sig@test.com")
        # base64url of "invalid" — guaranteed to fail signature verification
        parts = token.split(".")
        parts[2] = "aW52YWxpZA"
        tampered = ".".join(parts)
        with pytest.raises(jwt.PyJWTError):
            decode_token(tampered)

    def test_none_jti_and_sub_no_redis_check_crash(self):
        """Token with no jti and no sub still decodes (Redis check skipped)."""
        from app.config import settings

        payload = {
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        token = jwt.encode(payload, secret, algorithm=algorithm)

        # Should decode without crashing (jti=None, sub=None → Redis check
        # called but passes through safely)
        with patch("app.services.auth._check_redis_revocation_sync") as mock_check:
            result = decode_token(token)
            assert result["type"] == "access"
            mock_check.assert_called_once_with(None, None)


# ---------------------------------------------------------------------------
# _check_redis_revocation_sync
# ---------------------------------------------------------------------------


class TestCheckRedisRevocationSync:
    def test_redis_jti_hit_populates_cache_and_raises(self):
        """When Redis has a revoked JTI, it populates _revoked_tokens and raises."""
        mock_redis = MagicMock()
        mock_redis.get.side_effect = lambda key: ("user-redis-jti" if key == "revoked_tokens:test-jti-redis" else None)
        with patch("app.services.auth._get_sync_redis", return_value=mock_redis):
            with pytest.raises(jwt.PyJWTError, match="revoked"):
                _check_redis_revocation_sync("test-jti-redis", None)
            # Cache should be populated
            assert _revoked_tokens.get("test-jti-redis") == "user-redis-jti"

        # Clean up
        _revoked_tokens.pop("test-jti-redis", None)

    def test_redis_user_hit_populates_set_and_raises(self):
        """When Redis has a revoked user, it populates _revoked_users and raises."""
        mock_redis = MagicMock()
        mock_redis.get.side_effect = lambda key: ("1" if key == "revoked_users:user-redis-set" else None)
        with patch("app.services.auth._get_sync_redis", return_value=mock_redis):
            with pytest.raises(jwt.PyJWTError, match="revoked"):
                _check_redis_revocation_sync(None, "user-redis-set")
            assert "user-redis-set" in _revoked_users

        # Clean up
        _revoked_users.discard("user-redis-set")

    def test_redis_connection_error_no_crash(self):
        """When Redis connection fails, _check_redis_revocation_sync does not crash."""
        mock_redis = MagicMock()
        mock_redis.get.side_effect = redis.RedisError("Connection refused")
        with patch("app.services.auth._get_sync_redis", return_value=mock_redis):
            # Should not raise
            _check_redis_revocation_sync("some-jti", "some-sub")

    def test_redis_miss_no_error(self):
        """When Redis returns None for both keys, no error is raised."""
        mock_redis = MagicMock()
        mock_redis.get.return_value = None
        with patch("app.services.auth._get_sync_redis", return_value=mock_redis):
            # Should not raise
            _check_redis_revocation_sync("unknown-jti", "unknown-sub")


# ---------------------------------------------------------------------------
# revoke_token
# ---------------------------------------------------------------------------


class TestRevokeToken:
    def test_adds_jti_to_revoked_tokens(self):
        """revoke_token adds the jti → user_id mapping to _revoked_tokens."""
        jti = "test-jti-revoke-1"
        user_id = "user-revoke-1"

        with patch("app.services.auth._get_redis", new_callable=AsyncMock):
            asyncio.run(revoke_token(jti, user_id))

        assert _revoked_tokens[jti] == user_id
        # Clean up
        del _revoked_tokens[jti]

    def test_is_token_revoked_returns_true_after_revoke(self):
        """After revoke_token, is_token_revoked returns True."""
        jti = "test-jti-revoke-2"
        user_id = "user-revoke-2"

        with patch("app.services.auth._get_redis", new_callable=AsyncMock):
            asyncio.run(revoke_token(jti, user_id))

        assert is_token_revoked(jti) is True
        # Clean up
        del _revoked_tokens[jti]

    def test_redis_error_does_not_crash(self, caplog):
        """When Redis raises RedisError, revoke_token logs a warning and doesn't crash."""
        jti = "test-jti-redis-err"
        user_id = "user-redis-err"

        mock_redis = AsyncMock()
        mock_redis.set.side_effect = __import__("redis").exceptions.RedisError("Boom")
        with patch("app.services.auth._get_redis", return_value=mock_redis), caplog.at_level(logging.WARNING):
            asyncio.run(revoke_token(jti, user_id))

        # Token is still added to in-memory dict
        assert _revoked_tokens[jti] == user_id
        # Warning was logged
        assert "Failed to persist" in caplog.text
        # Clean up
        del _revoked_tokens[jti]


# ---------------------------------------------------------------------------
# logout_all
# ---------------------------------------------------------------------------


class TestLogoutAll:
    def test_adds_user_to_revoked_users(self):
        """logout_all adds the user_id to _revoked_users set."""
        user_id = "user-logout-1"

        with patch("app.services.auth._get_redis", new_callable=AsyncMock):
            asyncio.run(logout_all(user_id))

        assert user_id in _revoked_users
        # Clean up
        _revoked_users.discard(user_id)

    def test_returns_zero_for_user_with_no_tokens(self):
        """logout_all returns 0 when the user has no previously revoked tokens."""
        user_id = "user-logout-2"

        with patch("app.services.auth._get_redis", new_callable=AsyncMock):
            count = asyncio.run(logout_all(user_id))

        assert count == 0
        # Clean up
        _revoked_users.discard(user_id)

    def test_returns_correct_count(self):
        """logout_all returns the count of previously revoked tokens for the user."""
        user_id = "user-logout-3"
        # Pre-populate with some revoked tokens
        _revoked_tokens["jti-a"] = user_id
        _revoked_tokens["jti-b"] = user_id
        _revoked_tokens["jti-c"] = "other-user"

        try:
            with patch("app.services.auth._get_redis", new_callable=AsyncMock):
                count = asyncio.run(logout_all(user_id))

            assert count == 2  # jti-a + jti-b
        finally:
            _revoked_tokens.pop("jti-a", None)
            _revoked_tokens.pop("jti-b", None)
            _revoked_tokens.pop("jti-c", None)
            _revoked_users.discard(user_id)

    def test_redis_error_does_not_crash(self, caplog):
        """When Redis raises RedisError, logout_all logs a warning and doesn't crash."""
        user_id = "user-logout-redis-err"

        mock_redis = AsyncMock()
        mock_redis.set.side_effect = __import__("redis").exceptions.RedisError("Boom")
        with patch("app.services.auth._get_redis", return_value=mock_redis), caplog.at_level(logging.WARNING):
            asyncio.run(logout_all(user_id))

        assert user_id in _revoked_users
        assert "Failed to persist" in caplog.text
        # Clean up
        _revoked_users.discard(user_id)


# ---------------------------------------------------------------------------
# is_token_revoked
# ---------------------------------------------------------------------------


class TestIsTokenRevoked:
    def test_returns_false_for_unknown_jti(self):
        """is_token_revoked returns False for a jti not in _revoked_tokens."""
        assert is_token_revoked("nonexistent-jti-12345") is False

    def test_returns_true_after_revoke(self):
        """is_token_revoked returns True after revoke_token."""
        jti = "test-jti-is-revoked"
        user_id = "user-is-revoked"

        with patch("app.services.auth._get_redis", new_callable=AsyncMock):
            asyncio.run(revoke_token(jti, user_id))

        assert is_token_revoked(jti) is True
        # Clean up
        del _revoked_tokens[jti]


# ---------------------------------------------------------------------------
# _get_redis (async Redis)
# ---------------------------------------------------------------------------


class TestGetRedis:
    def test_returns_async_redis_instance(self):
        """_get_redis() returns an async Redis instance (mocked)."""
        import app.services.auth as auth_mod

        mock_redis = AsyncMock()
        with (
            patch.object(auth_mod, "_redis", None),
            patch.object(auth_mod.redis.Redis, "from_url", return_value=mock_redis),
        ):
            result = asyncio.run(auth_mod._get_redis())
            assert result is mock_redis

    def test_async_singleton_returns_same_instance(self):
        """Calling _get_redis() twice returns the same instance."""
        import app.services.auth as auth_mod

        mock_redis = AsyncMock()
        with (
            patch.object(auth_mod, "_redis", None),
            patch.object(auth_mod.redis.Redis, "from_url", return_value=mock_redis),
        ):
            r1 = asyncio.run(auth_mod._get_redis())
            r2 = asyncio.run(auth_mod._get_redis())
            assert r1 is r2


# ---------------------------------------------------------------------------
# decode_token — Redis check exception pass-through
# ---------------------------------------------------------------------------


class TestDecodeTokenRedisPassThrough:
    def test_redis_check_exception_is_caught(self):
        """decode_token catches non-PyJWTError exceptions from Redis check."""
        token = create_access_token("user-redis-err", "redis-err@test.com")

        def raise_connection_error(jti, sub):
            raise ConnectionError("Redis unavailable")

        with patch("app.services.auth._check_redis_revocation_sync", side_effect=raise_connection_error):
            result = decode_token(token)
            assert result["sub"] == "user-redis-err"


# ---------------------------------------------------------------------------
# get_current_user / get_current_admin
# ---------------------------------------------------------------------------


class TestGetCurrentUser:
    @pytest.fixture(autouse=True)
    def _setup_mocks(self):
        import app.services.auth as auth_mod

        self.mock_request = MagicMock()
        self.mock_db = AsyncMock()

        # Default: valid bearer token
        token = create_access_token(
            "550e8400-e29b-41d4-a716-446655440000",
            "test@example.com",
        )
        self.valid_token = token
        self.mock_request.headers = {"Authorization": f"Bearer {token}"}

        # Mock get_db dependency
        self._get_db_patch = patch.object(auth_mod, "get_db", return_value=self.mock_db)
        self._get_db_patch.start()
        yield
        self._get_db_patch.stop()

    def test_missing_authorization_header_returns_401(self):
        """Missing Authorization header raises 401."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod

        self.mock_request.headers = {}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "Missing Authorization" in exc_info.value.detail

    def test_wrong_scheme_returns_401(self):
        """Authorization header with 'Basic' scheme raises 401."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod

        self.mock_request.headers = {"Authorization": f"Basic {self.valid_token}"}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "Invalid Authorization header" in exc_info.value.detail

    def test_empty_token_returns_401(self):
        """Authorization header with 'Bearer ' but no token raises 401."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod

        self.mock_request.headers = {"Authorization": "Bearer "}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "Invalid Authorization header" in exc_info.value.detail

    def test_invalid_token_returns_401(self):
        """An invalid/expired token raises 401."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod

        self.mock_request.headers = {"Authorization": "Bearer invalid.token.here"}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "Invalid or expired" in exc_info.value.detail

    def test_missing_sub_claim_returns_401(self):
        """Token without 'sub' claim raises 401."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod
        from app.config import settings

        payload = {
            "email": "no-sub@test.com",
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        token = jwt.encode(payload, secret, algorithm=algorithm)

        self.mock_request.headers = {"Authorization": f"Bearer {token}"}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "missing subject" in exc_info.value.detail.lower()

    def test_invalid_uuid_sub_returns_401(self):
        """Token with non-UUID 'sub' raises 401."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod
        from app.config import settings

        payload = {
            "sub": "not-a-valid-uuid",
            "email": "bad-uuid@test.com",
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        token = jwt.encode(payload, secret, algorithm=algorithm)

        self.mock_request.headers = {"Authorization": f"Bearer {token}"}
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "Invalid user identifier" in exc_info.value.detail

    def test_user_not_found_in_db_returns_401(self):
        """Valid token but user not in DB raises 401."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod

        # Mock DB to return no user
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        self.mock_db.execute.return_value = mock_result

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "User not found" in exc_info.value.detail

    def test_valid_token_returns_user(self):
        """Valid token with existing user returns the User object."""
        import app.services.auth as auth_mod
        from app.models.user import User

        user = User(
            id="550e8400-e29b-41d4-a716-446655440000",
            email="test@example.com",
            password_hash="...",
            is_admin=False,
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = user
        self.mock_db.execute.return_value = mock_result

        result = asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert result is user
        assert result.email == "test@example.com"


class TestGetCurrentUserTokenType:
    """Tests for token type validation in get_current_user (Fix 1)."""

    @pytest.fixture(autouse=True)
    def _setup_mocks(self):
        import app.services.auth as auth_mod

        self.mock_request = MagicMock()
        self.mock_db = AsyncMock()
        self._get_db_patch = patch.object(auth_mod, "get_db", return_value=self.mock_db)
        self._get_db_patch.start()
        yield
        self._get_db_patch.stop()

    def _make_token(self, type_val, sub=None, email=None, exp_delta=30, include_sub=True, include_email=True):
        """Helper to create a JWT with custom type claim."""
        from app.config import settings

        payload = {
            "type": type_val,
            "exp": datetime.now(UTC) + timedelta(minutes=exp_delta),
        }
        if include_sub:
            payload["sub"] = sub or "550e8400-e29b-41d4-a716-446655440000"
        if include_email:
            payload["email"] = email or "test@example.com"
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        return jwt.encode(payload, secret, algorithm=algorithm)

    def test_refresh_token_rejected(self):
        """A token with type='refresh' is rejected in get_current_user."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod

        refresh_token = self._make_token("refresh")
        self.mock_request.headers = {"Authorization": f"Bearer {refresh_token}"}

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "Invalid token type" in exc_info.value.detail

    def test_missing_type_claim_rejected(self):
        """A token with no 'type' claim is rejected (None != 'access')."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod
        from app.config import settings

        payload = {
            "sub": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "exp": datetime.now(UTC) + timedelta(minutes=30),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        no_type_token = jwt.encode(payload, secret, algorithm=algorithm)

        self.mock_request.headers = {"Authorization": f"Bearer {no_type_token}"}

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "Invalid token type" in exc_info.value.detail

    def test_access_token_accepted_with_valid_user(self):
        """An access token (type='access') with valid user passes through."""
        import app.services.auth as auth_mod
        from app.models.user import User

        access_token = self._make_token("access")
        self.mock_request.headers = {"Authorization": f"Bearer {access_token}"}

        user = User(
            id="550e8400-e29b-41d4-a716-446655440000",
            email="test@example.com",
            password_hash="...",
            is_admin=False,
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = user
        self.mock_db.execute.return_value = mock_result

        result = asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert result is user
        assert result.email == "test@example.com"

    def test_arbitrary_type_value_rejected(self):
        """A token with type='anything_else' is rejected."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod

        weird_token = self._make_token("admin_override")
        self.mock_request.headers = {"Authorization": f"Bearer {weird_token}"}

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_user(self.mock_request, self.mock_db))
        assert exc_info.value.status_code == 401
        assert "Invalid token type" in exc_info.value.detail


class TestGetCurrentAdmin:
    def test_non_admin_user_returns_403(self):
        """Non-admin user raises 403 Forbidden."""
        from fastapi import HTTPException

        import app.services.auth as auth_mod
        from app.models.user import User

        user = User(
            id="550e8400-e29b-41d4-a716-446655440000",
            email="normal@test.com",
            password_hash="...",
            is_admin=False,
        )
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(auth_mod.get_current_admin(user))
        assert exc_info.value.status_code == 403
        assert "Admin access required" in exc_info.value.detail

    def test_admin_user_returns_user(self):
        """Admin user passes through and returns the user."""
        import app.services.auth as auth_mod
        from app.models.user import User

        user = User(
            id="550e8400-e29b-41d4-a716-446655440000",
            email="admin@test.com",
            password_hash="...",
            is_admin=True,
        )
        result = asyncio.run(auth_mod.get_current_admin(user))
        assert result is user
        assert result.is_admin is True


# ---------------------------------------------------------------------------
# Property-based roundtrip: hash_password + verify_password
# ---------------------------------------------------------------------------


class TestPasswordRoundtrip:
    @pytest.mark.parametrize(
        "password",
        [
            "",
            "a",
            "password123",
            "P@ssw0rd!@#$%^&*()",
            " " * 50,
            "a" * 256,
            "unicode_密码_パスワード_🔐",
            "\nnewline\n\t\rtabs",
            "correct horse battery staple",
            "1234567890" * 10,
        ],
    )
    def test_roundtrip_verify_true(self, password):
        """verify_password(password, hash_password(password)) == True for any string."""
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    @pytest.mark.parametrize(
        "password",
        [
            "",
            "a",
            "password123",
            "P@ssw0rd!@#$%^&*()",
            " " * 50,
        ],
    )
    def test_roundtrip_wrong_password_false(self, password):
        """verify_password(wrong, hash_password(password)) == False."""
        hashed = hash_password(password)
        wrong = password + "_extra_suffix_that_changes_it"
        assert verify_password(wrong, hashed) is False


# ---------------------------------------------------------------------------
# Property-based roundtrip: create_access_token + decode_token
# ---------------------------------------------------------------------------


class TestTokenRoundtrip:
    @pytest.mark.parametrize(
        "user_id, email, is_admin",
        [
            ("user-001", "a@b.com", False),
            ("user-002", "admin@domain.com", True),
            ("", "", False),
            ("user-with-dashes", "user+tag@sub.example.co.uk", True),
            ("a" * 100, "x" * 200 + "@test.com", False),
        ],
    )
    def test_access_token_roundtrip(self, user_id, email, is_admin):
        """create_access_token + decode_token preserves all input fields."""
        token = create_access_token(user_id, email, is_admin)
        payload = decode_token(token)
        assert payload["sub"] == user_id
        assert payload["email"] == email
        assert payload["is_admin"] == is_admin
        assert payload["type"] == "access"
        assert "exp" in payload
        assert "jti" in payload

    @pytest.mark.parametrize(
        "user_id",
        [
            "user-rf-001",
            "",
            "user-with-dashes-and_underscores",
            "a" * 100,
        ],
    )
    def test_refresh_token_roundtrip(self, user_id):
        """create_refresh_token + decode_token preserves sub and type."""
        token = create_refresh_token(user_id)
        payload = decode_token(token)
        assert payload["sub"] == user_id
        assert payload["type"] == "refresh"
        assert "exp" in payload
        assert "jti" in payload


# ---------------------------------------------------------------------------
# Edge-case: decode_token
# ---------------------------------------------------------------------------


class TestDecodeTokenEdgeCases:
    def test_expired_token_raises_expired_signature(self):
        """Token with past exp raises jwt.ExpiredSignatureError specifically."""
        from app.config import settings

        expired_payload = {
            "sub": "user-exp",
            "email": "exp@test.com",
            "is_admin": False,
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(hours=24),
        }
        secret = settings.jwt_secret or settings.secret_key
        algorithm = settings.jwt_algorithm
        expired_token = jwt.encode(expired_payload, secret, algorithm=algorithm)
        with pytest.raises(jwt.ExpiredSignatureError):
            decode_token(expired_token)

    def test_empty_string_token_raises(self):
        """decode_token('') raises jwt.PyJWTError."""
        with pytest.raises(jwt.PyJWTError):
            decode_token("")

    def test_malformed_signature_raises(self):
        """A token with a completely garbled signature raises PyJWTError."""
        token = create_access_token("user-mal", "mal@test.com")
        parts = token.split(".")
        parts[2] = "not_a_valid_base64_signature_at_all"
        tampered = ".".join(parts)
        with pytest.raises(jwt.PyJWTError):
            decode_token(tampered)

    def test_only_one_dot_raises(self):
        """Token with only one dot (two parts) raises PyJWTError."""
        with pytest.raises(jwt.PyJWTError):
            decode_token("header.payload")

    def test_no_dots_raises(self):
        """Token with no dots (single blob) raises PyJWTError."""
        with pytest.raises(jwt.PyJWTError):
            decode_token("justarandomstring")


# ---------------------------------------------------------------------------
# Edge-case: create_access_token with unusual inputs
# ---------------------------------------------------------------------------


class TestCreateAccessTokenEdgeCases:
    def test_empty_user_id_does_not_crash(self):
        """create_access_token with empty user_id should not crash."""
        token = create_access_token("", "empty@test.com")
        payload = decode_token(token)
        assert payload["sub"] == ""
        assert payload["email"] == "empty@test.com"

    def test_empty_email_does_not_crash(self):
        """create_access_token with empty email should not crash."""
        token = create_access_token("user-empty-email", "")
        payload = decode_token(token)
        assert payload["sub"] == "user-empty-email"
        assert payload["email"] == ""

    def test_default_is_admin_false(self):
        """create_access_token defaults is_admin to False when omitted."""
        token = create_access_token("user-def", "def@test.com")
        payload = decode_token(token)
        assert payload["is_admin"] is False

    def test_unique_jti_per_call(self):
        """Each call to create_access_token produces a unique jti."""
        token1 = create_access_token("user-jti", "jti@test.com")
        token2 = create_access_token("user-jti", "jti@test.com")
        jti1 = decode_token(token1)["jti"]
        jti2 = decode_token(token2)["jti"]
        assert jti1 != jti2


# ---------------------------------------------------------------------------
# Edge-case: verify_password
# ---------------------------------------------------------------------------


class TestPasswordEdgeCases:
    def test_none_hashed_returns_false(self):
        """verify_password with None hashed returns False (passlib treats None as string)."""
        result = verify_password("anything", None)  # type: ignore[arg-type]
        assert result is False

    def test_none_plain_raises_type_error(self):
        """verify_password with None plain raises TypeError."""
        hashed = hash_password("test")
        with pytest.raises(TypeError):
            verify_password(None, hashed)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# _get_redis race condition: concurrent calls
# ---------------------------------------------------------------------------


class TestGetRedisRaceCondition:
    def test_concurrent_calls_return_same_instance(self):
        """Two concurrent _get_redis() calls return the same instance."""
        import app.services.auth as auth_mod

        async def call_get_redis():
            return await auth_mod._get_redis()

        mock_redis = AsyncMock()
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            with (
                patch.object(auth_mod, "_redis", None),
                patch.object(auth_mod.redis.Redis, "from_url", return_value=mock_redis),
            ):
                r1, r2 = loop.run_until_complete(asyncio.gather(call_get_redis(), call_get_redis()))
                assert r1 is r2
                assert r1 is mock_redis
        finally:
            loop.close()
