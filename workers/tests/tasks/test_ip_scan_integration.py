"""Integration tests for workers.tasks.ip_scan — real SQLite DB, mocked nmap/CVE."""

import json
import os
import sys
import uuid
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("DATABASE_URL_SYNC", "postgresql://test:test@localhost:5432/test")

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "workers"))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest
from sqlalchemy import String, Text, TypeDecorator, create_engine, text
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Session, sessionmaker

JOB_ID = "b8e1c234-5678-4abc-9def-0123456789ab"
TARGET = "192.168.1.1"
PORTS = "1-1000"


# ── SQLite type decorators (same pattern as backend/tests/conftest.py) ──


class UUIDType(TypeDecorator):
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return str(value)
        if isinstance(value, str):
            return value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class JSONBType(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            return json.loads(value)
        return value


def _patch_model_types() -> None:
    """Replace PG UUID/JSONB types with SQLite-compatible types on all model columns."""
    # Import all models FIRST to register tables on Base.metadata
    import app.models  # noqa: F401 — registers User, ScanJob, CreditLog, etc.
    from app.database import Base
    from app.models.scan_finding import ScanFinding  # noqa: F401 — registers ScanFinding

    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, PG_UUID):
                column.type = UUIDType(32)
            elif isinstance(column.type, PG_JSONB):
                column.type = JSONBType()


def _build_sync_engine():
    """Build a sync SQLite engine with all model tables created."""
    _patch_model_types()
    from app.database import Base

    eng = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(eng)
    return eng


def _create_user_and_job(session: Session) -> tuple[str, str]:
    """Insert a test user and pending scan job. Returns (user_id, job_id)."""
    user_id = "a1b2c34567894def0123456789abcdef"
    now = datetime.now(UTC)
    session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, is_verified, is_admin, credits, created_at, updated_at) "
            "VALUES (:id, :email, :hash, :v, :admin, :c, :now, :now)"
        ),
        {
            "id": user_id,
            "email": "test@example.com",
            "hash": "fake-hash",
            "v": True,
            "admin": False,
            "c": 100,
            "now": now,
        },
    )
    session.execute(
        text(
            "INSERT INTO scan_jobs (id, scan_type, target, status, progress, user_id, credit_cost, created_at) "
            "VALUES (:id, 'ip', :target, 'pending', 0, :uid, 10, datetime('now'))"
        ),
        {"id": JOB_ID, "target": TARGET, "uid": user_id},
    )
    session.commit()
    return user_id, JOB_ID


# ── Integration tests ──


class TestIpScanIntegration:
    @pytest.fixture(autouse=True)
    def _setup(self, sample_nmap_result, sample_vulns):
        engine = _build_sync_engine()
        sync_session = sessionmaker(bind=engine)
        session = sync_session()
        _create_user_and_job(session)
        session.close()

        with (
            patch("tasks.ip_scan.get_sync_session") as mock_get_session,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan.redis") as mock_redis,
            patch("tasks.ip_scan.dead_letter_handler") as mock_dead_letter,
        ):
            mock_nmap.return_value = sample_nmap_result
            mock_cve.return_value = sample_vulns
            mock_redis.return_value = MagicMock()
            mock_get_session.return_value = sync_session()

            self.engine = engine
            self.SyncSession = sync_session
            self.mock_nmap = mock_nmap
            self.mock_cve = mock_cve
            self.mock_progress = mock_progress
            self.mock_redis = mock_redis
            self.mock_dead_letter = mock_dead_letter
            yield

        engine.dispose()

    def _call_task(self):
        from tasks.ip_scan import run_ip_scan

        return run_ip_scan(JOB_ID, TARGET, PORTS)

    # ── test_scan_creates_and_persists_findings ──

    def test_scan_creates_and_persists_findings(self):
        self._call_task()

        session = self.SyncSession()
        try:
            from app.models.scan_finding import ScanFinding

            findings = session.query(ScanFinding).filter(ScanFinding.job_id == JOB_ID).all()
            assert len(findings) >= 2, f"Expected >=2 findings, got {len(findings)}"
            severities = {f.severity for f in findings}
            assert "critical" in severities or "medium" in severities
        finally:
            session.close()

    # ── test_scan_updates_job_status ──

    def test_scan_updates_job_status(self):
        self._call_task()

        session = self.SyncSession()
        try:
            from app.models.scan_job import ScanJob

            job = session.query(ScanJob).filter(ScanJob.id == JOB_ID).one()
            assert job.status == "completed"
            assert job.progress == 100
            assert job.started_at is not None
            assert job.completed_at is not None
        finally:
            session.close()

    # ── test_scan_result_summary ──

    def test_scan_result_summary(self):
        self._call_task()

        session = self.SyncSession()
        try:
            from app.models.scan_job import ScanJob

            job = session.query(ScanJob).filter(ScanJob.id == JOB_ID).one()
            assert job.result_summary is not None
            summary = job.result_summary
            assert "total_findings" in summary
            assert summary["total_findings"] > 0
            assert "critical" in summary
            assert "high" in summary
            assert "medium" in summary
        finally:
            session.close()

    # ── test_scan_handles_empty_results ──

    def test_scan_handles_empty_results(self, sample_nmap_result_no_hosts):
        self.mock_nmap.return_value = sample_nmap_result_no_hosts

        result = self._call_task()

        assert result["job_id"] == JOB_ID
        assert result["summary"]["total_findings"] == 0

        session = self.SyncSession()
        try:
            from app.models.scan_finding import ScanFinding
            from app.models.scan_job import ScanJob

            job = session.query(ScanJob).filter(ScanJob.id == JOB_ID).one()
            assert job.status == "completed"
            findings = session.query(ScanFinding).filter(ScanFinding.job_id == JOB_ID).all()
            assert len(findings) == 0
        finally:
            session.close()

    # ── test_nmap_failure_marks_job_failed ──

    def test_nmap_failure_marks_job_failed(self):
        from celery.exceptions import Retry

        self.mock_nmap.side_effect = Exception("nmap binary not found")

        from tasks.ip_scan import run_ip_scan

        task_cls = type(run_ip_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()),
            patch.object(task_cls, "max_retries", 3),
        ):
            mock_req.return_value = MagicMock(retries=0)
            with pytest.raises(Retry):
                run_ip_scan(JOB_ID, TARGET, PORTS)

        session = self.SyncSession()
        try:
            from app.models.scan_job import ScanJob

            job = session.query(ScanJob).filter(ScanJob.id == JOB_ID).one()
            assert job.status == "failed"
        finally:
            session.close()
