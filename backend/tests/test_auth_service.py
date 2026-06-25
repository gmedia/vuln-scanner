import time
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
import jwt

from app.services.auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
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
        secret = settings.jwt_secret or settings.secret_key
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
