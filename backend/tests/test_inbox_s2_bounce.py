"""Inbox S2 (bounce/SES) FAILING skeletons — red now, green after S2 waves.

B1-B3,B9-B11. Do NOT touch production code. Uses same fixtures/client
patterns as test_inbox.py + conftest.py.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.email_send_log import EmailSendLog
from app.models.user import User
from app.services.auth import get_current_user as _get_current_user

HEADERS = {"X-API-Key": settings.api_key}


@pytest.fixture
def inbox_auth_client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(_get_current_user, None)
    app.middleware_stack = None

    from fastapi.testclient import TestClient

    class _AuthClient(TestClient):
        def request(self, method, url, **kwargs):
            headers = dict(kwargs.get("headers") or {})
            if "x-api-key" not in {k.lower() for k in headers}:
                headers["X-API-Key"] = settings.api_key
            kwargs["headers"] = headers
            return super().request(method, url, **kwargs)

    with _AuthClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_b1_bounced_filter_returns_only_mine(client, db_session, sample_user, sample_job):
    """B1: seed bounced row for me + sent for other user."""
    other = User(
        id=uuid.uuid4(),
        email="other-s2@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=0,
    )
    db_session.add(other)
    await db_session.flush()
    mine = EmailSendLog(
        id=uuid.uuid4(),
        kind="scan_diff",
        status="bounced",
        recipient_masked="t***@example.com",
        user_id=sample_user.id,
        job_id=sample_job.id,
        attempts=1,
        provider="ses",
        provider_message_id="ses-msg-b1-mine",
        created_at=datetime.now(UTC),
    )
    theirs = EmailSendLog(
        id=uuid.uuid4(),
        kind="scan_diff",
        status="sent",
        recipient_masked="o***@example.com",
        user_id=other.id,
        attempts=1,
        provider="smtp",
        created_at=datetime.now(UTC),
    )
    db_session.add_all([mine, theirs])
    await db_session.commit()

    resp = client.get("/api/inbox?status=bounced", headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["id"] == str(mine.id)
    assert item["status"] == "bounced"
    assert "error_message" not in item
    assert "o***@example.com" not in str(body)


def test_b2_rejects_delivered_status_and_verification_kind(client):
    """B2: ?status=delivered -> 400 and ?kind=verification -> 400."""
    r1 = client.get("/api/inbox?status=delivered", headers=HEADERS)
    assert r1.status_code == 400
    r2 = client.get("/api/inbox?kind=verification", headers=HEADERS)
    assert r2.status_code == 400


def test_b3_anon_inbox_returns_401(inbox_auth_client):
    """B3: anon GET /api/inbox -> 401."""
    resp = inbox_auth_client.get("/api/inbox")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_b9_suppressed_scan_diff_sends_nothing(db_session, sample_user):
    """B9: suppressed send_scan_diff_email makes zero SMTP/SES calls + record ok=False."""
    import hashlib

    from app.models.email_send_log import EmailSuppression

    suppressed_email = "suppressed-b9@example.com"
    digest = hashlib.sha256(suppressed_email.lower().encode()).hexdigest()
    db_session.add(
        EmailSuppression(
            recipient_hash=digest,
            reason="bounce",
            first_seen=datetime.now(UTC),
            last_seen=datetime.now(UTC),
            expires_at=None,
        )
    )
    await db_session.commit()

    mock_smtp = AsyncMock()
    mock_smtp.connect = AsyncMock()
    mock_smtp.send_message = AsyncMock()
    mock_smtp.quit = AsyncMock()
    with (
        patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp) as smtp_cls,
        patch("app.services.email.record_email_send") as rec,
    ):
        from app.services.email import send_scan_diff_email

        ok = await send_scan_diff_email(
            suppressed_email,
            target="example.com",
            job_id=str(uuid.uuid4()),
            new_critical=1,
            new_high=0,
            user_id=sample_user.id,
        )
    assert ok is False
    assert smtp_cls.call_count == 0
    assert mock_smtp.send_message.call_count == 0
    rec.assert_called_once()
    assert rec.call_args.kwargs["ok"] is False


@pytest.mark.asyncio
async def test_b10_admin_bounced_log_has_s2_fields(client, db_session, sample_user, sample_job):
    """B10: admin GET /email-logs?status=bounced includes user_id/job_id/provider_message_id."""
    row = EmailSendLog(
        id=uuid.uuid4(),
        kind="scan_diff",
        status="bounced",
        recipient_masked="t***@example.com",
        user_id=sample_user.id,
        job_id=sample_job.id,
        attempts=1,
        provider="ses",
        provider_message_id="ses-msg-b10",
        created_at=datetime.now(UTC),
    )
    db_session.add(row)
    await db_session.commit()

    resp = client.get("/api/admin/email-logs?status=bounced", headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    item = [i for i in body["items"] if i["id"] == str(row.id)][0]
    assert item["user_id"] == str(sample_user.id)
    assert item["job_id"] == str(sample_job.id)
    assert item["provider_message_id"] == "ses-msg-b10"


@pytest.mark.asyncio
async def test_b10_admin_logs_non_admin_forbidden(db_session):
    """B10 (authz): non-admin GET /api/admin/email-logs -> 403."""
    from app.services.auth import create_access_token, hash_password

    user = User(
        id=uuid.uuid4(),
        email="regular-s2@example.com",
        password_hash=hash_password("TestPass1"),
        is_verified=True,
        is_admin=False,
        credits=100,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    token = create_access_token(user_id=str(user.id), email=user.email, is_admin=False)

    async def override_get_db():
        yield db_session

    from app.services.auth import get_current_admin as _get_current_admin

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(_get_current_user, None)
    app.dependency_overrides.pop(_get_current_admin, None)
    app.middleware_stack = None
    try:
        from fastapi.testclient import TestClient

        with TestClient(app) as c:
            resp = c.get(
                "/api/admin/email-logs",
                headers={"X-API-Key": settings.api_key, "Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_b11_invoice_send_calls_no_send_email():
    """B11: invoice POST .../send still calls no send_*email."""
    from pathlib import Path

    text = Path(__file__).resolve().parents[1].joinpath("app/services/invoice.py").read_text(encoding="utf-8")
    assert "send_scan_diff_email" not in text
    assert "send_uptime_email" not in text
    assert "record_email_send" not in text
    assert "from app.services.email" not in text
    assert "ses_client" not in text.lower()
    assert "bounce" not in text.lower()
    assert "suppression" not in text.lower()
