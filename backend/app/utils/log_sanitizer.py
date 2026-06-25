"""Logging sanitizer — prevents credentials from leaking into log output."""

from __future__ import annotations

import re
from typing import Any

# Keys whose values are always redacted
_REDACTED_KEYS: frozenset[str] = frozenset(
    {
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
    }
)

# Substrings that indicate a key should be redacted (case-insensitive partial match)
_REDACTED_KEY_SUBSTRINGS: tuple[str, ...] = (
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "jwt",
    "credential",
)

_REDACTED_VALUE = "[REDACTED]"
_REDACTED_JWT = "[REDACTED_JWT]"
_MAX_STRING_LENGTH = 500

# JWT header pattern (base64url of {"alg":..., "typ":"JWT"} typically starts with "eyJ")
_JWT_PATTERN = re.compile(r"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$")


def _key_is_sensitive(key: str) -> bool:
    """Check if a key name indicates sensitive content."""
    key_lower = key.lower()
    if key_lower in _REDACTED_KEYS:
        return True
    return any(sub in key_lower for sub in _REDACTED_KEY_SUBSTRINGS)


def _looks_like_jwt(value: str) -> bool:
    """Return True if the string looks like a JWT token."""
    return bool(_JWT_PATTERN.match(value))


def sanitize_for_log(obj: Any, max_string_length: int = _MAX_STRING_LENGTH) -> Any:
    """Recursively redact sensitive values from *obj* for safe logging.

    - Dict keys matching sensitive names → ``"[REDACTED]"``
    - Strings that look like JWTs → ``"[REDACTED_JWT]"``
    - Long strings are truncated to *max_string_length* characters
    - Lists and nested dicts are processed recursively
    - Non-dict/list/string values are returned unchanged

    Returns a new object; the original is never mutated.
    """
    if isinstance(obj, dict):
        return {
            key: _sanitize_value(key, value, max_string_length) for key, value in obj.items()
        }
    if isinstance(obj, list):
        return [sanitize_for_log(item, max_string_length) for item in obj]
    if isinstance(obj, str):
        return _sanitize_string(obj, max_string_length)
    return obj


def _sanitize_value(key: str, value: Any, max_string_length: int) -> Any:
    """Sanitize a single key-value pair."""
    if _key_is_sensitive(key):
        if isinstance(value, (dict, list)):
            return _redact_all(value)
        return _REDACTED_VALUE
    return sanitize_for_log(value, max_string_length)


def _sanitize_string(value: str, max_string_length: int) -> str:
    """Sanitize a plain string value."""
    if _looks_like_jwt(value):
        return _REDACTED_JWT
    if len(value) > max_string_length:
        return value[:max_string_length] + "..."
    return value


def _redact_all(obj: Any) -> Any:
    """Recursively replace every leaf value with [REDACTED]."""
    if isinstance(obj, dict):
        return {key: _redact_all(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [_redact_all(item) for item in obj]
    return _REDACTED_VALUE
