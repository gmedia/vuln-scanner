"""Integration tests for workers.tasks.mobile_scan — real SQLite DB, mocked APK analysis."""

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
from unittest.mock import AsyncMock, MagicMock, PropertyMock, mock_open, patch

import pytest
from sqlalchemy import String, Text, TypeDecorator, create_engine, text
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Session, sessionmaker

JOB_ID = "e3f4a567-8901-4bcd-ef01-234567890abc"
FILE_PATH = "/tmp/test-app.apk"
PLATFORM = "android"


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


# Monkey-patch PG_UUID with string-compatible bind/result processors BEFORE
# importing models (mapper caches __clause_element__, so replacing column.type
# after import doesn't affect the ORM attribute's BindParameter type).
def _pg_uuid_bind_processor(self, dialect):
    """Bind processor that converts UUIDs to strings (SQLite-compatible)."""

    def process(value):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return str(value)
        if isinstance(value, str):
            return value
        return str(value)

    return process


def _pg_uuid_result_processor(self, dialect, coltype):
    """Result processor that converts strings to UUIDs."""

    def process(value):
        if value is None:
            return None
        return uuid.UUID(value) if isinstance(value, str) else value

    return process


PG_UUID.bind_processor = _pg_uuid_bind_processor
PG_UUID.result_processor = _pg_uuid_result_processor


def _patch_model_types() -> None:
    """Replace PG UUID/JSONB types with SQLite-compatible types on all model columns."""
    # Import all models FIRST to register tables on Base.metadata
    import app.models  # noqa: F401 — registers User, ScanJob, CreditLog, etc.
    from app.database import Base
    from app.models.scan_finding import ScanFinding  # noqa: F401 — registers ScanFinding
    from app.models.scan_job import ScanJob  # noqa: F401

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
            "VALUES (:id, 'apk', :target, 'pending', 0, :uid, 10, datetime('now'))"
        ),
        {"id": JOB_ID, "target": FILE_PATH, "uid": user_id},
    )
    session.commit()
    return user_id, JOB_ID


# ── Integration tests ──


class TestMobileScanIntegration:
    @pytest.fixture(autouse=True)
    def _setup(self, sample_vulns):
        engine = _build_sync_engine()
        sync_session = sessionmaker(bind=engine)
        session = sync_session()
        _create_user_and_job(session)
        session.close()

        # Build mock data
        from utils.mobile_utils import AndroidManifestInfo

        apk_info = AndroidManifestInfo(
            package_name="com.example.app",
            version_name="2.1.0",
            version_code="42",
            min_sdk="29",
            target_sdk="34",
            permissions=["CAMERA", "INTERNET"],
            exported_components=[".MainActivity"],
            debuggable=True,
            allow_backup=False,
            uses_cleartext_traffic=True,
        )
        sample_findings = [
            {
                "severity": "medium",
                "category": "manifest",
                "title": "Debuggable app",
                "description": "App is debuggable",
            }
        ]
        sample_libraries = ["libssl.so", "libcurl.so"]

        secret_findings = [
            {
                "severity": "high",
                "category": "secret",
                "title": "Hardcoded API key",
                "description": "API key found in strings.xml",
            }
        ]

        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_get_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_analyze_apk,
            patch("tasks.mobile_scan.analyze_ipa") as mock_analyze_ipa,
            patch("tasks.mobile_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
            patch("utils.mobile_utils._scan_secrets") as mock_scan_secrets,
            patch("tasks.mobile_scan.sort_findings_by_severity") as mock_sort,
            patch("tasks.mobile_scan.compute_severity_summary") as mock_compute,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan.redis") as mock_redis,
            patch("tasks.mobile_scan.dead_letter_handler") as mock_dead_letter,
            patch("os.path.exists") as mock_exists,
            patch("os.path.getsize") as mock_getsize,
            patch("os.remove") as mock_remove,
            patch("builtins.open", mock_open(read_data=b"test data")) as mock_file_open,
        ):
            mock_analyze_apk.return_value = (apk_info, sample_findings, sample_libraries)
            mock_analyze_ipa.return_value = MagicMock()
            mock_cve.return_value = sample_vulns
            mock_scan_secrets.return_value = secret_findings
            # sort/severity pass through — let real implementations handle actual data
            from utils.severity import compute_severity_summary, sort_findings_by_severity

            mock_sort.side_effect = sort_findings_by_severity
            mock_compute.side_effect = compute_severity_summary
            mock_redis.return_value = MagicMock()
            mock_get_session.return_value = sync_session()
            mock_exists.return_value = True
            mock_getsize.return_value = 1048576  # 1MB

            self.engine = engine
            self.SyncSession = sync_session
            self.mock_analyze_apk = mock_analyze_apk
            self.mock_analyze_ipa = mock_analyze_ipa
            self.mock_cve = mock_cve
            self.mock_scan_secrets = mock_scan_secrets
            self.mock_sort = mock_sort
            self.mock_compute = mock_compute
            self.mock_progress = mock_progress
            self.mock_redis = mock_redis
            self.mock_dead_letter = mock_dead_letter
            self.mock_exists = mock_exists
            self.mock_getsize = mock_getsize
            self.mock_remove = mock_remove
            self.mock_file_open = mock_file_open
            yield

        engine.dispose()

    def _call_task(self):
        from tasks.mobile_scan import run_mobile_scan

        return run_mobile_scan(JOB_ID, FILE_PATH, PLATFORM)

    # ── test_scan_creates_and_persists_findings ──

    def test_scan_creates_and_persists_findings(self):
        self._call_task()

        session = self.SyncSession()
        try:
            from app.models.scan_finding import ScanFinding

            findings = session.query(ScanFinding).filter(ScanFinding.job_id == JOB_ID).all()
            assert len(findings) >= 2, f"Expected >=2 findings, got {len(findings)}"
            severities = {f.severity for f in findings}
            assert "critical" in severities or "medium" in severities or "high" in severities
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

    # ── test_file_not_found_returns_early ──

    def test_file_not_found_returns_early(self):
        self.mock_exists.return_value = False

        result = self._call_task()

        assert result["job_id"] == JOB_ID
        assert result["error"] == "file not found"

        session = self.SyncSession()
        try:
            from app.models.scan_job import ScanJob

            job = session.query(ScanJob).filter(ScanJob.id == JOB_ID).one()
            assert job.status == "failed"
        finally:
            session.close()

    # ── test_scan_failure_marks_job_failed ──

    def test_scan_failure_marks_job_failed(self):
        from celery.exceptions import Retry

        self.mock_analyze_apk.side_effect = Exception("APK parsing failed")

        from tasks.mobile_scan import run_mobile_scan

        task_cls = type(run_mobile_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()),
            patch.object(task_cls, "max_retries", 3),
        ):
            mock_req.return_value = MagicMock(retries=0)
            with pytest.raises(Retry):
                run_mobile_scan(JOB_ID, FILE_PATH, PLATFORM)

        session = self.SyncSession()
        try:
            from app.models.scan_job import ScanJob

            job = session.query(ScanJob).filter(ScanJob.id == JOB_ID).one()
            assert job.status == "failed"
        finally:
            session.close()
