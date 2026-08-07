"""Unit + API tests for S2 baseline fingerprint and scan diff."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.config import settings
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User
from app.services.baseline_diff import diff_findings, finding_fingerprint, severity_rank

HEADERS = {"X-API-Key": settings.api_key}


def _finding(
    *,
    title: str = "Open SSH",
    severity: str = "medium",
    category: str | None = "Network",
    cve_id: str | None = "cve-2024-1234",
    raw_data: dict[str, object] | None = None,
    finding_id: uuid.UUID | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=finding_id or uuid.uuid4(),
        title=title,
        severity=severity,
        category=category,
        cve_id=cve_id,
        raw_data=raw_data,
    )


def test_finding_fingerprint_stable_same_inputs():
    a = _finding(
        title="  Open   Port  22 ",
        category=" Network ",
        cve_id="cve-2024-1",
        raw_data={"port": 22, "path": "/admin"},
    )
    b = _finding(
        title="  Open   Port  22 ",
        category=" Network ",
        cve_id="cve-2024-1",
        raw_data={"port": 22, "path": "/admin"},
    )
    assert finding_fingerprint(a) == finding_fingerprint(b)
    assert finding_fingerprint(a) == "network|CVE-2024-1|22|/admin|open port 22"


def test_finding_fingerprint_title_whitespace_and_case():
    a = _finding(title="Missing  HSTS", category="Web", cve_id=None, raw_data=None)
    b = _finding(title="missing hsts", category="web", cve_id="", raw_data={})
    assert finding_fingerprint(a) == finding_fingerprint(b)


def test_finding_fingerprint_port_key_variants():
    base = dict(title="SSH", category="net", cve_id=None)
    via_port = finding_fingerprint(_finding(**base, raw_data={"port": 22}))
    via_port_cap = finding_fingerprint(_finding(**base, raw_data={"Port": 22}))
    via_portid = finding_fingerprint(_finding(**base, raw_data={"portid": "22"}))
    assert via_port == via_port_cap == via_portid
    assert via_port.endswith("|22||ssh") or "|22|" in via_port


def test_finding_fingerprint_path_key_variants():
    base = dict(title="XSS", category="web", cve_id=None)
    via_path = finding_fingerprint(_finding(**base, raw_data={"path": "/x"}))
    via_url = finding_fingerprint(_finding(**base, raw_data={"url": "/x"}))
    via_endpoint = finding_fingerprint(_finding(**base, raw_data={"endpoint": "/x"}))
    assert via_path == via_url == via_endpoint


def test_severity_rank_unknown_is_zero():
    assert severity_rank(None) == 0
    assert severity_rank("unknown") == 0
    assert severity_rank("critical") == 4
    assert severity_rank("HIGH") == 3


def test_diff_findings_new_critical_resolved_worsened_unchanged():
    shared_id_base = uuid.uuid4()
    shared_id_curr = uuid.uuid4()
    new_crit_id = uuid.uuid4()
    resolved_id = uuid.uuid4()
    worsened_base_id = uuid.uuid4()
    worsened_curr_id = uuid.uuid4()

    baseline = [
        _finding(
            finding_id=shared_id_base,
            title="Same finding",
            severity="high",
            category="net",
            cve_id="CVE-1",
            raw_data={"port": 80},
        ),
        _finding(
            finding_id=resolved_id,
            title="Gone now",
            severity="medium",
            category="web",
            cve_id=None,
            raw_data={"path": "/old"},
        ),
        _finding(
            finding_id=worsened_base_id,
            title="Escalating",
            severity="low",
            category="ssl",
            cve_id=None,
            raw_data=None,
        ),
    ]
    current = [
        _finding(
            finding_id=shared_id_curr,
            title="Same finding",
            severity="medium",
            category="net",
            cve_id="CVE-1",
            raw_data={"port": 80},
        ),
        _finding(
            finding_id=new_crit_id,
            title="Brand new RCE",
            severity="critical",
            category="rce",
            cve_id="CVE-9",
            raw_data=None,
        ),
        _finding(
            finding_id=worsened_curr_id,
            title="Escalating",
            severity="critical",
            category="ssl",
            cve_id=None,
            raw_data=None,
        ),
        _finding(
            title="New high only",
            severity="high",
            category="web",
            cve_id=None,
            raw_data={"path": "/new"},
        ),
    ]

    result = diff_findings(baseline, current)
    assert result.new_critical == 1
    assert result.new_high == 1
    assert result.resolved == 1
    assert result.worsened == 1
    assert result.unchanged == 1
    assert str(new_crit_id) in result.new_finding_ids
    assert str(resolved_id) in result.resolved_finding_ids
    assert len(result.new_finding_ids) == 2


def test_diff_findings_empty_both_sides():
    result = diff_findings([], [])
    assert result.new_critical == 0
    assert result.new_high == 0
    assert result.resolved == 0
    assert result.worsened == 0
    assert result.unchanged == 0
    assert result.new_finding_ids == []
    assert result.resolved_finding_ids == []


async def _seed_job(
    db_session,
    user: User,
    *,
    target: str = "example.com",
    scan_type: str = "domain",
    status: str = "completed",
    completed_at: datetime | None = None,
    created_at: datetime | None = None,
) -> ScanJob:
    now = datetime.now(UTC)
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type=scan_type,
        target=target,
        status=status,
        progress=100 if status == "completed" else 50,
        user_id=user.id,
        started_at=completed_at or created_at or now,
        completed_at=completed_at,
        created_at=created_at or completed_at or now,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    return job


async def _seed_finding(
    db_session,
    job: ScanJob,
    *,
    title: str,
    severity: str,
    category: str | None = "Network",
    cve_id: str | None = None,
    raw_data: dict[str, object] | None = None,
) -> ScanFinding:
    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=job.id,
        severity=severity,
        category=category,
        title=title,
        description=title,
        cve_id=cve_id,
        raw_data=raw_data,
    )
    db_session.add(finding)
    await db_session.commit()
    await db_session.refresh(finding)
    return finding


@pytest.mark.asyncio
async def test_diff_api_no_prior_returns_zeros(client, db_session, sample_user):
    job = await _seed_job(db_session, sample_user, completed_at=datetime.now(UTC))
    resp = client.get(f"/api/scan/{job.id}/diff", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["compared_to_job_id"] is None
    assert data["new_critical"] == 0
    assert data["new_high"] == 0
    assert data["resolved"] == 0
    assert data["worsened"] == 0
    assert data["unchanged"] == 0
    assert data["new_finding_ids"] == []
    assert data["resolved_finding_ids"] == []


@pytest.mark.asyncio
async def test_diff_api_two_jobs_stable_counts(client, db_session, sample_user):
    t0 = datetime(2025, 1, 1, 12, 0, 0, tzinfo=UTC)
    t1 = t0 + timedelta(days=7)

    baseline = await _seed_job(db_session, sample_user, completed_at=t0)
    current = await _seed_job(db_session, sample_user, completed_at=t1)

    await _seed_finding(
        db_session,
        baseline,
        title="Open port 22",
        severity="medium",
        category="Network",
        raw_data={"port": 22},
    )
    await _seed_finding(
        db_session,
        baseline,
        title="Old issue",
        severity="low",
        category="Web",
        raw_data={"path": "/old"},
    )
    await _seed_finding(
        db_session,
        current,
        title="Open port 22",
        severity="high",
        category="Network",
        raw_data={"port": 22},
    )
    new_crit = await _seed_finding(
        db_session,
        current,
        title="RCE in admin",
        severity="critical",
        category="RCE",
        cve_id="CVE-2025-1",
    )

    resp = client.get(f"/api/scan/{current.id}/diff", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["compared_to_job_id"] == str(baseline.id)
    assert data["new_critical"] == 1
    assert data["new_high"] == 0
    assert data["resolved"] == 1
    assert data["worsened"] == 1
    assert data["unchanged"] == 0
    assert str(new_crit.id) in data["new_finding_ids"]
    assert len(data["resolved_finding_ids"]) == 1

    resp2 = client.get(f"/api/scan/{current.id}/diff", headers=HEADERS)
    assert resp2.json() == data


@pytest.mark.asyncio
async def test_diff_api_not_completed_returns_400(client, db_session, sample_user):
    job = await _seed_job(db_session, sample_user, status="running", completed_at=None)
    resp = client.get(f"/api/scan/{job.id}/diff", headers=HEADERS)
    assert resp.status_code == 400
    assert "completed" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_diff_api_other_user_job_404(client, db_session, sample_user):
    other = User(
        id=uuid.uuid4(),
        email="other@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=50,
    )
    db_session.add(other)
    await db_session.commit()

    job = await _seed_job(db_session, other, completed_at=datetime.now(UTC))
    resp = client.get(f"/api/scan/{job.id}/diff", headers=HEADERS)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_diff_api_missing_job_404(client, db_session, sample_user):
    missing = uuid.uuid4()
    resp = client.get(f"/api/scan/{missing}/diff", headers=HEADERS)
    assert resp.status_code == 404
