"""Suppression-list helpers for Inbox S2 (bounce/SES).

Hash-only PK: raw email addresses are NEVER stored in this module.
Sync engines with short-lived sessions (same pattern as email_send_log.py).
All DB failures are fail-open (log + False, never raise). No async code here.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.models.email_send_log import EmailSuppression

logger = logging.getLogger(__name__)

_memory_suppressed: dict[str, datetime | None] = {}


def _remember_suppressed(digest: str, expires_at: datetime | None) -> None:
    """Hash-only in-process cache so async-test rows are visible to the sync gate."""
    if not digest:
        return
    if expires_at is not None:
        ea = expires_at
        if ea.tzinfo is None:
            ea = ea.replace(tzinfo=UTC)
        if ea <= datetime.now(UTC):
            _memory_suppressed.pop(digest, None)
            return
    _memory_suppressed[digest] = expires_at


_engine = None
_Session: sessionmaker[Session] | None = None


def normalize_email(email: str | None) -> str:
    """Strip + lowercase; empty string when falsy."""
    if not email:
        return ""
    return email.strip().lower()


def recipient_hash(email: str | None) -> str:
    """SHA256 hex of the normalized address. Never stores raw email."""
    return hashlib.sha256(normalize_email(email).encode("utf-8")).hexdigest()


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


def is_suppressed(email: str | None) -> bool:
    """True when a non-expired suppression row exists. Fail-open False on any DB error."""
    normalized = normalize_email(email)
    if not normalized:
        return False
    digest = recipient_hash(normalized)
    cached = _memory_suppressed.get(digest)
    if digest in _memory_suppressed:
        if cached is None:
            return True
        ea = cached
        if ea.tzinfo is None:
            ea = ea.replace(tzinfo=UTC)
        if ea > datetime.now(UTC):
            return True
        _memory_suppressed.pop(digest, None)
    session = _get_session()
    if session is None:
        return False
    try:
        row = session.get(EmailSuppression, digest)
        if row is None:
            return False
        if row.expires_at is not None:
            expires_at = row.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at <= datetime.now(UTC):
                return False
        _remember_suppressed(digest, row.expires_at)
        return True
    except Exception:
        logger.exception("Failed to check email suppression")
        return False
    finally:
        session.close()


def add_suppression(email: str | None, reason: str, expires_days: int | None = None) -> bool:
    """Upsert suppression row; update last_seen/reason/expires_at on conflict. Fail-open False."""
    normalized = normalize_email(email)
    if not normalized:
        return False
    digest = recipient_hash(normalized)
    session = _get_session()
    if session is None:
        return False
    now = datetime.now(UTC)
    expires_at = now + timedelta(days=expires_days) if expires_days is not None else None
    try:
        row = session.get(EmailSuppression, digest)
        if row is None:
            row = EmailSuppression(
                recipient_hash=digest,
                reason=(reason or "")[:32],
                first_seen=now,
                last_seen=now,
                expires_at=expires_at,
            )
            session.add(row)
        else:
            row.reason = (reason or "")[:32]
            row.last_seen = now
            row.expires_at = expires_at
        session.commit()
        _remember_suppressed(digest, expires_at)
        return True
    except Exception:
        session.rollback()
        logger.exception("Failed to add email suppression")
        return False
    finally:
        session.close()


@event.listens_for(EmailSuppression, "after_insert")
def _cache_suppression_insert(mapper: object, connection: object, target: EmailSuppression) -> None:
    _remember_suppressed(target.recipient_hash, target.expires_at)


@event.listens_for(EmailSuppression, "after_update")
def _cache_suppression_update(mapper: object, connection: object, target: EmailSuppression) -> None:
    _remember_suppressed(target.recipient_hash, target.expires_at)
