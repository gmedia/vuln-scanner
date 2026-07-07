import uuid

import pytest
from celery.exceptions import CeleryError
from fastapi import HTTPException
from sqlalchemy import select

from app.models.credit_log import CreditLog
from app.models.pricing import PricingConfig
from app.models.scan_job import ScanJob
from app.models.user import User
from app.schemas.scan import (
    PaginatedResponse,
    ScanFindingResponse,
    ScanJobDetailResponse,
)
from app.services.scanner import ScannerService


@pytest.mark.asyncio
async def test_start_scan_ip(db_session, sample_user, mock_celery):
    svc = ScannerService(db_session)
    job = await svc.start_scan(user=sample_user, scan_type="ip", target="10.0.0.1", ports="22-80")

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
async def test_start_scan_domain(db_session, sample_user, mock_celery):
    svc = ScannerService(db_session)
    job = await svc.start_scan(user=sample_user, scan_type="domain", target="example.com")

    assert job.status == "pending"
    assert job.scan_type == "domain"
    assert job.target == "example.com"

    mock_celery.assert_called_once_with(
        "domain_scan.run",
        args=[str(job.id), "example.com"],
        queue="domain_scan",
    )


@pytest.mark.asyncio
async def test_start_scan_mobile_apk(db_session, sample_user, mock_celery):
    svc = ScannerService(db_session)
    job = await svc.start_scan(
        user=sample_user, scan_type="apk", target="app.apk", platform="android", file_path="/tmp/scans/test.apk"
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
async def test_start_scan_invalid_type(db_session, sample_user, mock_celery):
    from sqlalchemy.exc import IntegrityError

    svc = ScannerService(db_session)
    with pytest.raises((ValueError, IntegrityError)):
        await svc.start_scan(user=sample_user, scan_type="invalid_type", target="something")


@pytest.mark.asyncio
async def test_get_job_found(db_session, sample_job, sample_finding, sample_user):
    svc = ScannerService(db_session)
    job_id_str = str(sample_job.id)
    result = await svc.get_job(job_id_str, user_id=sample_user.id)

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
async def test_get_job_not_found(db_session, sample_user):
    svc = ScannerService(db_session)
    result = await svc.get_job(str(uuid.uuid4()), user_id=sample_user.id)
    assert result is None


@pytest.mark.asyncio
async def test_get_findings(db_session, sample_job, sample_finding, sample_user):
    svc = ScannerService(db_session)
    findings = await svc.get_findings(str(sample_job.id), user_id=sample_user.id)

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


# --- New tests: DB pricing override ---


@pytest.mark.asyncio
async def test_start_scan_with_db_pricing(db_session, sample_user, mock_celery):
    """When a PricingConfig row exists for the scan type, use its credit_cost instead of settings."""
    pricing = PricingConfig(
        id=uuid.uuid4(),
        scan_type="ip",
        credit_cost=99,
    )
    db_session.add(pricing)
    await db_session.commit()

    svc = ScannerService(db_session)
    job = await svc.start_scan(user=sample_user, scan_type="ip", target="10.0.0.1", ports="22-80")

    assert job.credit_cost == 99
    # User started with 100 credits, DB pricing says 99 → should have 1 left
    await db_session.refresh(sample_user)
    assert sample_user.credits == 1


# --- New tests: insufficient credits ---


@pytest.mark.asyncio
async def test_start_scan_insufficient_credits(db_session, sample_user, mock_celery):
    """When user has 0 credits and scan costs > 0, raise 402."""
    sample_user.credits = 0
    await db_session.commit()

    svc = ScannerService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await svc.start_scan(user=sample_user, scan_type="ip", target="10.0.0.1")
    assert exc_info.value.status_code == 402
    assert "Insufficient credits" in exc_info.value.detail


# --- New tests: dispatch failure rollback ---


@pytest.mark.asyncio
async def test_start_scan_dispatch_failure_rollback(db_session, sample_user, mock_celery):
    """When send_task raises, credits are refunded and a refund CreditLog is created."""
    original_credits = sample_user.credits

    # Override the already-patched send_task to raise
    mock_celery.side_effect = CeleryError("Celery broker down")

    svc = ScannerService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await svc.start_scan(user=sample_user, scan_type="ip", target="10.0.0.1")
    assert exc_info.value.status_code == 500
    assert "Failed to dispatch scan task" in exc_info.value.detail

    # Credits should be restored
    await db_session.refresh(sample_user)
    assert sample_user.credits == original_credits

    # Refund CreditLog should exist
    refund_result = await db_session.execute(select(CreditLog).where(CreditLog.type == "refund"))
    refund_logs = refund_result.scalars().all()
    assert len(refund_logs) == 1
    assert refund_logs[0].amount == 1  # ip scan default cost
    assert refund_logs[0].user_id == sample_user.id


# --- New tests: get_job IDOR protection ---


@pytest.mark.asyncio
async def test_get_job_idor_different_user(db_session, sample_job):
    """get_job returns None when the job exists but belongs to a different user."""
    other_user = User(
        id=uuid.uuid4(),
        email="other@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=50,
    )
    db_session.add(other_user)
    await db_session.commit()

    svc = ScannerService(db_session)
    result = await svc.get_job(str(sample_job.id), user_id=other_user.id)
    assert result is None


# --- New tests: get_findings empty and IDOR ---


@pytest.mark.asyncio
async def test_get_findings_empty(db_session, sample_user):
    """get_findings returns empty list when job has no findings."""
    empty_job = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="no-findings.com",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add(empty_job)
    await db_session.commit()

    svc = ScannerService(db_session)
    findings = await svc.get_findings(str(empty_job.id), user_id=sample_user.id)
    assert findings == []


@pytest.mark.asyncio
async def test_get_findings_idor(db_session, sample_job, sample_finding):
    """get_findings raises 404 when job belongs to a different user."""
    other_user = User(
        id=uuid.uuid4(),
        email="other@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=50,
    )
    db_session.add(other_user)
    await db_session.commit()

    svc = ScannerService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await svc.get_findings(str(sample_job.id), user_id=other_user.id)
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Scan job not found"


# --- New tests: get_history pagination ---


@pytest.mark.asyncio
async def test_get_history_pagination_page_2(db_session, sample_user):
    """Page 2 with limit=1 returns the second job when 3 jobs exist."""
    jobs = []
    for i in range(3):
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type="ip",
            target=f"10.0.0.{i + 1}",
            status="completed",
            progress=100,
            user_id=sample_user.id,
        )
        db_session.add(job)
        jobs.append(job)
    await db_session.commit()

    svc = ScannerService(db_session)
    result = await svc.get_history(page=2, limit=1)

    assert result.page == 2
    assert result.limit == 1
    assert result.total == 3
    assert len(result.items) == 1
    # With desc ordering by created_at, page 2 gets the middle job
    assert result.items[0].id == jobs[1].id


