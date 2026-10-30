import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

from datetime import date  # noqa: E402
from decimal import Decimal  # noqa: E402
from unittest.mock import MagicMock  # noqa: E402
from urllib.parse import urlparse  # noqa: E402

from app.config import settings  # noqa: E402

from celery_app import celery_app  # noqa: E402
from tasks import ai_fx  # noqa: E402
from tasks.ai_fx import refresh_ai_fx  # noqa: E402


def _expected_source() -> str:
    return urlparse(settings.ai_fx_source_url).hostname or "auto"


def test_returns_skipped_when_ai_gateway_disabled(monkeypatch):
    monkeypatch.setattr(settings, "ai_gateway_enabled", False)
    fetch = MagicMock(side_effect=AssertionError("fetch_rate_sync must not run"))
    session_factory = MagicMock(side_effect=AssertionError("DB must not be touched"))
    monkeypatch.setattr(ai_fx, "fetch_rate_sync", fetch)
    monkeypatch.setattr(ai_fx, "get_sync_session", session_factory)

    assert refresh_ai_fx() == {"skipped": "ai_gateway_disabled"}
    fetch.assert_not_called()
    session_factory.assert_not_called()


def test_returns_skipped_when_auto_fetch_disabled(monkeypatch):
    monkeypatch.setattr(settings, "ai_gateway_enabled", True)
    monkeypatch.setattr(settings, "ai_fx_auto_fetch", False)
    fetch = MagicMock(side_effect=AssertionError("fetch_rate_sync must not run"))
    session_factory = MagicMock(side_effect=AssertionError("DB must not be touched"))
    monkeypatch.setattr(ai_fx, "fetch_rate_sync", fetch)
    monkeypatch.setattr(ai_fx, "get_sync_session", session_factory)

    assert refresh_ai_fx() == {"skipped": "auto_fetch_disabled"}
    fetch.assert_not_called()
    session_factory.assert_not_called()


def test_stores_fetched_rate_and_returns_json_values(monkeypatch):
    rate = Decimal("16350.25")
    effective_date = date(2026, 10, 30)
    session = MagicMock()
    upsert = MagicMock()

    monkeypatch.setattr(settings, "ai_gateway_enabled", True)
    monkeypatch.setattr(settings, "ai_fx_auto_fetch", True)
    monkeypatch.setattr(ai_fx, "fetch_rate_sync", MagicMock(return_value=(rate, effective_date)))
    monkeypatch.setattr(ai_fx, "get_sync_session", MagicMock(return_value=session))
    monkeypatch.setattr(ai_fx, "upsert_rate_sync", upsert)

    result = refresh_ai_fx()

    assert result == {
        "rate": "16350.25",
        "effective_date": "2026-10-30",
        "source": _expected_source(),
    }
    upsert.assert_called_once()
    assert upsert.call_args.args[0] is session
    assert upsert.call_args.kwargs == {
        "rate": rate,
        "source": _expected_source(),
        "effective_date": effective_date,
    }
    session.commit.assert_called_once()
    session.rollback.assert_not_called()
    session.close.assert_called_once()


def test_upstream_failure_rolls_back_and_does_not_raise(monkeypatch):
    session = MagicMock()

    monkeypatch.setattr(settings, "ai_gateway_enabled", True)
    monkeypatch.setattr(settings, "ai_fx_auto_fetch", True)
    monkeypatch.setattr(
        ai_fx,
        "fetch_rate_sync",
        MagicMock(side_effect=ai_fx.FxFetchError("FX source request failed: HTTPStatusError")),
    )
    monkeypatch.setattr(ai_fx, "get_sync_session", MagicMock(return_value=session))
    upsert = MagicMock()
    monkeypatch.setattr(ai_fx, "upsert_rate_sync", upsert)

    assert refresh_ai_fx() == {"error": "fx_fetch_failed"}
    upsert.assert_not_called()
    session.rollback.assert_called_once()
    session.commit.assert_not_called()
    session.close.assert_called_once()


def test_beat_schedule_and_route_register_daily_refresh():
    entry = celery_app.conf.beat_schedule["ai-fx-refresh-daily"]

    assert entry["task"] == "ai_fx.refresh"
    assert entry["schedule"].hour == {1}
    assert entry["schedule"].minute == {10}
    assert celery_app.conf.task_routes["ai_fx.refresh"]["queue"] == "ip_scan"
