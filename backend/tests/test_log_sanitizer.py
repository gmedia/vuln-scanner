"""Unit tests for the log sanitizer — verifies credential redaction and string sanitization."""

import pytest

from app.utils.log_sanitizer import (
    _key_is_sensitive,
    _looks_like_jwt,
    sanitize_for_log,
)


# ---------------------------------------------------------------------------
# _key_is_sensitive
# ---------------------------------------------------------------------------


class TestKeyIsSensitive:
    """Direct tests for the internal _key_is_sensitive function."""

    @pytest.mark.parametrize(
        "key",
        [
            "password",
            "passwd",
            "secret",
            "token",
            "api_key",
            "apikey",
            "authorization",
            "jwt",
            "credential",
            "key_hash",
            "confirm_password",
            "refresh_token",
            "access_token",
            "smtp_pass",
            "admin_password",
            "password_hash",
        ],
    )
    def test_exact_match_sensitive(self, key):
        """All keys in _REDACTED_KEYS should be detected."""
        assert _key_is_sensitive(key) is True

    @pytest.mark.parametrize(
        "key",
        [
            "x_api_key",
            "Authorization",
            "JWT_TOKEN",
            "my_password_field",
            "some_secret_value",
            "user_credential_x",
            "apiKey",
            "APIKEY",
        ],
    )
    def test_substring_match_sensitive(self, key):
        """Keys containing sensitive substrings should be detected."""
        assert _key_is_sensitive(key) is True

    @pytest.mark.parametrize(
        "key",
        [
            "name",
            "email",
            "username",
            "description",
            "target",
            "scan_type",
            "url",
            "host",
            "port",
            "id",
            "user_id",
            "status",
            "category",
        ],
    )
    def test_non_sensitive_keys(self, key):
        """Regular keys should not be flagged as sensitive."""
        assert _key_is_sensitive(key) is False

    def test_empty_string(self):
        assert _key_is_sensitive("") is False

    def test_case_insensitive(self):
        """Sensitivity check must be case-insensitive."""
        assert _key_is_sensitive("PASSWORD") is True
        assert _key_is_sensitive("Secret") is True
        assert _key_is_sensitive("Token") is True
        assert _key_is_sensitive("Authorization") is True


# ---------------------------------------------------------------------------
# _looks_like_jwt
# ---------------------------------------------------------------------------


class TestLooksLikeJwt:
    """Direct tests for the internal _looks_like_jwt function."""

    def test_standard_jwt(self):
        # Typical JWT: header.payload.signature — all base64url
        jwt_str = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0."
            "dqw4w9WgXcQ"
        )
        assert _looks_like_jwt(jwt_str) is True

    def test_jwt_without_signature(self):
        jwt_str = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ."
        assert _looks_like_jwt(jwt_str) is True

    def test_minimal_jwt(self):
        jwt_str = "eyJhIjoiYiJ9.eyJjIjoiZCJ9.e"
        assert _looks_like_jwt(jwt_str) is True

    def test_non_jwt_base64_string(self):
        """A base64 string not starting with eyJ should not be flagged."""
        assert _looks_like_jwt("dGVzdA==") is False

    def test_plain_string(self):
        assert _looks_like_jwt("hello world") is False

    def test_partial_jwt_like(self):
        """eyJ alone without dots should not match."""
        assert _looks_like_jwt("eyJsomething") is False

    def test_jwt_with_extra_segments(self):
        """JWTs have exactly 3 segments (2 dots)."""
        assert _looks_like_jwt("eyJh.eyJi.eyJj.eyJk") is False

    def test_empty_string(self):
        assert _looks_like_jwt("") is False

    def test_single_dot(self):
        assert _looks_like_jwt("eyJh.eyJi") is False

    def test_similar_but_wrong_start(self):
        """Must start with eyJ (base64url encoding of {"...)."""
        assert _looks_like_jwt("eXJh.eXJi.eXJj") is False


