import uuid
from datetime import UTC, datetime

import pytest

from app.config import settings
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob

HEADERS = {"X-API-Key": settings.api_key}


@pytest.mark.asyncio
async def test_export_json(client, db_session):
    """GET /api/scan/{id}/export?format=json → 200, verify JSON keys."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        result_summary={"total_findings": 1, "high": 1},
        started_at=now,
        completed_at=now,
    )
    db_session.add(job)
    await db_session.commit()

    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=job.id,
        severity="high",
        category="Network",
        title="Open port 22",
        description="SSH port is open",
    )
    db_session.add(finding)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=json", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert "scan_id" in data
    assert data["scan_id"] == str(job.id)
    assert data["target"] == "10.0.0.1"
    assert "findings" in data
    assert len(data["findings"]) == 1
    assert data["findings"][0]["title"] == "Open port 22"
    assert "exported_at" in data


@pytest.mark.asyncio
async def test_export_html(client, db_session):
    """GET /api/scan/{id}/export?format=html → 200, check DOCTYPE."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="example.com",
        status="completed",
        progress=100,
        result_summary={"total_findings": 0},
        started_at=now,
        completed_at=now,
    )
    db_session.add(job)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    assert "<!DOCTYPE html>" in resp.text


def test_start_mobile_scan_no_filename(client):
    resp = client.post(
        "/api/scan/mobile",
        files={"file": ("", b"fake-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    # FastAPI validation rejects empty filename before the route handler;
    # graceful handling at the framework level yields 422.
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_get_scan_detail_with_findings_and_export(client, db_session):
    """Create job + findings, verify export JSON includes them."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="192.168.1.1",
        status="completed",
        progress=100,
        result_summary={"total_findings": 2, "high": 1, "medium": 1},
        started_at=now,
        completed_at=now,
    )
    db_session.add(job)
    await db_session.commit()

    findings = [
        ScanFinding(
            id=uuid.uuid4(),
            job_id=job.id,
            severity="high",
            category="Network",
            title="Open port 22",
            description="SSH port is open",
        ),
        ScanFinding(
            id=uuid.uuid4(),
            job_id=job.id,
            severity="medium",
            category="Web",
            title="Open port 80",
            description="HTTP port found",
        ),
    ]
    for f in findings:
        db_session.add(f)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=json", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["findings"]) == 2
    titles = {f["title"] for f in data["findings"]}
    assert "Open port 22" in titles
    assert "Open port 80" in titles
    assert data["scan_id"] == str(job.id)
    assert data["target"] == "192.168.1.1"
    assert "exported_at" in data


def test_get_scan_history_empty(client):
    """GET /api/scan/history → 200 with empty items."""
    resp = client.get("/api/scan/history", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_export_html_with_findings(client, db_session):
    """GET /api/scan/{id}/export?format=html with findings → 200, verify badges and CVE."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        result_summary={"total_findings": 2, "high": 1, "medium": 1},
        started_at=now,
        completed_at=now,
    )
    db_session.add(job)
    await db_session.commit()

    findings = [
        ScanFinding(
            id=uuid.uuid4(),
            job_id=job.id,
            severity="high",
            category="Network",
            title="Open port 22",
            description="SSH port is open",
            cve_id="CVE-2024-1234",
            cvss_score=7.5,
        ),
        ScanFinding(
            id=uuid.uuid4(),
            job_id=job.id,
            severity="medium",
            category="Web",
            title="Open port 80",
            description="HTTP port found",
        ),
    ]
    for f in findings:
        db_session.add(f)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    html = resp.text
    assert "<!DOCTYPE html>" in html
    assert "badge-high" in html
    assert "badge-medium" in html
    assert "HIGH" in html
    assert "MEDIUM" in html
    assert "CVE-2024-1234" in html
    assert "sev-high" in html
    assert "sev-medium" in html
    assert "10.0.0.1" in html


def test_export_not_found(client):
    """GET /api/scan/{nonexistent}/export → 404."""
    resp = client.get(f"/api/scan/{uuid.uuid4()}/export?format=json", headers=HEADERS)
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Scan job not found"


def test_start_mobile_scan_cleanup_error(client, monkeypatch):
    """POST /api/scan/mobile: start_scan raises → 500 after file cleanup."""
    async def _raise(*args, **kwargs):
        raise Exception("simulated failure")

    monkeypatch.setattr(
        "app.api.scan_routes.ScannerService.start_scan", _raise
    )

    # ServerErrorMiddleware re-raises after generating the 500 response.
    # Disable raise_server_exceptions on the transport to capture it.
    client._transport.raise_server_exceptions = False
    resp = client.post(
        "/api/scan/mobile",
        files={"file": ("test.apk", b"fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 500


def test_start_mobile_scan_cleanup_remove_fails(client, monkeypatch):
    """POST /api/scan/mobile: os.remove fails during cleanup → covered (lines 167-168)."""
    async def _raise(*args, **kwargs):
        raise Exception("simulated failure")

    monkeypatch.setattr(
        "app.api.scan_routes.ScannerService.start_scan", _raise
    )
    monkeypatch.setattr("app.api.scan_routes.os.remove", lambda p: (_ for _ in ()).throw(Exception("remove failed")))

    client._transport.raise_server_exceptions = False
    resp = client.post(
        "/api/scan/mobile",
        files={"file": ("test.apk", b"fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 500


def test_export_json_helper_null_dates():
    """_export_json with null started_at/completed_at → duration_seconds is None (line 32 else branch)."""
    from app.api.scan_routes import _export_json

    class _MockFinding:
        severity = "high"
        category = "Network"
        title = "Open port 22"
        description = "SSH port is open"
        cve_id = None
        cvss_score = None
        remediation = "Close the port"
        raw_data = None

    class _MockJob:
        id = "00000000-0000-0000-0000-000000000000"
        scan_type = "ip"
        target = "10.0.0.1"
        status = "pending"
        started_at = None
        completed_at = None
        result_summary = None
        findings = [_MockFinding()]

    result = _export_json(_MockJob())
    assert result["scan_id"] == "00000000-0000-0000-0000-000000000000"
    assert result["started_at"] is None
    assert result["completed_at"] is None
    assert result["duration_seconds"] is None
    assert result["summary"] is None
    assert len(result["findings"]) == 1
