from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

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


def test_inbox_unauthenticated_returns_401(inbox_auth_client):
    resp = inbox_auth_client.get("/api/inbox")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_inbox_lists_own_product_mail_only(client, db_session, sample_user, sample_job):
    other = User(
        id=uuid.uuid4(),
        email="other-inbox@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=0,
    )
    db_session.add(other)
    mine = EmailSendLog(
        id=uuid.uuid4(),
        kind="scan_diff",
        status="sent",
        recipient_masked="t***@example.com",
        user_id=sample_user.id,
        job_id=sample_job.id,
        attempts=1,
        created_at=datetime.now(UTC),
    )
    theirs = EmailSendLog(
        id=uuid.uuid4(),
        kind="scan_diff",
        status="sent",
        recipient_masked="o***@example.com",
        user_id=other.id,
        attempts=1,
        created_at=datetime.now(UTC),
    )
    auth = EmailSendLog(
        id=uuid.uuid4(),
        kind="verification",
        status="sent",
        recipient_masked="t***@example.com",
        user_id=sample_user.id,
        attempts=1,
        created_at=datetime.now(UTC),
    )
    orphan = EmailSendLog(
        id=uuid.uuid4(),
        kind="uptime",
        status="failed",
        recipient_masked="t***@example.com",
        user_id=None,
        attempts=3,
        error_message="SMTP timeout",
        created_at=datetime.now(UTC),
    )
    db_session.add_all([mine, theirs, auth, orphan])
    await db_session.commit()

    resp = client.get("/api/inbox", headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["id"] == str(mine.id)
    assert item["kind"] == "scan_diff"
    assert item["status"] == "sent"
    assert item["recipient_masked"] == "t***@example.com"
    assert item["job_id"] == str(sample_job.id)
    assert "error_message" not in item
    assert "o***@example.com" not in str(body)


@pytest.mark.asyncio
async def test_inbox_uptime_job_id_is_null(client, db_session, sample_user):
    row = EmailSendLog(
        id=uuid.uuid4(),
        kind="uptime",
        status="sent",
        recipient_masked="t***@example.com",
        user_id=sample_user.id,
        job_id=None,
        attempts=1,
        created_at=datetime.now(UTC),
    )
    db_session.add(row)
    await db_session.commit()

    resp = client.get("/api/inbox", headers=HEADERS)
    assert resp.status_code == 200
    item = resp.json()["items"][0]
    assert item["kind"] == "uptime"
    assert item["job_id"] is None
    assert "error_message" not in item


def test_inbox_rejects_auth_kind_filter(client):
    resp = client.get("/api/inbox?kind=verification", headers=HEADERS)
    assert resp.status_code == 400


def test_inbox_rejects_invite_kind_filter(client):
    resp = client.get("/api/inbox?kind=invite", headers=HEADERS)
    assert resp.status_code == 400


def test_admin_email_logs_unauthenticated_not_200(inbox_auth_client):
    resp = inbox_auth_client.get("/api/admin/email-logs")
    assert resp.status_code in (401, 403)


def test_invoice_service_has_no_smtp_send():
    text = Path(__file__).resolve().parents[1].joinpath("app/services/invoice.py").read_text(encoding="utf-8")
    assert "send_scan_diff_email" not in text
    assert "send_uptime_email" not in text
    assert "record_email_send" not in text
    assert "from app.services.email" not in text