# ---------------------------------------------------------------------------
# sanitize_for_log — dicts
# ---------------------------------------------------------------------------


class TestSanitizeDict:
    def test_sensitive_keys_redacted(self):
        data = {
            "username": "alice",
            "password": "s3cret123",
            "email": "alice@example.com",
        }
        result = sanitize_for_log(data)
        assert result["username"] == "alice"
        assert result["password"] == "[REDACTED]"
        assert result["email"] == "alice@example.com"

    def test_all_sensitive_key_variants(self):
        data = {
            "password": "p",
            "passwd": "p2",
            "secret": "s",
            "token": "t",
            "api_key": "ak",
            "apikey": "ak2",
            "authorization": "Bearer xyz",
            "jwt": "eyJ...",
            "credential": "cr",
            "key_hash": "kh",
            "confirm_password": "cp",
            "refresh_token": "rt",
            "access_token": "at",
            "smtp_pass": "sp",
            "admin_password": "ap",
            "password_hash": "ph",
        }
        result = sanitize_for_log(data)
        for key in data:
            assert result[key] == "[REDACTED]", f"Key '{key}' was not redacted"

    def test_non_sensitive_keys_passthrough(self):
        data = {"name": "Bob", "email": "bob@test.com", "role": "admin"}
        result = sanitize_for_log(data)
        assert result == data

    def test_mixed_sensitive_and_non_sensitive(self):
        data = {"username": "carol", "token": "abc123", "description": "test"}
        result = sanitize_for_log(data)
        assert result["username"] == "carol"
        assert result["token"] == "[REDACTED]"
        assert result["description"] == "test"

    def test_empty_dict(self):
        assert sanitize_for_log({}) == {}

    def test_case_insensitive_keys(self):
        data = {"Password": "p", "TOKEN": "t", "Secret": "s"}
        result = sanitize_for_log(data)
        assert result["Password"] == "[REDACTED]"
        assert result["TOKEN"] == "[REDACTED]"
        assert result["Secret"] == "[REDACTED]"

    def test_substring_match_keys(self):
        data = {
            "user_password": "p",
            "api_token": "t",
            "my_secret_key": "s",
        }
        result = sanitize_for_log(data)
        assert result["user_password"] == "[REDACTED]"
        assert result["api_token"] == "[REDACTED]"
        assert result["my_secret_key"] == "[REDACTED]"


# ---------------------------------------------------------------------------
# sanitize_for_log — nested structures
# ---------------------------------------------------------------------------


class TestSanitizeNested:
    def test_nested_dict_sensitive_at_depth(self):
        data = {
            "level1": {
                "safe": "ok",
                "nested": {
                    "password": "deep_secret",
                    "info": "public",
                },
            }
        }
        result = sanitize_for_log(data)
        assert result["level1"]["safe"] == "ok"
        assert result["level1"]["nested"]["password"] == "[REDACTED]"
        assert result["level1"]["nested"]["info"] == "public"

    def test_nested_dict_sensitive_at_top_level(self):
        data = {
            "token": {
                "sub": "user-1",
                "exp": 1234567890,
                "iat": 1234567800,
            }
        }
        result = sanitize_for_log(data)
        # When the key itself is sensitive, the entire dict is redacted
        assert result["token"] == {"sub": "[REDACTED]", "exp": "[REDACTED]", "iat": "[REDACTED]"}

    def test_deeply_nested_redaction(self):
        data = {"a": {"b": {"c": {"d": {"secret": "very-deep"}}}}}
        result = sanitize_for_log(data)
        assert result["a"]["b"]["c"]["d"]["secret"] == "[REDACTED]"

    def test_nested_list_of_dicts_with_sensitive(self):
        data = {
            "users": [
                {"name": "alice", "password": "p1"},
                {"name": "bob", "password": "p2"},
            ]
        }
        result = sanitize_for_log(data)
        assert result["users"][0]["name"] == "alice"
        assert result["users"][0]["password"] == "[REDACTED]"
        assert result["users"][1]["name"] == "bob"
        assert result["users"][1]["password"] == "[REDACTED]"

    def test_list_of_nested_dicts(self):
        data = [
            {"level": 1, "token": "abc"},
            {"level": 2, "data": {"api_key": "xyz"}},
        ]
        result = sanitize_for_log(data)
        assert result[0]["level"] == 1
        assert result[0]["token"] == "[REDACTED]"
        assert result[1]["level"] == 2
        assert result[1]["data"]["api_key"] == "[REDACTED]"

    def test_mixed_nested_structures(self):
        data = {
            "results": [
                {"id": 1, "auth": {"token": "jwt...", "type": "bearer"}},
                {"id": 2, "auth": {"token": "jwt2...", "type": "bearer"}},
            ],
            "meta": {"count": 2, "secret": "admin-secret"},
        }
        result = sanitize_for_log(data)
        assert result["results"][0]["id"] == 1
        assert result["results"][0]["auth"]["token"] == "[REDACTED]"
        assert result["results"][0]["auth"]["type"] == "bearer"
        assert result["results"][1]["id"] == 2
        assert result["results"][1]["auth"]["token"] == "[REDACTED]"
        assert result["meta"]["count"] == 2
        assert result["meta"]["secret"] == "[REDACTED]"


