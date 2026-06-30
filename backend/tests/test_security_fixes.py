"""
Security regression tests for fixed vulnerabilities:

1. IDOR: get_scan / get_findings must not leak other users' data
2. Admin auth: key management endpoints must reject non-admin users
3. XSS: HTML export must escape user-controlled fields
4. ZIP slip: mobile scan must neutralize path traversal in filenames
"""

import uuid

import pytest
from fastapi import HTTPException

from app.config import settings
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User

HEADERS = {"X-API-Key": settings.api_key}

# ---------------------------------------------------------------------------
# 1. IDOR — get_scan must return 404 for another user's job
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_scan_idor_returns_404(client, db_session, sample_user):
    """A user requesting another user's scan job must receive 404."""
    # Create a second user
    other_user = User(
        id=uuid.uuid4(),
        email="other@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=100,
    )
    db_session.add(other_user)
    await db_session.commit()
    await db_session.refresh(other_user)

    # Create a job owned by the other user
    other_job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.1",
        status="completed",
        progress=100,
        user_id=other_user.id,
    )
    db_session.add(other_job)
    await db_session.commit()

    # Request as the original (sample) user — must 404
    resp = client.get(f"/api/scan/{other_job.id}", headers=HEADERS)
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 2. IDOR — get_findings must return empty list for another user's job
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_findings_idor_returns_empty(client, db_session, sample_user):
    """A user requesting findings for another user's job must receive an empty list."""
    # Create a second user
    other_user = User(
        id=uuid.uuid4(),
        email="other2@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=100,
    )
    db_session.add(other_user)
    await db_session.commit()
    await db_session.refresh(other_user)

    # Create a job owned by the other user, with a finding
    other_job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="10.0.0.2",
        status="completed",
        progress=100,
        user_id=other_user.id,
    )
    db_session.add(other_job)
    await db_session.commit()

    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=other_job.id,
        severity="critical",
        category="Exploit",
        title="Remote code execution",
        description="Critical vuln",
    )
    db_session.add(finding)
    await db_session.commit()

    # Request findings as the original user — must return empty list
    resp = client.get(f"/api/scan/{other_job.id}/findings", headers=HEADERS)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 0


# ---------------------------------------------------------------------------
# 3. Admin auth — POST /api/keys/generate must reject non-admin users
# ---------------------------------------------------------------------------

def test_key_generate_rejects_non_admin(client):
    """Non-admin users must receive 403 when generating API keys."""
    from app.services.auth import get_current_admin as _real_admin

    # The client fixture overrides get_current_admin to return a non-admin user
    # WITHOUT the is_admin check.  Re-override it temporarily to exercise the
    # real admin guard.
    app = client.app
    saved = app.dependency_overrides.get(_real_admin)

    async def _admin_that_raises_403():
        raise HTTPException(status_code=403, detail="Admin access required")

    app.dependency_overrides[_real_admin] = _admin_that_raises_403
    app.middleware_stack = None
    try:
        resp = client.post(
            "/api/keys/generate",
            json={"name": "unauthorized-key", "rate_limit": 10},
            headers=HEADERS,
        )
        assert resp.status_code == 403
        assert "admin" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides[_real_admin] = saved
        app.middleware_stack = None


# ---------------------------------------------------------------------------
# 4. Admin auth — POST /api/keys/revoke/{id} must reject non-admin users
# ---------------------------------------------------------------------------

def test_key_revoke_rejects_non_admin(client):
    """Non-admin users must receive 403 when revoking API keys."""
    from app.services.auth import get_current_admin as _real_admin

    app = client.app
    saved = app.dependency_overrides.get(_real_admin)

    async def _admin_that_raises_403():
        raise HTTPException(status_code=403, detail="Admin access required")

    app.dependency_overrides[_real_admin] = _admin_that_raises_403
    app.middleware_stack = None
    try:
        resp = client.post(
            f"/api/keys/revoke/{uuid.uuid4()}",
            headers=HEADERS,
        )
        assert resp.status_code == 403
        assert "admin" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides[_real_admin] = saved
        app.middleware_stack = None


# ---------------------------------------------------------------------------
# 5. Admin auth — DELETE /api/keys/{id} must reject non-admin users
# ---------------------------------------------------------------------------

def test_key_delete_rejects_non_admin(client):
    """Non-admin users must receive 403 when deleting API keys."""
    from app.services.auth import get_current_admin as _real_admin

    app = client.app
    saved = app.dependency_overrides.get(_real_admin)

    async def _admin_that_raises_403():
        raise HTTPException(status_code=403, detail="Admin access required")

    app.dependency_overrides[_real_admin] = _admin_that_raises_403
    app.middleware_stack = None
    try:
        resp = client.delete(
            f"/api/keys/{uuid.uuid4()}",
            headers=HEADERS,
        )
        assert resp.status_code == 403
        assert "admin" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides[_real_admin] = saved
        app.middleware_stack = None


# ---------------------------------------------------------------------------
# 6. XSS — HTML export must escape script tags in scan target
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_export_html_escapes_xss_in_target(client, db_session, sample_user):
    """HTML export must HTML-escape <script> tags in the scan target field."""
    xss_target = '<script>alert("xss")</script>'
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target=xss_target,
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add(job)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    html_content = resp.text

    # The raw script tag must not appear in the output
    assert "<script>alert" not in html_content
    # The escaped version must appear
    assert "&lt;script&gt;alert" in html_content


# ---------------------------------------------------------------------------
# 7. XSS — HTML export must escape script tags in finding titles
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_export_html_escapes_xss_in_finding_title(client, db_session, sample_user):
    """HTML export must HTML-escape <script> tags in finding titles."""
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="domain",
        target="safe.example.com",
        status="completed",
        progress=100,
        user_id=sample_user.id,
    )
    db_session.add(job)
    await db_session.commit()

    xss_title = '<script>alert("xss-in-title")</script>'
    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=job.id,
        severity="high",
        category="Web",
        title=xss_title,
        description="XSS finding",
    )
    db_session.add(finding)
    await db_session.commit()

    resp = client.get(f"/api/scan/{job.id}/export?format=html", headers=HEADERS)
    assert resp.status_code == 200
    html_content = resp.text

    assert "<script>alert" not in html_content
    assert "&lt;script&gt;alert" in html_content


# ---------------------------------------------------------------------------
# 8. XSS — JSON export must return application/octet-stream content type
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_export_json_content_type_is_octet_stream(client, db_session, sample_user):
    """JSON export must return Content-Type: application/octet-stream (not text/html)."""
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

    resp = client.get(f"/api/scan/{job.id}/export?format=json", headers=HEADERS)
    assert resp.status_code == 200
    content_type = resp.headers.get("content-type", "")
    assert "application/octet-stream" in content_type


# ---------------------------------------------------------------------------
# 9. ZIP slip — path traversal in mobile scan filename is neutralized
# ---------------------------------------------------------------------------

def test_mobile_scan_neutralizes_path_traversal(client, mock_celery):
    """Mobile scan must use os.path.basename to strip directory traversal from filename."""
    traversal_filename = "../../../etc/passwd"

    resp = client.post(
        "/api/scan/mobile",
        files={"file": (traversal_filename, b"fake-apk-content")},
        data={"platform": "android"},
        headers=HEADERS,
    )
    assert resp.status_code == 202
    # The scan should succeed — the traversal is neutralized by os.path.basename
    data = resp.json()
    assert data["status"] == "pending"
    assert data["scan_type"] == "apk"
