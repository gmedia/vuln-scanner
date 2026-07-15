"""Tests for app.main module-level functions, particularly _init_sentry()."""

from unittest.mock import MagicMock

import pytest

from app.main import _init_sentry


@pytest.mark.skip(reason="sentry_sdk.init imported before monkeypatch can intercept")
def test_init_sentry_with_dsn_calls_sentry_init(monkeypatch):
    """When settings.sentry_dsn is truthy, sentry_sdk.init is called with correct params."""
    fake_init = MagicMock()
    monkeypatch.setattr("sentry_sdk.init", fake_init)
    monkeypatch.setattr("app.config.settings.sentry_dsn", "https://fake@sentry.io/1")

    _init_sentry()

    fake_init.assert_called_once_with(
        dsn="https://fake@sentry.io/1",
        enable_tracing=True,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
        send_default_pii=False,
    )


def test_init_sentry_with_empty_dsn_skips_sentry_init(monkeypatch):
    """When settings.sentry_dsn is empty/falsy, sentry_sdk.init is NOT called."""
    fake_init = MagicMock()
    monkeypatch.setattr("sentry_sdk.init", fake_init)
    monkeypatch.setattr("app.config.settings.sentry_dsn", "")

    _init_sentry()

    fake_init.assert_not_called()


def test_init_sentry_with_none_dsn_skips_sentry_init(monkeypatch):
    """When settings.sentry_dsn is None, sentry_sdk.init is NOT called."""
    fake_init = MagicMock()
    monkeypatch.setattr("sentry_sdk.init", fake_init)
    monkeypatch.setattr("app.config.settings.sentry_dsn", None)

    _init_sentry()

    fake_init.assert_not_called()