# ---------------------------------------------------------------------------
# sanitize_for_log — strings (JWT, long strings)
# ---------------------------------------------------------------------------


class TestSanitizeStrings:
    def test_jwt_redacted(self):
        jwt_str = (
            "eyJhbGciOiJIUzI1NiJ9."
            "eyJzdWIiOiIxMjM0NTY3ODkwIn0."
            "abc123def456"
        )
        result = sanitize_for_log(jwt_str)
        assert result == "[REDACTED_JWT]"

    def test_regular_string_passthrough(self):
        assert sanitize_for_log("hello world") == "hello world"

    def test_empty_string_passthrough(self):
        assert sanitize_for_log("") == ""

    def test_long_string_truncated(self):
        long_str = "x" * 600
        result = sanitize_for_log(long_str)
        assert len(result) == 503  # 500 + "..."
        assert result.endswith("...")
        assert result.startswith("x" * 500)

    def test_string_exactly_at_limit(self):
        s = "a" * 500
        result = sanitize_for_log(s)
        assert result == s
        assert not result.endswith("...")

    def test_string_one_over_limit(self):
        s = "a" * 501
        result = sanitize_for_log(s)
        assert result == "a" * 500 + "..."

    def test_long_string_custom_limit(self):
        long_str = "y" * 200
        result = sanitize_for_log(long_str, max_string_length=100)
        assert result == "y" * 100 + "..."

    def test_long_string_zero_limit(self):
        result = sanitize_for_log("hello", max_string_length=0)
        assert result == "..."

    def test_jwt_not_truncated(self):
        """A JWT longer than 500 chars should still be redacted as JWT, not truncated."""
        header = "eyJhbGciOiJIUzI1NiJ9"
        payload = "eyJzdWIiOiI" + "A" * 600 + "In0"
        jwt_str = f"{header}.{payload}.sig"
        result = sanitize_for_log(jwt_str)
        assert result == "[REDACTED_JWT]"


# ---------------------------------------------------------------------------
# sanitize_for_log — non-dict/list/string types
# ---------------------------------------------------------------------------


class TestSanitizeScalars:
    def test_int_unchanged(self):
        assert sanitize_for_log(42) == 42

    def test_float_unchanged(self):
        assert sanitize_for_log(3.14) == 3.14

    def test_bool_unchanged(self):
        assert sanitize_for_log(True) is True
        assert sanitize_for_log(False) is False

    def test_none_unchanged(self):
        assert sanitize_for_log(None) is None

    def test_bytes_unchanged(self):
        assert sanitize_for_log(b"raw bytes") == b"raw bytes"


