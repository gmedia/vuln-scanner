from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import email as email_module
from app.services.email import send_scan_diff_email
from app.services.scan_notify import (
    build_notify_context,
    resolve_notify_email,
    should_send_diff_alert,
)


def test_should_send_when_new_critical():
    assert should_send_diff_alert(1, 0) is True


def test_should_send_when_new_high():
    assert should_send_diff_alert(0, 2) is True


def test_should_not_send_when_zero():
    assert should_send_diff_alert(0, 0) is False


def test_should_send_initial_report_without_baseline():
    assert should_send_diff_alert(0, 0, initial_report=True, has_baseline=False) is True


def test_should_not_send_initial_report_with_baseline_zero():
    assert should_send_diff_alert(0, 0, initial_report=True, has_baseline=True) is False


@pytest.mark.asyncio
async def test_send_scan_diff_email_subject_and_link(monkeypatch):
    monkeypatch.setattr(email_module, "FRONTEND_URL", "https://example.test")
    monkeypatch.setattr(email_module, "SMTP_FROM", "Scan <scan@example.test>")

    mock_smtp = AsyncMock()
    mock_smtp.connect = AsyncMock()
    mock_smtp.send_message = AsyncMock()
    mock_smtp.quit = AsyncMock()

    with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
        ok = await send_scan_diff_email(
            "owner@example.com",
            target="example.com",
            job_id="job-abc",
            new_critical=1,
            new_high=2,
            resolved=0,
            worsened=1,
        )

    assert ok is True
    sent = mock_smtp.send_message.call_args[0][0]
    assert sent["To"] == "owner@example.com"
    assert sent["From"] == "Scan <scan@example.test>"
    assert sent["Subject"] == "[Sinexis Scan] 3 temuan baru critical/high — example.com"
    payload = sent.get_payload()
    body = payload[0].get_payload(decode=True).decode("utf-8")
    assert "https://example.test/scan/job-abc" in body
    assert "Critical baru" in body


@pytest.mark.asyncio
async def test_send_scan_diff_email_smtp_failure_returns_false(monkeypatch):
    from aiosmtplib.errors import SMTPException

    mock_smtp = AsyncMock()
    mock_smtp.connect = AsyncMock(side_effect=SMTPException("down"))
    with (
        patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp),
        patch("app.services.email.asyncio.sleep", new_callable=AsyncMock),
    ):
        ok = await send_scan_diff_email(
            "a@b.c",
            target="t",
            job_id="j",
            new_critical=1,
            new_high=0,
        )
    assert ok is False


def test_resolve_notify_email_prefers_schedule():
    job = MagicMock()
    job.id = uuid.uuid4()
    job.user_id = uuid.uuid4()

    sched = MagicMock()
    sched.notify_email = "sched@example.com"

    session = MagicMock()
    session.execute.return_value.scalar_one_or_none.return_value = sched
    assert resolve_notify_email(session, job) == "sched@example.com"


def test_resolve_notify_email_falls_back_to_user():
    job = MagicMock()
    job.id = uuid.uuid4()
    job.user_id = uuid.uuid4()

    user = MagicMock()
    user.email = "user@example.com"

    session = MagicMock()
    # first call: no schedule; second: user
    session.execute.return_value.scalar_one_or_none.side_effect = [None, user]
    assert resolve_notify_email(session, job) == "user@example.com"


def test_build_notify_context_invalid_id():
    session = MagicMock()
    assert build_notify_context(session, "not-a-uuid") is None


@pytest.mark.asyncio
async def test_maybe_path_sends_only_on_new_high(monkeypatch):
    """SMTP double: mail sent iff new critical/high (DoD)."""
    from app.services.baseline_diff import DiffResult
    from app.services.scan_notify import NotifyDiffContext

    ctx = NotifyDiffContext(
        job_id=str(uuid.uuid4()),
        target="t.example",
        scan_type="domain",
        email_to="owner@example.com",
        diff=DiffResult(
            new_critical=0,
            new_high=1,
            resolved=0,
            worsened=0,
            unchanged=2,
            new_finding_ids=["a"],
            resolved_finding_ids=[],
        ),
        has_baseline=True,
        schedule_id=None,
    )
    assert should_send_diff_alert(ctx.diff.new_critical, ctx.diff.new_high) is True

    zero = NotifyDiffContext(
        job_id=ctx.job_id,
        target=ctx.target,
        scan_type=ctx.scan_type,
        email_to=ctx.email_to,
        diff=DiffResult(0, 0, 1, 0, 3, [], ["x"]),
        has_baseline=True,
        schedule_id=None,
    )
    assert should_send_diff_alert(zero.diff.new_critical, zero.diff.new_high) is False

    mock_smtp = AsyncMock()
    mock_smtp.connect = AsyncMock()
    mock_smtp.send_message = AsyncMock()
    mock_smtp.quit = AsyncMock()
    with patch("app.services.email.aiosmtplib.SMTP", return_value=mock_smtp):
        sent = await send_scan_diff_email(
            ctx.email_to,
            target=ctx.target,
            job_id=ctx.job_id,
            new_critical=ctx.diff.new_critical,
            new_high=ctx.diff.new_high,
        )
    assert sent is True
    mock_smtp.send_message.assert_awaited_once()
