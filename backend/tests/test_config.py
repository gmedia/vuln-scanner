"""Tests for app.config — _build_redis_url, check_settings, and Settings defaults."""

import logging

import pytest

from app.config import (
    DEV_API_KEY_PREFIXES,
    DEV_SECRET_PREFIXES,
    RECOMMENDED_STRENGTH,
    _SENTINEL,
    _build_redis_url,
    _is_dev_value,
    _warn_dev_value,
    check_settings,
    settings,
)


# ── _build_redis_url ──────────────────────────────────────────────────────


def test_build_redis_url_no_password(monkeypatch):
    """Returns default URL when REDIS_PASSWORD is not set."""
    monkeypatch.delenv("REDIS_PASSWORD", raising=False)
    url = _build_redis_url()
    assert url == "redis://redis:6379/0"


def test_build_redis_url_with_password(monkeypatch):
    """Returns URL with password when REDIS_PASSWORD is set."""
    monkeypatch.setenv("REDIS_PASSWORD", "secret123")
    url = _build_redis_url()
    assert url == "redis://:secret123@redis:6379/0"


# ── _is_dev_value ─────────────────────────────────────────────────────────


def test_is_dev_value_matches_prefix():
    assert _is_dev_value("dev-api-key-foo", DEV_API_KEY_PREFIXES) is True
    assert _is_dev_value("dev-secret-key-bar", DEV_SECRET_PREFIXES) is True
    assert _is_dev_value("dev-secret-xyz", DEV_SECRET_PREFIXES) is True


def test_is_dev_value_rejects_non_dev():
    assert _is_dev_value("prod-secret", DEV_SECRET_PREFIXES) is False
    assert _is_dev_value("", DEV_SECRET_PREFIXES) is False


# ── _warn_dev_value ──────────────────────────────────────────────────────


def test_warn_dev_value_logs_warning(caplog):
    caplog.set_level(logging.WARNING)
    _warn_dev_value("SECRET_KEY", "dev-secret-key-abc123")
    assert "SECRET_KEY" in caplog.text
    assert "dev-secret-key-a" in caplog.text
    assert str(RECOMMENDED_STRENGTH) in caplog.text


# ── check_settings: API_KEY ───────────────────────────────────────────────


def test_check_settings_api_key_unset(caplog, monkeypatch):
    """When API_KEY is the sentinel, warning is logged."""
    monkeypatch.setattr(settings, "api_key", _SENTINEL)
    monkeypatch.setattr(settings, "secret_key", "strong-secret")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost")
    caplog.set_level(logging.WARNING)
    check_settings()
    assert any("API_KEY is not set" in rec.message for rec in caplog.records)


def test_check_settings_api_key_dev(caplog, monkeypatch):
    """When API_KEY starts with a dev prefix, dev-value warning is logged."""
    monkeypatch.setattr(settings, "api_key", "dev-api-key-change-me")
    monkeypatch.setattr(settings, "secret_key", "strong-secret")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost")
    caplog.set_level(logging.WARNING)
    check_settings()
    assert any("API_KEY" in rec.message and "development placeholder" in rec.message for rec in caplog.records)


def test_check_settings_api_key_strong(caplog, monkeypatch):
    """When API_KEY is a strong value, no warning is logged."""
    monkeypatch.setattr(settings, "api_key", "prod-key-strong-random-value")
    monkeypatch.setattr(settings, "secret_key", "strong-secret")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost")
    caplog.set_level(logging.WARNING)
    check_settings()
    api_key_warnings = [rec for rec in caplog.records if "API_KEY" in rec.message]
    assert len(api_key_warnings) == 0


# ── check_settings: SECRET_KEY ────────────────────────────────────────────