# ---------------------------------------------------------------------------
# sanitize_for_log — edge cases
# ---------------------------------------------------------------------------


class TestSanitizeEdgeCases:
    def test_empty_list(self):
        assert sanitize_for_log([]) == []

    def test_list_of_scalars(self):
        assert sanitize_for_log([1, "hello", None, True]) == [1, "hello", None, True]

    def test_list_with_jwt_strings(self):
        data = ["normal", "eyJh.eyJi.eyJj"]
        result = sanitize_for_log(data)
        assert result[0] == "normal"
        assert result[1] == "[REDACTED_JWT]"

    def test_original_not_mutated(self):
        data = {"password": "secret", "name": "test"}
        sanitize_for_log(data)
        assert data["password"] == "secret"  # original unchanged

    def test_nested_original_not_mutated(self):
        data = {"outer": {"password": "inner-secret"}}
        sanitize_for_log(data)
        assert data["outer"]["password"] == "inner-secret"

    def test_sensitive_key_with_none_value(self):
        data = {"token": None}
        result = sanitize_for_log(data)
        # token key is sensitive — value is not dict/list so gets "[REDACTED]"
        assert result["token"] == "[REDACTED]"

    def test_sensitive_key_with_int_value(self):
        data = {"password": 12345}
        result = sanitize_for_log(data)
        assert result["password"] == "[REDACTED]"

    def test_sensitive_key_with_list_value(self):
        data = {"tokens": [{"jwt": "eyJ..."}, {"jwt": "eyJ..."}]}
        result = sanitize_for_log(data)
        # tokens has substring "token" → sensitive → entire list redacted recursively
        assert result["tokens"] == [{"jwt": "[REDACTED]"}, {"jwt": "[REDACTED]"}]

    def test_sensitive_key_with_nested_dict_value(self):
        data = {"credentials": {"user": "admin", "pass": "s3cret"}}
        result = sanitize_for_log(data)
        # credentials is sensitive → full recursive redaction
        assert result["credentials"] == {"user": "[REDACTED]", "pass": "[REDACTED]"}

    def test_jwt_inside_dict_value(self):
        data = {"header": "eyJh.eyJi.eyJj", "other": "normal"}
        result = sanitize_for_log(data)
        assert result["header"] == "[REDACTED_JWT]"
        assert result["other"] == "normal"

    def test_tuple_unchanged(self):
        """Non-dict/list/string types (including tuples) pass through."""
        assert sanitize_for_log((1, 2, 3)) == (1, 2, 3)

    def test_complex_real_world_payload(self):
        """Simulate a real API request/response log entry."""
        data = {
            "method": "POST",
            "path": "/api/auth/login",
            "status": 200,
            "request": {
                "body": {
                    "email": "user@test.com",
                    "password": "real-password-should-not-leak",
                },
                "headers": {
                    "content-type": "application/json",
                    "authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig",
                },
            },
            "response": {
                "body": {
                    "access_token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig",
                    "refresh_token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig2",
                    "user": {"id": "abc", "email": "user@test.com", "credits": 100},
                },
            },
        }
        result = sanitize_for_log(data)

        # Top level
        assert result["method"] == "POST"
        assert result["path"] == "/api/auth/login"
        assert result["status"] == 200

        # Request body — password redacted
        assert result["request"]["body"]["email"] == "user@test.com"
        assert result["request"]["body"]["password"] == "[REDACTED]"

        # Request headers — authorization redacted
        assert result["request"]["headers"]["content-type"] == "application/json"
        assert result["request"]["headers"]["authorization"] == "[REDACTED]"

        # Response body — token fields redacted, JWT strings redacted
        assert result["response"]["body"]["access_token"] == "[REDACTED]"
        assert result["response"]["body"]["refresh_token"] == "[REDACTED]"
        assert result["response"]["body"]["user"]["id"] == "abc"
        assert result["response"]["body"]["user"]["email"] == "user@test.com"
        assert result["response"]["body"]["user"]["credits"] == 100
