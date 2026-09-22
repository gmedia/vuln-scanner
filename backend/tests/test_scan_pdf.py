import os
import uuid
from unittest.mock import patch

import pytest

from app.config import settings
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.services.scan_pdf import ScanPdfUnavailableError, render_scan_pdf

HEADERS = {"X-API-Key": settings.api_key}
_FAKE_PDF = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n mock"


@pytest.mark.asyncio
async def test_export_pdf_headers_and_magic(client, db_session, sample_user):
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        user_id=sample_user.id,
        result_summary={"total_findings": 0},
    )
    db_session.add(job)
    await db_session.commit()

    with patch("app.api.scan_routes.render_scan_pdf", return_value=_FAKE_PDF) as mock_pdf:
        resp = client.get(f"/api/scan/{job.id}/export?format=pdf", headers=HEADERS)

    assert resp.status_code == 200
    assert "application/pdf" in resp.headers.get("content-type", "")
    cd = resp.headers.get("content-disposition", "")
    assert f'filename="scan_{job.id}.pdf"' in cd
    assert "attachment" in cd
    assert resp.content.startswith(b"%PDF")
    mock_pdf.assert_called_once()
    html_arg = mock_pdf.call_args[0][0]
    assert "Laporan Eksekutif" in html_arg


@pytest.mark.asyncio
async def test_export_pdf_missing_job_404(client):
    fake_id = str(uuid.uuid4())
    resp = client.get(f"/api/scan/{fake_id}/export?format=pdf", headers=HEADERS)
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Scan job not found"


@pytest.mark.asyncio
async def test_export_pdf_unavailable_503(client, db_session, sample_user):
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

    with patch(
        "app.api.scan_routes.render_scan_pdf",
        side_effect=ScanPdfUnavailableError("PDF rendering unavailable"),
    ):
        resp = client.get(f"/api/scan/{job.id}/export?format=pdf", headers=HEADERS)

    assert resp.status_code == 503
    assert resp.json()["detail"] == "PDF rendering unavailable"


@pytest.mark.asyncio
async def test_export_pdf_passes_executive_html_with_finding(client, db_session, sample_user):
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.2",
        status="completed",
        progress=100,
        user_id=sample_user.id,
        result_summary={"total_findings": 1, "critical": 1},
    )
    db_session.add(job)
    await db_session.commit()
    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=job.id,
        severity="critical",
        category="ssl",
        title="Expired certificate",
        description="TLS cert expired",
        remediation="Renew the certificate.",
    )
    db_session.add(finding)
    await db_session.commit()

    with patch("app.api.scan_routes.render_scan_pdf", return_value=_FAKE_PDF) as mock_pdf:
        resp = client.get(f"/api/scan/{job.id}/export?format=pdf&lang=en", headers=HEADERS)

    assert resp.status_code == 200
    html_arg = mock_pdf.call_args[0][0]
    assert "Executive Report" in html_arg or "Expired certificate" in html_arg
    assert "Laporan Eksekutif" not in html_arg


def test_render_scan_pdf_magic_bytes():
    try:
        pdf = render_scan_pdf("<html><body><p>Sinexis</p></body></html>")
    except ScanPdfUnavailableError:
        if os.environ.get("GITHUB_ACTIONS"):
            raise
        pytest.skip("WeasyPrint system libraries not installed")
    assert pdf.startswith(b"%PDF")


def test_render_scan_pdf_empty_raises():
    pytest.importorskip("weasyprint")
    with patch("weasyprint.HTML") as html_cls:
        html_cls.return_value.write_pdf.return_value = b""
        with pytest.raises(ScanPdfUnavailableError):
            render_scan_pdf("<html></html>")
