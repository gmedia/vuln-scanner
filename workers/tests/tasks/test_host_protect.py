from __future__ import annotations

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