def test_check_settings_secret_key_unset(caplog, monkeypatch):
    """When SECRET_KEY is the sentinel, warning is logged."""
    monkeypatch.setattr(settings, "api_key", "strong-key")
    monkeypatch.setattr(settings, "secret_key", _SENTINEL)
    monkeypatch.setattr(settings, "cors_origins", "http://localhost")
    caplog.set_level(logging.WARNING)
    check_settings()
    assert any("SECRET_KEY is not set" in rec.message for rec in caplog.records)


def test_check_settings_secret_key_dev_secret(caplog, monkeypatch):
    """When SECRET_KEY starts with 'dev-secret', dev-value warning is logged."""
    monkeypatch.setattr(settings, "api_key", "strong-key")
    monkeypatch.setattr(settings, "secret_key", "dev-secret-abc1234567890")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost")
    caplog.set_level(logging.WARNING)
    check_settings()
    assert any("SECRET_KEY" in rec.message and "development placeholder" in rec.message for rec in caplog.records)


def test_check_settings_secret_key_dev_secret_key(caplog, monkeypatch):
    """When SECRET_KEY starts with 'dev-secret-key', dev-value warning is logged."""
    monkeypatch.setattr(settings, "api_key", "strong-key")
    monkeypatch.setattr(settings, "secret_key", "dev-secret-key-abc1234567890")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost")
    caplog.set_level(logging.WARNING)
    check_settings()
    assert any("SECRET_KEY" in rec.message and "development placeholder" in rec.message for rec in caplog.records)


def test_check_settings_secret_key_strong(caplog, monkeypatch):
    """When SECRET_KEY is a strong value, no warning is logged."""
    monkeypatch.setattr(settings, "api_key", "strong-key")
    monkeypatch.setattr(settings, "secret_key", "prod-secret-strong-random-value")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost")
    caplog.set_level(logging.WARNING)
    check_settings()
    secret_key_warnings = [rec for rec in caplog.records if "SECRET_KEY" in rec.message]
    assert len(secret_key_warnings) == 0


# ── check_settings: CORS_ORIGINS ─────────────────────────────────────────


def test_check_settings_cors_origins_wildcard(caplog, monkeypatch):
    """When CORS_ORIGINS is '*', a warning is logged."""
    monkeypatch.setattr(settings, "api_key", "strong-key")
    monkeypatch.setattr(settings, "secret_key", "strong-secret")
    monkeypatch.setattr(settings, "cors_origins", "*")
    caplog.set_level(logging.WARNING)
    check_settings()
    assert any("CORS_ORIGINS is set to wildcard" in rec.message for rec in caplog.records)


def test_check_settings_cors_origins_empty(caplog, monkeypatch):
    """When CORS_ORIGINS is empty, a warning is logged."""
    monkeypatch.setattr(settings, "api_key", "strong-key")
    monkeypatch.setattr(settings, "secret_key", "strong-secret")
    monkeypatch.setattr(settings, "cors_origins", "")
    caplog.set_level(logging.WARNING)
    check_settings()
    assert any("CORS_ORIGINS is empty" in rec.message for rec in caplog.records)


def test_check_settings_cors_origins_whitespace_only(caplog, monkeypatch):
    """When CORS_ORIGINS is whitespace only, a warning is logged."""
    monkeypatch.setattr(settings, "api_key", "strong-key")
    monkeypatch.setattr(settings, "secret_key", "strong-secret")
    monkeypatch.setattr(settings, "cors_origins", "   ")
    caplog.set_level(logging.WARNING)
    check_settings()
    assert any("CORS_ORIGINS is empty" in rec.message for rec in caplog.records)


def test_check_settings_cors_origins_valid(caplog, monkeypatch):
    """When CORS_ORIGINS is a valid list, no CORS warning is logged."""
    monkeypatch.setattr(settings, "api_key", "strong-key")
    monkeypatch.setattr(settings, "secret_key", "strong-secret")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost:5173,http://example.com")
    caplog.set_level(logging.WARNING)
    check_settings()
    cors_warnings = [rec for rec in caplog.records if "CORS_ORIGINS" in rec.message]
    assert len(cors_warnings) == 0
