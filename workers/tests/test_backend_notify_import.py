"""Guard: the worker image can import backend scan-notify without FastAPI."""

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(_BACKEND))


def test_backend_scan_notify_imports_in_worker_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")
    monkeypatch.setenv("DATABASE_URL_SYNC", "postgresql://u:p@localhost/db")

    from app.services.scan_notify import build_notify_context

    assert callable(build_notify_context)
