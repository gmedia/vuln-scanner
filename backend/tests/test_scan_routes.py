import uuid

import pytest

from app.config import settings
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User

HEADERS = {"X-API-Key": settings.api_key}


# ── POST /api/scan/ip ──────────────────────────────────────────────────────

def test_start_ip_scan(client, mock_celery):
    payload = {"target": "10.0.0.1", "ports": "22-80"}
    resp = client.post("/api/scan/ip", json=payload, headers=HEADERS)
    assert resp.status_code == 202
    data = resp.json()
    assert data["scan_type"] == "ip"
    assert data["target"] == "10.0.0.1"
    assert data["status"] == "pending"
    assert "id" in data


def test_start_ip_scan_missing_target(client):
    resp = client.post("/api/scan/ip", json={}, headers=HEADERS)
    assert resp.status_code == 422


# ── POST /api/scan/domain ──────────────────────────────────────────────────

def test_start_domain_scan(client, mock_celery):
    payload = {"domain": "example.com"}
    resp = client.post("/api/scan/domain", json=payload, headers=HEADERS)
    assert resp.status_code == 202
    data = resp.json()
    assert data["scan_type"] == "domain"
    assert data["target"] == "example.com"
    assert "id" in data


# ── POST /api/scan/mobile ──────────────────────────────────────────────────

def test_start_mobile_scan(client, mock_celery):
    url = "/api/scan/mobile"
    resp = client.post(
        url,
        files={"file": ("test.apk", b"fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["scan_type"] == "apk"
    assert "id" in data


def test_start_mobile_scan_invalid_platform(client):
    url = "/api/scan/mobile"
    resp = client.post(
        url,
        files={"file": ("test.apk", b"fake")},
        data={"platform": "windows"},
        headers=HEADERS,
    )
    assert resp.status_code == 400
    assert "platform" in resp.json()["detail"].lower()


# ── GET /api/scan/{id} ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_scan_detail_found(client, db_session, sample_user):
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

    resp = client.get(f"/api/scan/{job.id}", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(job.id)
    assert data["scan_type"] == "domain"
    assert data["target"] == "example.com"
    assert data["status"] == "completed"


def test_get_scan_detail_not_found(client):
    resp = client.get(f"/api/scan/{uuid.uuid4()}", headers=HEADERS)
    assert resp.status_code == 404


# ── GET /api/scan/{id}/findings ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_scan_findings(client, db_session, sample_user):
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
    await db_session.refresh(job)

    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=job.id,
        severity="medium",
        category="Web",
        title="Open port 80",
        description="HTTP port found",
    )
    db_session.add(finding)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/findings", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Open port 80"
    assert data[0]["severity"] == "medium"


# ── GET /api/scan/history ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_invalid_format(client, db_session, sample_user):
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
    resp = client.get(f"/api/scan/{job.id}/export?format=pdf", headers=HEADERS)
    assert resp.status_code == 400
    assert "format" in resp.json()["detail"].lower()


# ── GET /health ────────────────────────────────────────────────────────────

def test_health_endpoint(client):
    resp = client.get("/health")
    # In test environment, DB (PostgreSQL) and Redis are not available,
    # so the endpoint returns 503 with degraded status
    assert resp.status_code in (200, 503)
    data = resp.json()
    assert "status" in data