@pytest.mark.asyncio
async def test_get_history_pagination_custom_limit(db_session, sample_user):
    """Custom limit=5 works correctly."""
    for i in range(7):
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type="domain",
            target=f"domain{i}.com",
            status="completed",
            progress=100,
            user_id=sample_user.id,
        )
        db_session.add(job)
    await db_session.commit()

    svc = ScannerService(db_session)
    result = await svc.get_history(limit=5)

    assert result.limit == 5
    assert result.total == 7
    assert len(result.items) == 5
    assert result.pages == 2  # ceil(7/5) = 2


# --- New tests: get_history filtered by user_id ---


@pytest.mark.asyncio
async def test_get_history_filtered_by_user_id(db_session, sample_user, sample_job):
    """get_history with user_id filter returns only that user's jobs."""
    other_user = User(
        id=uuid.uuid4(),
        email="other@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=50,
    )
    db_session.add(other_user)
    other_job = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="other.com",
        status="completed",
        progress=100,
        user_id=other_user.id,
    )
    db_session.add(other_job)
    await db_session.commit()

    svc = ScannerService(db_session)
    result = await svc.get_history(user_id=sample_user.id)

    assert result.total == 1
    assert len(result.items) == 1
    assert result.items[0].id == sample_job.id


# --- New tests: get_history invalid scan_type ---


@pytest.mark.asyncio
async def test_get_history_invalid_scan_type(db_session):
    """get_history with invalid scan_type raises HTTPException 400."""
    svc = ScannerService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await svc.get_history(scan_type="invalid")
    assert exc_info.value.status_code == 400
    assert "Invalid scan type" in exc_info.value.detail


# --- New tests: combined filters ---


@pytest.mark.asyncio
async def test_get_history_user_id_and_scan_type_combined(db_session, sample_user):
    """Both user_id and scan_type filters applied together."""
    job_ip = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    job_domain = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="example.com",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add_all([job_ip, job_domain])
    await db_session.commit()

    svc = ScannerService(db_session)
    result = await svc.get_history(scan_type="ip", user_id=sample_user.id)

    assert result.total == 1
    assert len(result.items) == 1
    assert result.items[0].id == job_ip.id


