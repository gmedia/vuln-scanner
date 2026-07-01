import json
import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import String, Text, TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.database import Base

# CveCache is not imported in conftest.py, so its JSONB/UUID column types
# are never patched for SQLite. Import it here and patch its table columns.
from app.models.cve_cache import CveCache
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob


class _UUIDType(TypeDecorator):
    impl = String(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value.hex
        return str(value).replace("-", "")

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class _JSONBType(TypeDecorator):
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


cve_cache_table = Base.metadata.tables.get("cve_cache")
if cve_cache_table is not None:
    for column in cve_cache_table.columns:
        if isinstance(column.type, PG_UUID):
            column.type = _UUIDType(32)
        elif isinstance(column.type, PG_JSONB):
            column.type = _JSONBType()


class TestCveCache:
    @pytest.mark.asyncio
    async def test_create_all_fields(self, db_session):
        cached_at = datetime.now(UTC)
        cve = CveCache(
            cve_id="CVE-2024-1234",
            description="A test vulnerability",
            cvss_score=8.5,
            severity="high",
            published_date=date(2024, 1, 15),
            raw_json={"id": "CVE-2024-1234", "aliases": []},
            cached_at=cached_at,
        )
        db_session.add(cve)
        await db_session.commit()
        await db_session.refresh(cve)

        assert cve.cve_id == "CVE-2024-1234"
        assert cve.description == "A test vulnerability"
        assert cve.cvss_score == 8.5
        assert cve.severity == "high"
        assert cve.published_date == date(2024, 1, 15)
        assert cve.raw_json == {"id": "CVE-2024-1234", "aliases": []}
        assert cve.cached_at is not None

    @pytest.mark.asyncio
    async def test_create_null_optionals(self, db_session):
        cached_at = datetime.now(UTC)
        cve = CveCache(
            cve_id="CVE-2024-5678",
            cached_at=cached_at,
        )
        db_session.add(cve)
        await db_session.commit()
        await db_session.refresh(cve)

        assert cve.cve_id == "CVE-2024-5678"
        assert cve.description is None
        assert cve.cvss_score is None
        assert cve.severity is None
        assert cve.published_date is None
        assert cve.raw_json is None
        assert cve.cached_at is not None


class TestScanJob:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("scan_type", ["ip", "domain", "apk", "ipa"])
    async def test_create_with_scan_types(self, db_session, sample_user, scan_type):
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type=scan_type,
            target="example.com",
            user_id=sample_user.id,
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        assert job.scan_type == scan_type
        assert job.target == "example.com"
        assert job.status == "pending"
        assert job.progress == 0

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", ["pending", "running", "completed", "failed"])
    async def test_create_with_statuses(self, db_session, sample_user, status):
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type="ip",
            target="192.168.1.1",
            status=status,
            user_id=sample_user.id,
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        assert job.status == status
        assert job.scan_type == "ip"

    @pytest.mark.asyncio
    async def test_create_with_all_optional_fields(self, db_session, sample_user):
        now = datetime.now(UTC)
        job_id = uuid.uuid4()
        job = ScanJob(
            id=job_id,
            scan_type="domain",
            target="example.com",
            status="completed",
            progress=100,
            result_summary={"ports": [80, 443]},
            celery_task_id="celery-task-001",
            user_id=sample_user.id,
            started_at=now,
            completed_at=now,
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        assert job.id == job_id
        assert job.scan_type == "domain"
        assert job.target == "example.com"
        assert job.status == "completed"
        assert job.progress == 100
        assert job.result_summary == {"ports": [80, 443]}
        assert job.celery_task_id == "celery-task-001"
        assert job.started_at is not None
        assert job.completed_at is not None

    @pytest.mark.asyncio
    async def test_very_long_target(self, db_session, sample_user):
        long_target = "a" * 5000
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type="domain",
            target=long_target,
            user_id=sample_user.id,
        )
        db_session.add(job)
        await db_session.commit()
        await db_session.refresh(job)

        assert len(job.target) == 5000
        assert job.target == long_target


class TestScanFinding:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("severity", ["critical", "high", "medium", "low", "info"])
    async def test_create_with_severities(self, db_session, sample_job, severity):
        finding = ScanFinding(
            id=uuid.uuid4(),
            job_id=sample_job.id,
            severity=severity,
            title=f"Test finding with {severity} severity",
        )
        db_session.add(finding)
        await db_session.commit()
        await db_session.refresh(finding)

        assert finding.severity == severity
        assert finding.job_id == sample_job.id

    @pytest.mark.asyncio
    async def test_foreign_key_relationship(self, db_session, sample_job):
        finding = ScanFinding(
            id=uuid.uuid4(),
            job_id=sample_job.id,
            severity="high",
            title="Related finding",
        )
        db_session.add(finding)
        await db_session.commit()
        await db_session.refresh(finding)

        assert finding.job_id == sample_job.id

    @pytest.mark.asyncio
    async def test_create_with_all_fields(self, db_session, sample_job):
        finding_id = uuid.uuid4()
        finding = ScanFinding(
            id=finding_id,
            job_id=sample_job.id,
            severity="critical",
            category="Network",
            title="Critical vulnerability",
            description="A critical vulnerability was found",
            cve_id="CVE-2024-9999",
            cvss_score=9.5,
            remediation="Apply vendor patches",
            raw_data={"proof": "abc123"},
        )
        db_session.add(finding)
        await db_session.commit()
        await db_session.refresh(finding)

        assert finding.id == finding_id
        assert finding.job_id == sample_job.id
        assert finding.severity == "critical"
        assert finding.category == "Network"
        assert finding.title == "Critical vulnerability"
        assert finding.description == "A critical vulnerability was found"
        assert finding.cve_id == "CVE-2024-9999"
        assert finding.cvss_score == 9.5
        assert finding.remediation == "Apply vendor patches"
        assert finding.raw_data == {"proof": "abc123"}

    @pytest.mark.asyncio
    async def test_null_optional_fields(self, db_session, sample_job):
        finding = ScanFinding(
            id=uuid.uuid4(),
            job_id=sample_job.id,
            severity="info",
            title="Info only",
        )
        db_session.add(finding)
        await db_session.commit()
        await db_session.refresh(finding)

        assert finding.category is None
        assert finding.description is None
        assert finding.cve_id is None
        assert finding.cvss_score is None
        assert finding.remediation is None
        assert finding.raw_data is None
