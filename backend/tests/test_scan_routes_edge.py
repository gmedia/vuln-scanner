import uuid
from datetime import UTC, datetime

import pytest

from app.config import settings
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob

HEADERS = {"X-API-Key": settings.api_key}


@pytest.mark.asyncio
async def test_export_json(client, db_session, sample_user):
    """GET /api/scan/{id}/export?format=json → 200, verify JSON keys."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        result_summary={"total_findings": 1, "high": 1},
        user_id=sample_user.id,
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
    assert "job_id" in data
    assert data["job_id"] == str(job.id)
    assert data["target"] == "10.0.0.1"
    assert "findings" in data
    assert len(data["findings"]) == 1
    assert data["findings"][0]["title"] == "Open port 22"
    assert "exported_at" in data


@pytest.mark.asyncio
async def test_export_html(client, db_session, sample_user):
    """GET /api/scan/{id}/export?format=html → 200, check DOCTYPE."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="example.com",
        status="completed",
        progress=100,
        result_summary={"total_findings": 0},
        user_id=sample_user.id,
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


def test_start_mobile_scan_empty_filename_in_multipart(client):
    """POST /api/scan/mobile with filename=\"\" in raw multipart → 400 (line 174).

    httpx treats files={'file': ('', ...)} as a form field (no filename),
    so FastAPI validation rejects it as 422 before reaching the handler.
    To actually trigger the ``not file.filename`` branch at line 174, we
    send a raw multipart body where the Content-Disposition header includes
    ``filename=\"\"``.  Starlette parses that as an UploadFile with an empty
    string filename, which is falsy in Python.
    """
    boundary = "boundary-no-filename-174"
    body = b"\r\n".join(
        [
            f"--{boundary}".encode(),
            b'Content-Disposition: form-data; name="file"; filename=""',
            b"Content-Type: application/octet-stream",
            b"",
            b"fake-apk-content",
            f"--{boundary}".encode(),
            b'Content-Disposition: form-data; name="platform"',
            b"",
            b"android",
            f"--{boundary}--".encode(),
        ]
    )
    resp = client.post(
        "/api/scan/mobile",
        content=body,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            **HEADERS,
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "File must have a filename"


@pytest.mark.asyncio
async def test_get_scan_detail_with_findings_and_export(client, db_session, sample_user):
    """Create job + findings, verify export JSON includes them."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="192.168.1.1",
        status="completed",
        progress=100,
        result_summary={"total_findings": 2, "high": 1, "medium": 1},
        user_id=sample_user.id,
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
    assert data["job_id"] == str(job.id)
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
async def test_export_html_with_findings(client, db_session, sample_user):
    """GET /api/scan/{id}/export?format=html with findings → 200, verify badges and CVE."""
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        result_summary={"total_findings": 2, "high": 1, "medium": 1},
        user_id=sample_user.id,
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

    monkeypatch.setattr("app.api.scan_routes.ScannerService.start_scan", _raise)

    # ServerErrorMiddleware re-raises after generating the 500 response.
    # Disable raise_server_exceptions on the transport to capture it.
    client._transport.raise_server_exceptions = False
    resp = client.post(
        "/api/scan/mobile",
        files={"file": ("test.apk", b"PK\x03\x04fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 500


def test_start_mobile_scan_cleanup_remove_fails(client, monkeypatch):
    """POST /api/scan/mobile: os.remove fails during cleanup → covered (lines 167-168)."""

    async def _raise(*args, **kwargs):
        raise Exception("simulated failure")

    monkeypatch.setattr("app.api.scan_routes.ScannerService.start_scan", _raise)
    monkeypatch.setattr("app.api.scan_routes.os.remove", lambda p: (_ for _ in ()).throw(Exception("remove failed")))

    client._transport.raise_server_exceptions = False
    resp = client.post(
        "/api/scan/mobile",
        files={"file": ("test.apk", b"PK\x03\x04fake-apk-content")},
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
    assert result["job_id"] == "00000000-0000-0000-0000-000000000000"
    assert result["started_at"] is None
    assert result["completed_at"] is None
    assert result["duration_seconds"] is None
    assert result["summary"] is None
    assert len(result["findings"]) == 1


# ── Domain scan rate-limit hit (line 178) ──────────────────────────────────


def test_domain_scan_rate_limit_returns_429(client, db_session, monkeypatch):
    """POST /api/scan/domain — rate limit hit returns 429."""
    from app.api import scan_routes

    async def mock_start_scan(*args, **kwargs):
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type="domain",
            target="example.com",
            status="pending",
            progress=0,
            user_id=kwargs["user"].id,
        )
        db_session.add(job)
        await db_session.commit()
        return job

    monkeypatch.setattr("app.api.scan_routes.ScannerService.start_scan", mock_start_scan)
    monkeypatch.setattr(scan_routes.scan_submit_limiter, "max_requests", 1)

    resp1 = client.post("/api/scan/domain", json={"domain": "example.com"}, headers=HEADERS)
    assert resp1.status_code == 202

    resp2 = client.post("/api/scan/domain", json={"domain": "example.com"}, headers=HEADERS)
    assert resp2.status_code == 429


# ── Mobile scan rate-limit hit (line 194) ──────────────────────────────────


def test_mobile_scan_rate_limit_returns_429(client, db_session, monkeypatch):
    """POST /api/scan/mobile — rate limit hit returns 429."""
    from app.api import scan_routes

    async def mock_start_scan(*args, **kwargs):
        job = ScanJob(
            id=uuid.uuid4(),
            scan_type="apk",
            target="test.apk",
            status="pending",
            progress=0,
            user_id=kwargs["user"].id,
        )
        db_session.add(job)
        await db_session.commit()
        return job

    monkeypatch.setattr("app.api.scan_routes.ScannerService.start_scan", mock_start_scan)
    monkeypatch.setattr(scan_routes.scan_submit_limiter, "max_requests", 1)

    resp1 = client.post(
        "/api/scan/mobile",
        files={"file": ("test.apk", b"PK\x03\x04fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp1.status_code == 202

    resp2 = client.post(
        "/api/scan/mobile",
        files={"file": ("test.apk", b"PK\x03\x04fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp2.status_code == 429


# ── Filename too long (line 202) ───────────────────────────────────────────


def test_mobile_scan_filename_too_long(client):
    """POST /api/scan/mobile — filename > 255 chars returns 400."""
    long_name = "a" * 256
    resp = client.post(
        "/api/scan/mobile",
        files={"file": (long_name, b"PK\x03\x04fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Filename too long"


# ── Not a valid ZIP (line 207) ─────────────────────────────────────────────


def test_mobile_scan_invalid_zip_returns_400(client):
    """POST /api/scan/mobile — non-ZIP file returns 400."""
    resp = client.post(
        "/api/scan/mobile",
        files={"file": ("test.apk", b"\x00\x01\x02\x03not-a-zip")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 400
    assert "valid ZIP" in resp.json()["detail"]


# ── File exceeds 500 MB limit (lines 220-222) ─────────────────────────────


def test_mobile_scan_file_exceeds_size_limit(client, monkeypatch):
    """POST /api/scan/mobile — file > 500MB raises 413."""
    import tempfile

    tmpdir = tempfile.mkdtemp()
    monkeypatch.setattr("app.api.scan_routes.settings.upload_dir", tmpdir)
    monkeypatch.setattr("app.api.scan_routes.os.unlink", lambda p: None)
    monkeypatch.setattr("app.api.scan_routes.os.remove", lambda p: None)

    # Patch max_size in the mobile_scan function by setting it at module level
    import app.api.scan_routes as sr_mod

    monkeypatch.setattr(sr_mod, "MOBILE_UPLOAD_MAX_SIZE", 10)

    resp = client.post(
        "/api/scan/mobile",
        files={"file": ("big.apk", b"PK\x03\x04" + b"x" * 2000)},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 413
    assert "exceeds" in resp.json()["detail"].lower() or "500" in resp.json()["detail"]


# ── CeleryError cleanup (lines 237-239) ────────────────────────────────────


def test_mobile_scan_celery_error_cleanup(client, monkeypatch):
    """POST /api/scan/mobile — CeleryError triggers file cleanup."""
    from celery.exceptions import CeleryError

    async def mock_start_scan(*args, **kwargs):
        raise CeleryError("Celery broker down")

    monkeypatch.setattr("app.api.scan_routes.ScannerService.start_scan", mock_start_scan)
    monkeypatch.setattr("app.api.scan_routes.os.remove", lambda p: None)

    client._transport.raise_server_exceptions = False
    resp = client.post(
        "/api/scan/mobile",
        files={"file": ("test.apk", b"PK\x03\x04fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 500


# ---------------------------------------------------------------------------
# Direct handler tests — coverage for lines unreachable via TestClient
# ---------------------------------------------------------------------------


class TestStartScanDirectHandlers:
    @pytest.mark.asyncio
    async def test_start_ip_scan_direct(self):
        """Call start_ip_scan directly to cover return job at line 168."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.api.scan_routes import start_ip_scan
        from app.schemas.scan import ScanRequest

        mock_job = MagicMock()
        mock_job.id = uuid.uuid4()
        mock_job.scan_type = "ip"
        mock_job.target = "192.168.1.1"
        mock_job.status = "pending"
        mock_job.progress = 0
        mock_job.result_summary = None
        mock_job.celery_task_id = None
        mock_job.user_id = uuid.uuid4()
        mock_job.credit_cost = 1
        mock_job.started_at = None
        mock_job.completed_at = None
        mock_job.created_at = datetime.now(UTC)

        mock_req = ScanRequest(target="192.168.1.1", ports="1-1000")
        mock_user = MagicMock()
        mock_request = MagicMock()

        with (
            patch("app.api.scan_routes.scan_submit_limiter", new_callable=AsyncMock) as mock_limiter,
            patch("app.api.scan_routes.ScannerService") as mock_svc_cls,
        ):
            mock_limiter.return_value = None
            mock_svc = MagicMock()
            mock_svc.start_scan = AsyncMock(return_value=mock_job)
            mock_svc_cls.return_value = mock_svc

            result = await start_ip_scan(
                request=mock_request,
                req=mock_req,
                current_user=mock_user,
                db=MagicMock(),
            )

        assert result is mock_job

    @pytest.mark.asyncio
    async def test_start_domain_scan_direct(self):
        """Call start_domain_scan directly to cover return job at line 183."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.api.scan_routes import start_domain_scan
        from app.schemas.scan import DomainScanRequest

        mock_job = MagicMock()
        mock_job.id = uuid.uuid4()
        mock_job.scan_type = "domain"
        mock_job.target = "example.com"
        mock_job.status = "pending"
        mock_job.progress = 0
        mock_job.result_summary = None
        mock_job.celery_task_id = None
        mock_job.user_id = uuid.uuid4()
        mock_job.credit_cost = 2
        mock_job.started_at = None
        mock_job.completed_at = None
        mock_job.created_at = datetime.now(UTC)

        mock_req = DomainScanRequest(domain="example.com")
        mock_user = MagicMock()
        mock_request = MagicMock()

        with (
            patch("app.api.scan_routes.scan_submit_limiter", new_callable=AsyncMock) as mock_limiter,
            patch("app.api.scan_routes.ScannerService") as mock_svc_cls,
        ):
            mock_limiter.return_value = None
            mock_svc = MagicMock()
            mock_svc.start_scan = AsyncMock(return_value=mock_job)
            mock_svc_cls.return_value = mock_svc

            result = await start_domain_scan(
                request=mock_request,
                req=mock_req,
                current_user=mock_user,
                db=MagicMock(),
            )

        assert result is mock_job

    @pytest.mark.asyncio
    async def test_start_mobile_scan_direct(self):
        """Call start_mobile_scan directly to cover return job at line 237."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.api.scan_routes import start_mobile_scan

        mock_job = MagicMock()
        mock_job.id = uuid.uuid4()
        mock_job.scan_type = "apk"
        mock_job.target = "test.apk"
        mock_job.status = "pending"
        mock_job.progress = 0
        mock_job.result_summary = None
        mock_job.celery_task_id = None
        mock_job.user_id = uuid.uuid4()
        mock_job.credit_cost = 3
        mock_job.started_at = None
        mock_job.completed_at = None
        mock_job.created_at = datetime.now(UTC)

        mock_user = MagicMock()
        mock_request = MagicMock()

        mock_file = MagicMock()
        mock_file.filename = "test.apk"
        mock_file.read = AsyncMock(side_effect=[b"PK\x03\x04", b"", b""])
        mock_file.seek = AsyncMock()

        with (
            patch("app.api.scan_routes.scan_submit_limiter", new_callable=AsyncMock) as mock_limiter,
            patch("app.api.scan_routes.ScannerService") as mock_svc_cls,
            patch("app.api.scan_routes.os.makedirs"),
            patch("app.api.scan_routes.os.urandom", return_value=b"\x00" * 8),
            patch("builtins.open"),
        ):
            mock_limiter.return_value = None
            mock_svc = MagicMock()
            mock_svc.start_scan = AsyncMock(return_value=mock_job)
            mock_svc_cls.return_value = mock_svc

            result = await start_mobile_scan(
                request=mock_request,
                file=mock_file,
                platform="android",
                current_user=mock_user,
                db=MagicMock(),
            )

        assert result is mock_job


class TestGetScanDirectHandlers:
    @pytest.mark.asyncio
    async def test_get_scan_not_found_direct(self):
        """Call get_scan directly to cover 404 at lines 266-268."""
        import uuid
        from unittest.mock import AsyncMock, MagicMock, patch

        from fastapi import HTTPException

        from app.api.scan_routes import get_scan

        mock_user = MagicMock()
        job_id = str(uuid.uuid4())

        with patch("app.api.scan_routes.ScannerService") as mock_svc_cls:
            mock_svc = MagicMock()
            mock_svc.get_job = AsyncMock(return_value=None)
            mock_svc_cls.return_value = mock_svc

            with pytest.raises(HTTPException) as exc_info:
                await get_scan(
                    job_id=job_id,
                    current_user=mock_user,
                    db=MagicMock(),
                )

        assert exc_info.value.status_code == 404
        assert "Scan job not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_get_scan_found_direct(self):
        """Call get_scan directly with a found job to cover return at line 268."""
        import uuid
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.api.scan_routes import get_scan

        mock_job = MagicMock()
        mock_user = MagicMock()
        job_id = str(uuid.uuid4())

        with patch("app.api.scan_routes.ScannerService") as mock_svc_cls:
            mock_svc = MagicMock()
            mock_svc.get_job = AsyncMock(return_value=mock_job)
            mock_svc_cls.return_value = mock_svc

            result = await get_scan(
                job_id=job_id,
                current_user=mock_user,
                db=MagicMock(),
            )

        assert result is mock_job

    @pytest.mark.asyncio
    async def test_get_scan_findings_direct(self):
        """Call get_scan_findings directly to cover return at line 278."""
        import uuid
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.api.scan_routes import get_scan_findings

        mock_findings = [MagicMock(), MagicMock()]
        mock_user = MagicMock()
        job_id = str(uuid.uuid4())

        with patch("app.api.scan_routes.ScannerService") as mock_svc_cls:
            mock_svc = MagicMock()
            mock_svc.get_findings = AsyncMock(return_value=mock_findings)
            mock_svc_cls.return_value = mock_svc

            result = await get_scan_findings(
                job_id=job_id,
                current_user=mock_user,
                db=MagicMock(),
            )

        assert result is mock_findings
        assert len(result) == 2


class TestExportScanDirectHandlers:
    @pytest.mark.asyncio
    async def test_export_scan_not_found_direct(self):
        """Call export_scan directly to cover 404 at lines 295-296."""
        import uuid
        from unittest.mock import AsyncMock, MagicMock, patch

        from fastapi import HTTPException

        from app.api.scan_routes import export_scan

        mock_user = MagicMock()
        job_id = str(uuid.uuid4())

        with patch("app.api.scan_routes.ScannerService") as mock_svc_cls:
            mock_svc = MagicMock()
            mock_svc.get_job = AsyncMock(return_value=None)
            mock_svc_cls.return_value = mock_svc

            with pytest.raises(HTTPException) as exc_info:
                await export_scan(
                    job_id=job_id,
                    format="json",
                    current_user=mock_user,
                    db=MagicMock(),
                )

        assert exc_info.value.status_code == 404
        assert "Scan job not found" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_export_scan_json_format_direct(self):
        """Call export_scan with format=json to cover lines 298-306."""
        import uuid
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.api.scan_routes import export_scan

        mock_job = MagicMock()
        mock_job.id = uuid.uuid4()
        mock_job.scan_type = "ip"
        mock_job.target = "192.168.1.1"
        mock_job.status = "completed"
        mock_job.started_at = None
        mock_job.completed_at = None
        mock_job.result_summary = None
        mock_job.findings = []

        mock_user = MagicMock()
        job_id = str(uuid.uuid4())

        with (
            patch("app.api.scan_routes.ScannerService") as mock_svc_cls,
            patch("app.api.scan_routes._export_json") as mock_export_json,
        ):
            mock_svc = MagicMock()
            mock_svc.get_job = AsyncMock(return_value=mock_job)
            mock_svc_cls.return_value = mock_svc
            mock_export_json.return_value = {"status": "ok"}

            from fastapi.responses import JSONResponse

            result = await export_scan(
                job_id=job_id,
                format="json",
                current_user=mock_user,
                db=MagicMock(),
            )

        assert isinstance(result, JSONResponse)
        assert "Content-Disposition" in result.headers
        assert result.headers["Content-Type"] == "application/octet-stream"

    @pytest.mark.asyncio
    async def test_export_scan_html_format_direct(self):
        """Call export_scan with format=html to cover lines 308-310."""
        import uuid
        from unittest.mock import AsyncMock, MagicMock, patch

        from app.api.scan_routes import export_scan

        mock_job = MagicMock()
        mock_job.id = uuid.uuid4()
        mock_job.scan_type = "ip"
        mock_job.target = "192.168.1.1"
        mock_job.status = "completed"
        mock_job.started_at = None
        mock_job.completed_at = None
        mock_job.result_summary = None
        mock_job.findings = []

        mock_user = MagicMock()
        job_id = str(uuid.uuid4())

        with (
            patch("app.api.scan_routes.ScannerService") as mock_svc_cls,
            patch("app.api.scan_routes._render_pdf_html", return_value="<html></html>"),
        ):
            mock_svc = MagicMock()
            mock_svc.get_job = AsyncMock(return_value=mock_job)
            mock_svc_cls.return_value = mock_svc

            from fastapi.responses import HTMLResponse

            result = await export_scan(
                job_id=job_id,
                format="html",
                current_user=mock_user,
                db=MagicMock(),
            )

        assert isinstance(result, HTMLResponse)
        assert result.body == b"<html></html>"

    @pytest.mark.asyncio
    async def test_export_scan_invalid_format_direct(self):
        """Call export_scan with invalid format to cover line 312."""
        import uuid
        from unittest.mock import AsyncMock, MagicMock, patch

        from fastapi import HTTPException

        from app.api.scan_routes import export_scan

        mock_job = MagicMock()
        mock_user = MagicMock()
        job_id = str(uuid.uuid4())

        with patch("app.api.scan_routes.ScannerService") as mock_svc_cls:
            mock_svc = MagicMock()
            mock_svc.get_job = AsyncMock(return_value=mock_job)
            mock_svc_cls.return_value = mock_svc

            with pytest.raises(HTTPException) as exc_info:
                await export_scan(
                    job_id=job_id,
                    format="xml",
                    current_user=mock_user,
                    db=MagicMock(),
                )

        assert exc_info.value.status_code == 400
        assert "format must be" in exc_info.value.detail