# --- New tests: _dispatch_task unknown scan type ---


def test_dispatch_unknown_scan_type(db_session):
    """_dispatch_task with unknown scan type raises ValueError."""
    svc = ScannerService(db_session)
    with pytest.raises(ValueError, match="Unknown scan type"):
        svc._dispatch_task("job-id", "unknown_type", "target", None, None)


# --- New tests: CreditLog creation ---


@pytest.mark.asyncio
async def test_start_scan_creates_credit_log(db_session, sample_user, mock_celery):
    """start_scan creates a CreditLog with correct amount, type, and description."""
    svc = ScannerService(db_session)
    job = await svc.start_scan(user=sample_user, scan_type="ip", target="10.0.0.1")

    log_result = await db_session.execute(select(CreditLog).where(CreditLog.reference_id == job.id))
    logs = log_result.scalars().all()
    assert len(logs) == 1
    log = logs[0]
    assert log.amount == 1  # ip default
    assert log.type == "deduct"
    assert log.description == "Scan: ip on 10.0.0.1"
    assert log.user_id == sample_user.id


# --- New tests: ipa scan type ---


@pytest.mark.asyncio
async def test_start_scan_ipa(db_session, sample_user, mock_celery):
    """start_scan with scan_type='ipa' dispatches to mobile_scan queue."""
    svc = ScannerService(db_session)
    job = await svc.start_scan(
        user=sample_user,
        scan_type="ipa",
        target="app.ipa",
        platform="ios",
        file_path="/tmp/scans/test.ipa",
    )

    assert job.scan_type == "ipa"
    assert job.target == "app.ipa"
    mock_celery.assert_called_once_with(
        "mobile_scan.run",
        args=[str(job.id), "/tmp/scans/test.ipa", "ios"],
        queue="mobile_scan",
    )


# --- New tests: just enough credits ---


@pytest.mark.asyncio
async def test_start_scan_just_enough_credits(db_session, sample_user, mock_celery):
    """User has exactly the right amount of credits — deduction succeeds."""
    # Domain scan costs 2 credits by default
    sample_user.credits = 2
    await db_session.commit()

    svc = ScannerService(db_session)
    job = await svc.start_scan(user=sample_user, scan_type="domain", target="example.com")

    assert job.status == "pending"
    assert job.credit_cost == 2

    await db_session.refresh(sample_user)
    assert sample_user.credits == 0


# --- New tests: fallback pricing (no DB PricingConfig row) ---


@pytest.mark.asyncio
async def test_start_scan_fallback_pricing_uses_settings_default(db_session, sample_user, mock_celery):
    """When no PricingConfig row exists, use settings default from SCAN_TYPE_PRICING_MAP."""
    # Domain scan has no PricingConfig row (we didn't create one), so it falls back
    # to settings.domain_scan_credit_cost which is 2.
    svc = ScannerService(db_session)
    job = await svc.start_scan(user=sample_user, scan_type="domain", target="example.com")

    assert job.credit_cost == 2
    await db_session.refresh(sample_user)
    assert sample_user.credits == 98


# --- New tests: 0-cost scans ---


@pytest.mark.asyncio
async def test_start_scan_zero_cost_skips_deduction(db_session, sample_user, mock_celery):
    """When credit_cost is 0, no credit deduction should occur."""
    # Use a PricingConfig with cost=0
    pricing = PricingConfig(
        id=uuid.uuid4(),
        scan_type="ip",
        credit_cost=0,
    )
    db_session.add(pricing)
    await db_session.commit()

    original_credits = sample_user.credits
    svc = ScannerService(db_session)
    job = await svc.start_scan(user=sample_user, scan_type="ip", target="10.0.0.1")

    assert job.credit_cost == 0
    await db_session.refresh(sample_user)
    assert sample_user.credits == original_credits  # unchanged


@pytest.mark.asyncio
async def test_start_scan_zero_cost_user_has_zero_credits(db_session, sample_user, mock_celery):
    """When credit_cost is 0, scan succeeds even if user has 0 credits."""
    sample_user.credits = 0
    await db_session.commit()

    pricing = PricingConfig(
        id=uuid.uuid4(),
        scan_type="ip",
        credit_cost=0,
    )
    db_session.add(pricing)
    await db_session.commit()

    svc = ScannerService(db_session)
    job = await svc.start_scan(user=sample_user, scan_type="ip", target="10.0.0.1")

    assert job.status == "pending"
    assert job.credit_cost == 0
    await db_session.refresh(sample_user)
    assert sample_user.credits == 0  # still 0
