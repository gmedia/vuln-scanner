"""Export verification tests — covers Content-Type, Content-Disposition,
optional fields, edge cases (null dates, null summary, zero findings),
default format, and HTML with null/missing finding fields."""

import uuid
from datetime import UTC, datetime

import pytest

from app.config import settings
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob

HEADERS = {"X-API-Key": settings.api_key}


# ── JSON export headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_json_content_disposition(client, db_session, sample_user):
    """JSON export must set Content-Disposition with correct filename."""
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="example.com",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add(job)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=json", headers=HEADERS)
    assert resp.status_code == 200
    cd = resp.headers.get("content-disposition", "")
    assert f'filename="scan_{job.id}.json"' in cd
    assert "attachment" in cd


# ── HTML export headers ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_html_content_type_is_html(client, db_session, sample_user):
    """HTML export must return text/html Content-Type."""
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add(job)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    content_type = resp.headers.get("content-type", "")
    assert "text/html" in content_type


# ── Default format (no parameter) ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_defaults_to_json(client, db_session, sample_user):
    """GET /api/scan/{id}/export without format param defaults to JSON."""
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add(job)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["job_id"] == str(job.id)
    assert "exported_at" in data
    assert "application/octet-stream" in resp.headers.get("content-type", "")


# ── JSON with all optional fields ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_json_includes_all_optional_fields(client, db_session, sample_user):
    """JSON export must include remediation, raw_data, cvss_score, cve_id
    when set on findings."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        result_summary={"total_findings": 1, "medium": 1},
        user_id=sample_user.id,
        started_at=now,
        completed_at=now,
    )
    db_session.add(job)
    await db_session.commit()

    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=job.id,
        severity="medium",
        category="Web",
        title="Missing HSTS header",
        description="No Strict-Transport-Security header in response",
        cve_id=None,
        cvss_score=5.3,
        remediation="Add HSTS header with max-age=31536000",
        raw_data={"header": "Strict-Transport-Security", "present": False},
    )
    db_session.add(finding)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=json", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["findings"]) == 1
    f = data["findings"][0]
    assert f["title"] == "Missing HSTS header"
    assert f["cvss_score"] == 5.3
    assert f["remediation"] == "Add HSTS header with max-age=31536000"
    assert f["raw_data"] == {"header": "Strict-Transport-Security", "present": False}
    assert f["cve_id"] is None
    assert "duration_seconds" in data


# ── HTML with null result_summary ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_html_null_result_summary(client, db_session, sample_user):
    """HTML export must handle result_summary=None without crashing."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="example.com",
        status="completed",
        progress=100,
        result_summary=None,
        user_id=sample_user.id,
        started_at=now,
        completed_at=now,
    )
    db_session.add(job)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    html_text = resp.text
    assert "<!DOCTYPE html>" in html_text
    assert "total_findings" in html_text.lower() or "0 total" in html_text.lower()


# ── HTML with only started_at (no completed_at) ────────────────────────────


@pytest.mark.asyncio
async def test_export_html_duration_n_a_when_no_completed_at(client, db_session, sample_user):
    """HTML export must show 'N/A' when completed_at is None."""
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="running",
        progress=50,
        user_id=sample_user.id,
        started_at=datetime.now(UTC),
        completed_at=None,
    )
    db_session.add(job)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    assert "N/A" in resp.text


# ── HTML with zero findings (explicit verification) ────────────────────────


@pytest.mark.asyncio
async def test_export_html_zero_findings_no_table_rows(client, db_session, sample_user):
    """HTML export with zero findings must not contain any finding <tr> rows."""
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        result_summary={"total_findings": 0},
        user_id=sample_user.id,
        started_at=datetime.now(UTC),
        completed_at=datetime.now(UTC),
    )
    db_session.add(job)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    html_text = resp.text
    assert "<!DOCTYPE html>" in html_text
    assert '<tr class="sev-critical"' not in html_text
    assert '<tr class="sev-high"' not in html_text
    assert '<tr class="sev-medium"' not in html_text
    assert '<tr class="sev-low"' not in html_text


# ── HTML with null finding fields (description, category, cve, cvss) ───────


@pytest.mark.asyncio
async def test_export_html_null_finding_fields(client, db_session, sample_user):
    """HTML export must handle null description, category, cve_id, cvss_score
    without traceback or broken markup."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="example.com",
        status="completed",
        progress=100,
        result_summary={"total_findings": 1, "low": 1},
        user_id=sample_user.id,
        started_at=now,
        completed_at=now,
    )
    db_session.add(job)
    await db_session.commit()

    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=job.id,
        severity="low",
        category=None,
        title="Finding with null fields",
        description=None,
        cve_id=None,
        cvss_score=None,
    )
    db_session.add(finding)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    html_text = resp.text
    assert "<!DOCTYPE html>" in html_text
    assert "badge-low" in html_text
    assert "LOW" in html_text


# ── _render_pdf_html unit: null severity in finding ──────────────────────


def test_render_pdf_html_null_severity():
    """_render_pdf_html must handle severity=None without crashing."""
    from app.api.scan_routes import _render_pdf_html

    class _MockFinding:
        severity = None
        category = None
        title = "Finding with null severity"
        description = None
        cve_id = None
        cvss_score = None

    class _MockJob:
        id = "00000000-0000-0000-0000-000000000003"
        scan_type = "ip"
        target = "10.0.0.1"
        status = "completed"
        started_at = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
        completed_at = datetime(2025, 1, 1, 0, 5, 0, tzinfo=UTC)
        result_summary = {"total_findings": 1}
        findings = [_MockFinding()]

    html = _render_pdf_html(_MockJob())
    assert "<!DOCTYPE html>" in html
    assert "Finding with null severity" in html


# ── _render_pdf_html unit: null dates ──────────────────────────────────────


def test_render_pdf_html_null_dates():
    """_render_pdf_html with null started_at/completed_at → 'N/A' duration."""
    from app.api.scan_routes import _render_pdf_html

    class _MockFinding:
        severity = "medium"
        category = "Web"
        title = "Test finding"
        description = "Test"
        cve_id = None
        cvss_score = None

    class _MockJob:
        id = "00000000-0000-0000-0000-000000000001"
        scan_type = "ip"
        target = "10.0.0.1"
        status = "pending"
        started_at = None
        completed_at = None
        result_summary = None
        findings = [_MockFinding()]

    html = _render_pdf_html(_MockJob())
    assert "<!DOCTYPE html>" in html
    assert "N/A" in html


# ── _export_json unit: partial dates ───────────────────────────────────────


def test_export_json_helper_only_started_at():
    """_export_json with started_at but no completed_at → duration_seconds is None."""
    from app.api.scan_routes import _export_json

    class _MockJob:
        id = "00000000-0000-0000-0000-000000000002"
        scan_type = "domain"
        target = "example.com"
        status = "running"
        started_at = datetime(2025, 1, 1, 0, 0, 0, tzinfo=UTC)
        completed_at = None
        result_summary = None
        findings = []

    result = _export_json(_MockJob())
    assert result["started_at"] == "2025-01-01T00:00:00+00:00"
    assert result["completed_at"] is None
    assert result["duration_seconds"] is None
