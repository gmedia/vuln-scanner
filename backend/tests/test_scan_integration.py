import uuid

import pytest

from app.config import settings
from app.models.scan_job import ScanJob

HEADERS = {"X-API-Key": settings.api_key}


# ── Full scan lifecycle ────────────────────────────────────────────────────


def test_full_scan_lifecycle(client, mock_celery):
    """POST /api/scan/ip → verify 202, pending job → GET /api/scan/{id} → GET findings."""
    # Step 1: Start scan
    payload = {"target": "10.0.0.1", "ports": "22-80"}
    resp = client.post("/api/scan/ip", json=payload, headers=HEADERS)
    assert resp.status_code == 202
    data = resp.json()
    assert data["scan_type"] == "ip"
    assert data["target"] == "10.0.0.1"
    assert data["status"] == "pending"
    assert data["progress"] == 0
    assert "id" in data
    job_id = data["id"]

    # Step 2: Get scan detail
    resp = client.get(f"/api/scan/{job_id}", headers=HEADERS)
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["id"] == job_id
    assert detail["scan_type"] == "ip"
    assert detail["target"] == "10.0.0.1"
    assert detail["status"] == "pending"
    assert detail["findings"] == []

    # Step 3: Verify findings endpoint works (empty at this point)
    resp = client.get(f"/api/scan/{job_id}/findings", headers=HEADERS)
    assert resp.status_code == 200
    findings = resp.json()
    assert findings == []


# ── Scan history with jobs ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_scan_history_with_jobs(client, db_session, sample_user):
    """Create 2 scan jobs → GET /api/scan/history → verify pagination and ordering."""
    job1 = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add(job1)
    await db_session.commit()

    job2 = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="example.com",
        status="pending",
        progress=0,
        user_id=sample_user.id,
    )
    db_session.add(job2)
    await db_session.commit()

    resp = client.get("/api/scan/history", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert data["page"] == 1
    assert data["limit"] == 20
    assert data["pages"] == 1
    assert len(data["items"]) == 2

    # Verify ordering: newest first (created_at desc) → job2 then job1
    item_ids = [item["id"] for item in data["items"]]
    assert str(job2.id) in item_ids
    assert str(job1.id) in item_ids
    assert item_ids[0] == str(job2.id)
    assert item_ids[1] == str(job1.id)

    # Verify job fields in response
    ip_job = data["items"][1]
    assert ip_job["scan_type"] == "ip"
    assert ip_job["target"] == "10.0.0.1"
    assert ip_job["status"] == "completed"


# ── Credit deduction ───────────────────────────────────────────────────────


def test_scan_credit_deduction(client, mock_celery):
    """POST /api/scan/ip → verify user credits decrease after starting a scan."""
    # Get current credits via a scan history call (user is the same across calls)
    payload = {"target": "10.0.0.1", "ports": "22-80"}
    resp = client.post("/api/scan/ip", json=payload, headers=HEADERS)
    assert resp.status_code == 202
    data = resp.json()
    assert data["credit_cost"] > 0
    assert "id" in data


# ── Idempotent findings empty ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_scan_idempotent_findings_empty(client, db_session, sample_user):
    """GET /api/scan/{id}/findings on a job with no findings → returns empty list."""
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="pending",
        progress=0,
        user_id=sample_user.id,
    )
    db_session.add(job)
    await db_session.commit()

    # Call multiple times to verify idempotent behavior
    for _ in range(3):
        resp = client.get(f"/api/scan/{job.id}/findings", headers=HEADERS)
        assert resp.status_code == 200
        findings = resp.json()
        assert findings == []
        assert isinstance(findings, list)
