from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

from celery_app import celery_app
from tasks.host_protect import run_due_host_scans, run_host_scan


def test_run_scan_skipped_when_flag_off(monkeypatch):
    monkeypatch.setenv("HOST_PROTECT_ENABLED", "false")
    assert run_host_scan("00000000-0000-0000-0000-000000000001") == {
        "skipped": True,
        "reason": "HOST_PROTECT_ENABLED off",
    }


def test_run_due_skipped_when_flag_off(monkeypatch):
    monkeypatch.setenv("HOST_PROTECT_ENABLED", "false")
    assert run_due_host_scans()["skipped"] is True


def test_beat_schedule_polls_every_five_minutes():
    entry = celery_app.conf.beat_schedule["host-protect-run-due-every-5m"]
    assert entry["task"] == "host_protect.run_due"
    assert entry["schedule"] == 300.0


def test_run_due_skips_when_org_inflight_cap(monkeypatch):
    monkeypatch.setenv("HOST_PROTECT_ENABLED", "true")
    org = uuid4()
    site = uuid4()
    session = MagicMock()
    sites = MagicMock()
    sites.mappings.return_value = [{"site_id": site, "organization_id": org, "scan_interval": "hourly"}]
    inflight = MagicMock()
    inflight.scalar_one.return_value = 2
    session.execute.side_effect = [sites, inflight]
    with (
        patch("utils.database.get_sync_session", return_value=session),
        patch("celery_app.celery_app.send_task") as send,
    ):
        result = run_due_host_scans(limit=5)
    assert result["ok"] is True
    assert result["enqueued"] == 0
    assert result["skipped_cap"] == 1
    send.assert_not_called()


def test_run_due_skips_when_not_due(monkeypatch):
    monkeypatch.setenv("HOST_PROTECT_ENABLED", "true")
    org = uuid4()
    site = uuid4()
    session = MagicMock()
    sites = MagicMock()
    sites.mappings.return_value = [{"site_id": site, "organization_id": org, "scan_interval": "daily"}]
    inflight = MagicMock()
    inflight.scalar_one.return_value = 0
    last = MagicMock()
    last.scalar_one.return_value = datetime.now(UTC) - timedelta(hours=1)
    due = MagicMock()
    due.scalar_one.return_value = False
    session.execute.side_effect = [sites, inflight, last, due]
    with (
        patch("utils.database.get_sync_session", return_value=session),
        patch("celery_app.celery_app.send_task") as send,
    ):
        result = run_due_host_scans(limit=5)
    assert result["enqueued"] == 0
    assert result["skipped_not_due"] == 1
    send.assert_not_called()
