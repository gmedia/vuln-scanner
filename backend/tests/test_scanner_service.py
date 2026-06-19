import uuid
import pytest
from sqlalchemy import select

from app.services.scanner import ScannerService
from app.models.scan_job import ScanJob
from app.schemas.scan import (
    ScanJobDetailResponse,
    ScanFindingResponse,
    PaginatedResponse,
)


@pytest.mark.asyncio
async def test_start_scan_ip(db_session, mock_celery):
    svc = ScannerService(db_session)
    job = await svc.start_scan(scan_type="ip", target="10.0.0.1", ports="22-80")

    assert job.status == "pending"
    assert job.scan_type == "ip"
    assert job.target == "10.0.0.1"

    mock_celery.assert_called_once_with(
        "ip_scan.run",
        args=[str(job.id), "10.0.0.1", "22-80"],
        queue="ip_scan",
    )
    assert job.celery_task_id == "mock-task-id-456"


@pytest.mark.asyncio
async def test_start_scan_domain(db_session, mock_celery):
    svc = ScannerService(db_session)
    job = await svc.start_scan(scan_type="domain", target="example.com")

    assert job.status == "pending"
    assert job.scan_type == "domain"
    assert job.target == "example.com"

    mock_celery.assert_called_once_with(
        "domain_scan.run",
        args=[str(job.id), "example.com"],
        queue="domain_scan",
    )


@pytest.mark.asyncio
async def test_start_scan_mobile_apk(db_session, mock_celery):
    svc = ScannerService(db_session)
    job = await svc.start_scan(
        scan_type="apk", target="app.apk", platform="android", file_path="/tmp/scans/test.apk"
    )

    assert job.status == "pending"
    assert job.scan_type == "apk"
    assert job.target == "app.apk"

    mock_celery.assert_called_once_with(
        "mobile_scan.run",
        args=[str(job.id), "/tmp/scans/test.apk", "android"],
        queue="mobile_scan",
    )


@pytest.mark.asyncio
async def test_start_scan_invalid_type(db_session, mock_celery):
    from sqlalchemy.exc import IntegrityError
    svc = ScannerService(db_session)
    with pytest.raises((ValueError, IntegrityError)):
        await svc.start_scan(scan_type="invalid_type", target="something")


@pytest.mark.asyncio
async def test_get_job_found(db_session, sample_job, sample_finding):
    svc = ScannerService(db_session)
    job_id_str = str(sample_job.id)
    result = await svc.get_job(job_id_str)

    assert result is not None
    assert isinstance(result, ScanJobDetailResponse)
    assert result.id == sample_job.id
    assert result.scan_type == "ip"
    assert result.target == "192.168.1.1"
    assert result.status == "completed"
    assert len(result.findings) == 1
    assert result.findings[0].title == "Open port 22"
    assert result.findings[0].severity == "high"


@pytest.mark.asyncio
async def test_get_job_not_found(db_session):
    svc = ScannerService(db_session)
    result = await svc.get_job(str(uuid.uuid4()))
    assert result is None


@pytest.mark.asyncio
async def test_get_findings(db_session, sample_job, sample_finding):
    svc = ScannerService(db_session)
    findings = await svc.get_findings(str(sample_job.id))

    assert len(findings) == 1
    assert isinstance(findings[0], ScanFindingResponse)
    assert findings[0].title == "Open port 22"
    assert findings[0].severity == "high"
    assert findings[0].cvss_score == 7.5


@pytest.mark.asyncio
async def test_get_history_empty(db_session):
    svc = ScannerService(db_session)
    result = await svc.get_history()

    assert isinstance(result, PaginatedResponse)
    assert result.items == []
    assert result.total == 0
    assert result.page == 1
    assert result.limit == 20
    assert result.pages == 0


@pytest.mark.asyncio
async def test_get_history_with_data(db_session, sample_job):
    svc = ScannerService(db_session)
    result = await svc.get_history()

    assert isinstance(result, PaginatedResponse)
    assert len(result.items) == 1
    assert result.total == 1
    assert result.page == 1
    assert result.items[0].id == sample_job.id
    assert result.items[0].target == "192.168.1.1"


@pytest.mark.asyncio
async def test_get_history_filtered_by_type(db_session, sample_job):
    svc = ScannerService(db_session)
    result = await svc.get_history(scan_type="ip")

    assert len(result.items) == 1
    assert result.total == 1

    result_domain = await svc.get_history(scan_type="domain")
    assert len(result_domain.items) == 0
    assert result_domain.total == 0
