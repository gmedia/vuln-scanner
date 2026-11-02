import sys
import types
from pathlib import Path

_WORKERS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_WORKERS))
sys.path.insert(0, str(_WORKERS.parent / "backend"))

from unittest.mock import MagicMock  # noqa: E402

import app.services.ai_breaker  # noqa: E402, F401
import httpx  # noqa: E402
from app.config import settings  # noqa: E402

from celery_app import celery_app  # noqa: E402
from tasks import ai_providers  # noqa: E402
from tasks.ai_providers import probe_ai_providers  # noqa: E402


def _set_settings(monkeypatch, *, gateway=True, probe=True, timeout=2.5):
    monkeypatch.setattr(settings, "ai_gateway_enabled", gateway)
    monkeypatch.setattr(settings, "ai_provider_probe_enabled", probe)
    monkeypatch.setattr(settings, "ai_provider_probe_timeout_seconds", timeout)


def _provider(
    name="primary",
    *,
    status="ok",
    base_url="https://up.example/v1",
    auth_header="Authorization",
    credential_enc="",
):
    return types.SimpleNamespace(
        id=f"id-{name}",
        name=name,
        status=status,
        base_url=base_url,
        auth_header=auth_header,
        credential_enc=credential_enc,
    )


def _response(status_code):
    return types.SimpleNamespace(status_code=status_code)


def _run(monkeypatch, providers, client):
    session = MagicMock()
    session.execute.return_value.scalars.return_value.all.return_value = providers
    monkeypatch.setattr(ai_providers, "get_sync_session", MagicMock(return_value=session))
    monkeypatch.setattr(ai_providers.httpx, "Client", MagicMock(return_value=client))
    return probe_ai_providers(), session


def test_skips_without_touching_db_or_http_when_gateway_disabled(monkeypatch):
    _set_settings(monkeypatch, gateway=False)
    session_factory = MagicMock(side_effect=AssertionError("DB must not be touched"))
    client_factory = MagicMock(side_effect=AssertionError("HTTP must not be touched"))
    monkeypatch.setattr(ai_providers, "get_sync_session", session_factory)
    monkeypatch.setattr(ai_providers.httpx, "Client", client_factory)

    assert probe_ai_providers() == {"skipped": "ai_gateway_disabled"}
    session_factory.assert_not_called()
    client_factory.assert_not_called()


def test_skips_without_touching_db_or_http_when_probe_disabled(monkeypatch):
    _set_settings(monkeypatch, gateway=True, probe=False)
    session_factory = MagicMock(side_effect=AssertionError("DB must not be touched"))
    client_factory = MagicMock(side_effect=AssertionError("HTTP must not be touched"))
    monkeypatch.setattr(ai_providers, "get_sync_session", session_factory)
    monkeypatch.setattr(ai_providers.httpx, "Client", client_factory)

    assert probe_ai_providers() == {"skipped": "probe_disabled"}
    session_factory.assert_not_called()
    client_factory.assert_not_called()


def test_ok_provider_is_marked_ok(monkeypatch):
    _set_settings(monkeypatch)
    provider = _provider()
    client = MagicMock()
    client.get.side_effect = [_response(200)]

    result, session = _run(monkeypatch, [provider], client)

    assert result == {"probed": 1, "ok": 1, "degraded": 0, "unverified": 0, "errors": 0}
    assert provider.status == "ok"
    client.get.assert_called_once_with("https://up.example/v1/models", headers={"Authorization": "Bearer "})
    session.commit.assert_called_once()
    session.rollback.assert_not_called()
    session.close.assert_called_once()


def test_auth_failure_marks_provider_degraded(monkeypatch):
    _set_settings(monkeypatch)
    provider = _provider()
    client = MagicMock()
    client.get.side_effect = [_response(401)]

    result, _ = _run(monkeypatch, [provider], client)

    assert result == {"probed": 1, "ok": 0, "degraded": 1, "unverified": 0, "errors": 0}
    assert provider.status == "degraded"


def test_server_error_marks_provider_degraded(monkeypatch):
    _set_settings(monkeypatch)
    provider = _provider()
    client = MagicMock()
    client.get.side_effect = [_response(503)]

    result, _ = _run(monkeypatch, [provider], client)

    assert result == {"probed": 1, "ok": 0, "degraded": 1, "unverified": 0, "errors": 0}
    assert provider.status == "degraded"


def test_transport_error_degrades_and_the_loop_continues(monkeypatch):
    _set_settings(monkeypatch)
    broken = _provider("broken")
    healthy = _provider("healthy")
    client = MagicMock()
    client.get.side_effect = [httpx.ConnectError("down"), _response(200)]

    result, _ = _run(monkeypatch, [broken, healthy], client)

    assert result == {"probed": 2, "ok": 1, "degraded": 1, "unverified": 0, "errors": 0}
    assert broken.status == "degraded"
    assert healthy.status == "ok"


def test_selection_excludes_disabled_providers(monkeypatch):
    _set_settings(monkeypatch)
    provider = _provider()
    client = MagicMock()
    client.get.side_effect = [_response(200)]

    _, session = _run(monkeypatch, [provider], client)

    statement = session.execute.call_args.args[0]
    sql = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "ai_providers.enabled IS true" in sql
    assert "ai_providers.status != 'disabled'" in sql
    assert provider.status == "ok"


def test_missing_models_endpoint_leaves_status_unverified(monkeypatch):
    _set_settings(monkeypatch)
    provider = _provider(status="ok")
    client = MagicMock()
    client.get.side_effect = [_response(404)]

    result, session = _run(monkeypatch, [provider], client)

    assert result == {"probed": 1, "ok": 0, "degraded": 0, "unverified": 1, "errors": 0}
    assert provider.status == "ok"
    session.commit.assert_called_once()


def test_probe_has_no_handle_to_the_breaker():
    assert not hasattr(ai_providers, "record_success_sync")
    assert not hasattr(ai_providers, "record_failure_sync")


def test_beat_schedule_registers_provider_probe():
    entry = celery_app.conf.beat_schedule["ai-providers-probe-every-5m"]

    assert entry["task"] == "ai_providers.probe"
    assert entry["schedule"] == 300.0


def test_probe_is_routed_to_the_ip_scan_queue():
    assert celery_app.conf.task_routes["ai_providers.probe"]["queue"] == "ip_scan"


def test_probe_runs_every_five_minutes():
    assert celery_app.conf.beat_schedule["ai-providers-probe-every-5m"]["task"] == "ai_providers.probe"
