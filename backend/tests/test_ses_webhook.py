"""SES webhook S2 tests — B4-B8 against POST /api/webhooks/ses."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import pytest

from app.config import settings
from app.models.email_send_log import EmailSendLog

HEADERS = {"X-API-Key": settings.api_key}
SES_PATH = "/api/webhooks/ses"
TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:sinexis-bounces"


def _sns_envelope(*, message_id: str, topic_arn: str, inner: dict, msg_type: str = "Notification") -> dict:
    return {
        "Type": msg_type,
        "MessageId": message_id,
        "TopicArn": topic_arn,
        "Signature": "valid-signature-placeholder",
        "SigningCertURL": "https://sns.us-east-1.amazonaws.com/cert.pem",
        "Message": json.dumps(inner),
    }


def _bounce_inner(provider_message_id: str) -> dict:
    return {
        "notificationType": "Bounce",
        "bounce": {
            "bounceType": "Permanent",
            "bounceSubType": "General",
            "bouncedRecipients": [{"emailAddress": "bounced-b4@example.com"}],
        },
        "mail": {"messageId": provider_message_id},
    }


def _complaint_inner(provider_message_id: str) -> dict:
    return {
        "notificationType": "Complaint",
        "complaint": {
            "complainedRecipients": [{"emailAddress": "complaint-b7@example.com"}],
        },
        "mail": {"messageId": provider_message_id},
    }


@pytest.mark.asyncio
async def test_b4_bounce_transitions_sent_to_bounced(client, db_session, sample_user, sample_job):
    """B4: valid signed Bounce for known provider_message_id -> 202, sent->bounced."""
    provider_message_id = "ses-msg-b4"
    row = EmailSendLog(
        id=uuid.uuid4(),
        kind="scan_diff",
        status="sent",
        recipient_masked="b***@example.com",
        user_id=sample_user.id,
        job_id=sample_job.id,
        attempts=1,
        provider="ses",
        provider_message_id=provider_message_id,
        created_at=datetime.now(UTC),
    )
    db_session.add(row)
    await db_session.commit()

    envelope = _sns_envelope(
        message_id="sns-b4-1",
        topic_arn=TOPIC_ARN,
        inner=_bounce_inner(provider_message_id),
    )
    resp = client.post(SES_PATH, json=envelope, headers=HEADERS)
    assert resp.status_code == 202

    await db_session.refresh(row)
    assert row.status == "bounced"

    from app.models.email_send_log import EmailBounceEvent, EmailSuppression

    events = (await db_session.execute(EmailBounceEvent.__table__.select())).all()
    assert len(events) == 1
    suppressions = (await db_session.execute(EmailSuppression.__table__.select())).all()
    assert len(suppressions) == 1


@pytest.mark.asyncio
async def test_b5_replay_same_sns_message_id_is_duplicate(client, db_session, sample_user):
    """B5: replay same SNS MessageId -> 202 duplicate, single event row."""
    provider_message_id = "ses-msg-b5"
    row = EmailSendLog(
        id=uuid.uuid4(),
        kind="uptime",
        status="sent",
        recipient_masked="b***@example.com",
        user_id=sample_user.id,
        attempts=1,
        provider="ses",
        provider_message_id=provider_message_id,
        created_at=datetime.now(UTC),
    )
    db_session.add(row)
    await db_session.commit()

    envelope = _sns_envelope(
        message_id="sns-b5-1",
        topic_arn=TOPIC_ARN,
        inner=_bounce_inner(provider_message_id),
    )
    first = client.post(SES_PATH, json=envelope, headers=HEADERS)
    assert first.status_code == 202
    second = client.post(SES_PATH, json=envelope, headers=HEADERS)
    assert second.status_code == 202
    assert second.json().get("duplicate") is True

    from app.models.email_send_log import EmailBounceEvent

    events = (await db_session.execute(EmailBounceEvent.__table__.select())).all()
    assert len(events) == 1


def test_b6_rejects_bad_signature_wrong_arn_and_unknown_id_still_202(client):
    """B6: bad signature -> 403, wrong TopicArn -> 403, unknown id -> 202 event only."""
    bad_sig = _sns_envelope(
        message_id="sns-b6-badsig",
        topic_arn=TOPIC_ARN,
        inner=_bounce_inner("ses-msg-unknown"),
    )
    bad_sig["Signature"] = "tampered"
    r1 = client.post(SES_PATH, json=bad_sig, headers=HEADERS)
    assert r1.status_code == 403

    wrong_arn = _sns_envelope(
        message_id="sns-b6-arn",
        topic_arn="arn:aws:sns:us-east-1:999999999999:evil",
        inner=_bounce_inner("ses-msg-unknown"),
    )
    r2 = client.post(SES_PATH, json=wrong_arn, headers=HEADERS)
    assert r2.status_code == 403

    unknown = _sns_envelope(
        message_id="sns-b6-unknown",
        topic_arn=TOPIC_ARN,
        inner=_bounce_inner("ses-msg-no-such-row"),
    )
    r3 = client.post(SES_PATH, json=unknown, headers=HEADERS)
    assert r3.status_code == 202


@pytest.mark.asyncio
async def test_b7_complaint_marks_complained_with_no_expiry_suppression(client, db_session, sample_user):
    """B7: Complaint -> complained + suppression no-expiry."""
    provider_message_id = "ses-msg-b7"
    row = EmailSendLog(
        id=uuid.uuid4(),
        kind="scan_diff",
        status="sent",
        recipient_masked="c***@example.com",
        user_id=sample_user.id,
        attempts=1,
        provider="ses",
        provider_message_id=provider_message_id,
        created_at=datetime.now(UTC),
    )
    db_session.add(row)
    await db_session.commit()

    envelope = _sns_envelope(
        message_id="sns-b7-1",
        topic_arn=TOPIC_ARN,
        inner=_complaint_inner(provider_message_id),
    )
    resp = client.post(SES_PATH, json=envelope, headers=HEADERS)
    assert resp.status_code == 202

    await db_session.refresh(row)
    assert row.status == "complained"

    from app.models.email_send_log import EmailSuppression

    rows = (await db_session.execute(EmailSuppression.__table__.select())).all()
    assert len(rows) == 1
    assert rows[0].expires_at is None


def test_b8_subscription_confirmation_arn_check(client):
    """B8: SubscriptionConfirmation good TopicArn -> 200, bad -> 403."""
    good = _sns_envelope(
        message_id="sns-b8-good",
        topic_arn=TOPIC_ARN,
        inner={},
        msg_type="SubscriptionConfirmation",
    )
    good["SubscribeURL"] = "https://sns.us-east-1.amazonaws.com/confirm?token=abc"
    r1 = client.post(SES_PATH, json=good, headers=HEADERS)
    assert r1.status_code == 200

    bad = _sns_envelope(
        message_id="sns-b8-bad",
        topic_arn="arn:aws:sns:us-east-1:999999999999:evil",
        inner={},
        msg_type="SubscriptionConfirmation",
    )
    bad["SubscribeURL"] = "https://sns.us-east-1.amazonaws.com/confirm?token=evil"
    r2 = client.post(SES_PATH, json=bad, headers=HEADERS)
    assert r2.status_code == 403
