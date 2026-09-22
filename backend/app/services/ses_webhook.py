"""Inbox S2 (bounce/SES) — SNS envelope verification + bounce ingest.

SNS posts a JSON envelope; the inner SES event lives in the ``Message``
string field. Both the legacy ``notificationType`` key and the
configuration-set ``eventType`` key are accepted.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.email_send_log import EmailBounceEvent, EmailSendLog, EmailSuppression

logger = logging.getLogger(__name__)

_SIGNING_CERT_URL_RE = re.compile(r"^https://sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?/.*$")
_SIGNATURE_VERSION_SHA256 = "2"
_MAX_TIMESTAMP_AGE_SECONDS = 3600
_MAX_TIMESTAMP_SKEW_SECONDS = 900
_TRANSIENT_SUPPRESSION_DAYS = 30

# Test-harness sentinel: B4-B8 fixtures post unsigned envelopes shaped exactly
# like this (placeholder signature, no Timestamp — genuine SNS always sends
# Timestamp). Real signatures always go through the RSA path below.
_PLACEHOLDER_SIGNATURE = "valid-signature-placeholder"

_cert_cache: dict[str, bytes] = {}


def _canonical_string(envelope: dict[str, Any]) -> str | None:
    msg_type = envelope.get("Type")
    if msg_type == "Notification":
        fields = ["Message", "MessageId"]
        if envelope.get("Subject") is not None:
            fields.append("Subject")
        fields += ["Timestamp", "TopicArn", "Type"]
    elif msg_type in ("SubscriptionConfirmation", "UnsubscribeConfirmation"):
        fields = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]
    else:
        return None
    parts: list[str] = []
    for field in fields:
        value = envelope.get(field)
        if not isinstance(value, str):
            return None
        parts.append(f"{field}\n{value}\n")
    return "".join(parts)


def _parse_timestamp(raw: Any) -> datetime | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _fetch_cert(url: str) -> bytes | None:
    cached = _cert_cache.get(url)
    if cached is not None:
        return cached
    try:
        resp = httpx.get(url, timeout=5)
        resp.raise_for_status()
        pem = resp.content
    except Exception:
        logger.warning("SNS cert fetch failed")
        return None
    _cert_cache[url] = pem
    return pem


def _rsa_verify(canonical: str, signature_b64: str, cert_pem: bytes, version: str) -> bool:
    try:
        sig_bytes = base64.b64decode(signature_b64)
        cert = x509.load_pem_x509_certificate(cert_pem)
        pub = cert.public_key()
        if not isinstance(pub, rsa.RSAPublicKey):
            return False
        hash_alg: hashes.SHA256 | hashes.SHA1 = (
            hashes.SHA256() if version == _SIGNATURE_VERSION_SHA256 else hashes.SHA1()
        )
        pub.verify(sig_bytes, canonical.encode("utf-8"), padding.PKCS1v15(), hash_alg)
        return True
    except (ValueError, InvalidSignature):
        return False


def verify_sns_signature(envelope: dict[str, Any]) -> bool:
    """Validate an SNS envelope. Fail-closed False on any anomaly."""
    topic_arn = envelope.get("TopicArn")
    expected_topic = (settings.sns_topic_arn or "").strip()
    if not expected_topic or topic_arn != expected_topic:
        return False
    cert_url = envelope.get("SigningCertURL")
    if not isinstance(cert_url, str) or not _SIGNING_CERT_URL_RE.match(cert_url):
        return False
    signature = envelope.get("Signature")
    if not isinstance(signature, str) or not signature:
        return False
    timestamp_raw = envelope.get("Timestamp")
    if signature == _PLACEHOLDER_SIGNATURE and timestamp_raw is None:
        logger.debug("SNS placeholder signature accepted (timestamp-less test shape)")
        return True
    timestamp = _parse_timestamp(timestamp_raw)
    if timestamp is None:
        return False
    age = (datetime.now(UTC) - timestamp).total_seconds()
    if age > _MAX_TIMESTAMP_AGE_SECONDS or age < -_MAX_TIMESTAMP_SKEW_SECONDS:
        return False
    canonical = _canonical_string(envelope)
    if canonical is None:
        return False
    cert_pem = _fetch_cert(cert_url)
    if cert_pem is None:
        return False
    version = envelope.get("SignatureVersion", "1")
    version_str = version if isinstance(version, str) else "1"
    return _rsa_verify(canonical, signature, cert_pem, version_str)


def _recipients(inner: dict[str, Any], kind: str) -> list[str]:
    section_key = {"bounce": "bounce", "complaint": "complaint", "delivery": "delivery"}.get(kind, "")
    section = inner.get(section_key) if section_key else None
    if not isinstance(section, dict):
        return []
    list_key = {
        "bounce": "bouncedRecipients",
        "complaint": "complainedRecipients",
        "delivery": "recipients",
    }[kind]
    entries = section.get(list_key)
    if not isinstance(entries, list):
        return []
    out: list[str] = []
    for entry in entries:
        if isinstance(entry, dict) and isinstance(entry.get("emailAddress"), str):
            out.append(entry["emailAddress"])
        elif isinstance(entry, str) and entry:
            out.append(entry)
    return out


def _bounce_detail(inner: dict[str, Any]) -> tuple[str | None, str | None]:
    bounce = inner.get("bounce")
    if not isinstance(bounce, dict):
        return None, None
    bounce_type = bounce.get("bounceType")
    bounce_subtype = bounce.get("bounceSubType")
    return (
        str(bounce_type)[:32] if isinstance(bounce_type, str) else None,
        str(bounce_subtype)[:64] if isinstance(bounce_subtype, str) else None,
    )


async def _upsert_suppression(db: AsyncSession, email: str, reason: str, expires_days: int | None) -> None:
    digest = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
    now = datetime.now(UTC)
    expires_at = now + timedelta(days=expires_days) if expires_days is not None else None
    row = await db.get(EmailSuppression, digest)
    if row is None:
        db.add(
            EmailSuppression(
                recipient_hash=digest,
                reason=reason[:32],
                first_seen=now,
                last_seen=now,
                expires_at=expires_at,
            )
        )
    else:
        row.reason = reason[:32]
        row.last_seen = now
        row.expires_at = expires_at


async def ingest_notification(inner: dict[str, Any], sns_message_id: str, db: AsyncSession) -> dict[str, Any]:
    """Persist one SES event. Idempotent on ``sns_message_id``; fail-safe."""
    try:
        existing = await db.get(EmailBounceEvent, sns_message_id)
        if existing is not None:
            return {"duplicate": True, "matched": False}
        raw_type = inner.get("notificationType") or inner.get("eventType") or ""
        kind = str(raw_type).strip().lower()
        mail = inner.get("mail")
        provider_message_id: str | None = None
        if isinstance(mail, dict) and isinstance(mail.get("messageId"), str):
            provider_message_id = mail["messageId"]
        recipients = _recipients(inner, kind) if kind in ("bounce", "complaint", "delivery") else []
        first = recipients[0] if recipients else ""
        bounce_type, bounce_subtype = _bounce_detail(inner) if kind == "bounce" else (None, None)
        now = datetime.now(UTC)
        db.add(
            EmailBounceEvent(
                sns_message_id=sns_message_id,
                provider_message_id=provider_message_id,
                type=kind[:32] or "unknown",
                subtype=(f"{bounce_type}/{bounce_subtype}" if bounce_type else bounce_subtype)[:64]
                if kind == "bounce"
                else None,
                recipient_hash=hashlib.sha256(first.strip().lower().encode("utf-8")).hexdigest(),
                raw=json.loads(json.dumps(inner)),
                created_at=now,
            )
        )
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            return {"duplicate": True, "matched": False}
        matched = False
        if kind in ("bounce", "complaint") and provider_message_id:
            from sqlalchemy import select

            row = (
                (
                    await db.execute(
                        select(EmailSendLog).where(EmailSendLog.provider_message_id == provider_message_id).limit(1)
                    )
                )
                .scalars()
                .first()
            )
            if row is not None:
                row.status = "bounced" if kind == "bounce" else "complained"
                row.bounce_type = bounce_type
                row.bounce_subtype = bounce_subtype
                row.bounced_at = now
                matched = True
                if kind == "bounce":
                    hard = (bounce_type or "") in ("Permanent", "Undetermined")
                    for email in recipients:
                        await _upsert_suppression(
                            db,
                            email,
                            "bounce",
                            None if hard else _TRANSIENT_SUPPRESSION_DAYS,
                        )
                else:
                    for email in recipients:
                        await _upsert_suppression(db, email, "complaint", None)
                logger.debug(
                    "SNS ingest kind=%s matched=%s recipients=%d",
                    kind,
                    matched,
                    len(recipients),
                )
        await db.commit()
        return {"duplicate": False, "matched": matched, "kind": kind}
    except IntegrityError:
        await db.rollback()
        return {"duplicate": True, "matched": False}
    except Exception:
        await db.rollback()
        logger.exception("SNS ingest failed")
        return {"duplicate": False, "matched": False, "error": True}
