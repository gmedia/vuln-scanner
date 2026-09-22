import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

EMAIL_SEND_KINDS = (
    "verification",
    "password_reset",
    "scan_diff",
    "uptime",
    "host_protect",
    "host_waf",
    "invite",
)
EMAIL_SEND_STATUSES = ("sent", "failed", "bounced", "complained")
INBOX_KINDS = ("scan_diff", "uptime", "host_protect", "host_waf")


class EmailSendLog(Base):
    __tablename__ = "email_send_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    recipient_masked: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scan_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False, default="smtp")
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    bounce_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    bounce_subtype: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bounced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('verification', 'password_reset', 'scan_diff', 'uptime', 'host_protect', 'host_waf', 'invite')",
            name="ck_email_send_log_kind",
        ),
        CheckConstraint(
            "status IN ('sent', 'failed', 'bounced', 'complained')",
            name="ck_email_send_log_status",
        ),
    )


class EmailBounceEvent(Base):
    __tablename__ = "email_bounce_events"

    sns_message_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    subtype: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recipient_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    raw: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )


class EmailSuppression(Base):
    __tablename__ = "email_suppressions"

    recipient_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
