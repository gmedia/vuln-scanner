from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.config import settings
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.schemas.scan import (
    ScanDiffResponse,
    ScanFindingResponse,
    ScanJobDetailResponse,
)
from app.services.executive_report import (
    plain_language_next_steps,
    render_executive_html,
    top_critical_high_findings,
)

HEADERS = {"X-API-Key": settings.api_key}


def _finding(
    *,
    severity: str,
    title: str,
    cvss: float | None = None,
    job_id: uuid.UUID | None = None,
) -> ScanFindingResponse:
    jid = job_id or uuid.uuid4()
    return ScanFindingResponse(
        id=uuid.uuid4(),
        job_id=jid,
        severity=severity,
        category="web",
        title=title,
        description="deskripsi aman",
        cve_id=None,
        cvss_score=cvss,
        remediation="Perbarui konfigurasi sesuai best practice.",
        impact=None,
        raw_data={"secret_should_not_appear": "xyz"},
        found_at=datetime.now(UTC),
    )


def _job_detail(findings: list[ScanFindingResponse], **kwargs: Any) -> ScanJobDetailResponse:
    now = datetime.now(UTC)
    jid = uuid.uuid4()
    linked = [f.model_copy(update={"job_id": jid}) if hasattr(f, "model_copy") else f for f in findings]
    base: dict[str, Any] = {
        "id": jid,
        "scan_type": "domain",
        "target": "example.com",
        "status": "completed",
        "progress": 100,
        "result_summary": {
            "total_findings": len(linked),
            "critical": sum(1 for f in linked if f.severity == "critical"),
            "high": sum(1 for f in linked if f.severity == "high"),
            "medium": 0,
            "low": 0,
            "info": 0,
        },
        "celery_task_id": None,
        "user_id": uuid.uuid4(),
        "credit_cost": 1,
        "started_at": now - timedelta(minutes=5),
        "completed_at": now,
        "created_at": now,
        "findings": linked,
    }
    base.update(kwargs)
    return ScanJobDetailResponse.model_validate(base)


def test_top_critical_high_orders_and_limits():
    findings = [
        _finding(severity="high", title="H-low", cvss=5.0),
        _finding(severity="critical", title="C1", cvss=9.0),
        _finding(severity="medium", title="M", cvss=4.0),
        _finding(severity="high", title="H-high", cvss=8.0),
        _finding(severity="critical", title="C2", cvss=9.5),
        _finding(severity="high", title="H3", cvss=7.0),
        _finding(severity="critical", title="C3", cvss=9.1),
        _finding(severity="high", title="H4", cvss=6.0),
    ]
    top = top_critical_high_findings(findings, limit=5)
    assert len(top) == 5
    assert all(f.severity in ("critical", "high") for f in top)
    assert top[0].severity == "critical"
    assert "M" not in {f.title for f in top}


def test_render_includes_cover_diff_top_no_raw_secret():
    findings = [
        _finding(severity="critical", title="Open admin", cvss=9.8),
        _finding(severity="high", title="Weak TLS", cvss=7.5),
    ]
    job = _job_detail(findings)
    diff = ScanDiffResponse(
        compared_to_job_id=uuid.uuid4(),
        new_critical=1,
        new_high=1,
        resolved=2,
        worsened=0,
        unchanged=3,
        new_finding_ids=[],
        resolved_finding_ids=[],
    )
    html_out = render_executive_html(
        job,
        diff=diff,
        account_email="ops@example.com",
    )
    assert "Laporan Eksekutif" in html_out
    assert "example.com" in html_out
    assert "ops@example.com" in html_out
    assert 'id="cover"' in html_out
    assert 'id="risk-counts"' in html_out
    assert 'id="whats-new"' in html_out
    assert "Temuan critical baru" in html_out
    assert "Open admin" in html_out
    assert "Weak TLS" in html_out
    assert 'id="next-steps"' in html_out
    assert "secret_should_not_appear" not in html_out
    assert "xyz" not in html_out
    assert "exploit" not in html_out.lower() or "bukan exploit" in html_out.lower()


def test_plain_language_mentions_new_findings():
    job = _job_detail(
        [_finding(severity="critical", title="X", cvss=9.0)],
        result_summary={"total_findings": 1, "critical": 1, "high": 0},
    )
    diff = ScanDiffResponse(
        compared_to_job_id=uuid.uuid4(),
        new_critical=1,
        new_high=0,
        resolved=0,
        worsened=0,
        unchanged=0,
    )
    text = plain_language_next_steps(job, diff)
    assert "critical/high baru" in text
    assert "PoC" not in text
    assert "exploit payload" not in text.lower()


@pytest.mark.asyncio
async def test_export_executive_api_with_diff(client, db_session, sample_user):
    t0 = datetime.now(UTC) - timedelta(days=2)
    t1 = datetime.now(UTC) - timedelta(days=1)
    prior = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="exec-s4.example",
        status="completed",
        progress=100,
        result_summary={"total_findings": 0},
        user_id=sample_user.id,
        started_at=t0,
        completed_at=t0,
    )
    current = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="exec-s4.example",
        status="completed",
        progress=100,
        result_summary={"total_findings": 1, "critical": 1, "high": 0},
        user_id=sample_user.id,
        started_at=t1,
        completed_at=t1,
    )
    db_session.add_all([prior, current])
    await db_session.commit()
    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=current.id,
        severity="critical",
        category="ssl",
        title="Cert expired critical",
        description="Certificate validation failed",
        remediation="Perbarui sertifikat TLS.",
        raw_data={"path": "/"},
    )
    db_session.add(finding)
    await db_session.commit()

    resp = client.get(
        f"/api/scan/{current.id}/export?format=executive",
        headers=HEADERS,
    )
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")
    body = resp.text
    assert "Laporan Eksekutif" in body
    assert "exec-s4.example" in body
    assert "Apa yang baru" in body
    assert "Cert expired critical" in body
    assert sample_user.email in body
    assert "raw_data" not in body
    cd = resp.headers.get("content-disposition", "")
    assert "executive.html" in cd


@pytest.mark.asyncio
async def test_export_invalid_format_mentions_executive(client, db_session, sample_user):
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.9",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add(job)
    await db_session.commit()
    resp = client.get(f"/api/scan/{job.id}/export?format=pdf", headers=HEADERS)
    assert resp.status_code == 400
    assert "executive" in resp.json()["detail"]
