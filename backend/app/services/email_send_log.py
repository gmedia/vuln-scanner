"""Persist outbound SMTP attempts. Failures here must never block sending."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models.email_send_log import EMAIL_SEND_KINDS, EmailSendLog

logger = logging.getLogger(__name__)

_LABEL_TO_KIND = {
    "Verification": "verification",
    "Password reset": "password_reset",
    "Scan diff": "scan_diff",
    "Uptime": "uptime",
    "Host Protect": "host_protect",
}

_engine = None
_Session: sessionmaker[Session] | None = None


def mask_recipient(email_to: str) -> str:
    raw = (email_to or "").strip()
    if "@" not in raw:
        return "***"
    local, _, domain = raw.partition("@")
    if not local or not domain:
        return "***"
    masked_local = "*" if len(local) == 1 else local[0] + "***"
    return f"{masked_local}@{domain.lower()}"


def kind_from_label(label: str) -> str:
    kind = _LABEL_TO_KIND.get(label, "verification")
    if kind not in EMAIL_SEND_KINDS:
        return "verification"
    return kind


def _get_session() -> Session | None:
    global _engine, _Session
    url = os.getenv("DATABASE_URL_SYNC", "")
    if not url:
        return None
    if _Session is None:
        _engine = create_engine(
            url,
            pool_size=2,
            max_overflow=4,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
        _Session = sessionmaker(bind=_engine)
    return _Session()


def record_email_send(
    *,
    label: str,
    email_to: str,
    ok: bool,
    attempts: int,
    error: str | None = None,
) -> None:
    session = _get_session()
    if session is None:
        return
    err = (error or "")[:500] or None
    try:
        row = EmailSendLog(
            id=uuid.uuid4(),
            kind=kind_from_label(label),
            status="sent" if ok else "failed",
            recipient_masked=mask_recipient(email_to),
            attempts=max(1, int(attempts)),
            error_message=None if ok else err,
            created_at=datetime.now(UTC),
        )
        session.add(row)
        session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to persist email send log")
    finally:
        session.close()
