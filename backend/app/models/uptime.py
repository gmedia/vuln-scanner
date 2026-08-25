import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.asset import ASSET_SKU_LIMITS

if TYPE_CHECKING:
    from app.models.asset import ScanAsset
    from app.models.organization import Organization
    from app.models.user import User

UPTIME_SKU_LIMITS = ASSET_SKU_LIMITS
MIN_INTERVAL_SECONDS = 60
MAX_INTERVAL_SECONDS = 900
DEFAULT_INTERVAL_SECONDS = 60
DEFAULT_TIMEOUT_SECONDS = 10
MAX_TIMEOUT_SECONDS = 30
CONFIRM_FAILS = 2
USER_AGENT = "SinexisUptime/1.0"


class UptimeMonitor(Base):
    __tablename__ = "uptime_monitors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scan_assets.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    check_type: Mapped[str] = mapped_column(String(10), nullable=False)
    target: Mapped[str] = mapped_column(Text, nullable=False)
    interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=DEFAULT_INTERVAL_SECONDS)
    timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=DEFAULT_TIMEOUT_SECONDS)
    expect_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    keyword: Mapped[str | None] = mapped_column(String(512), nullable=True)
    keyword_invert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    consecutive_fails: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_check_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notify_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_tls_warn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    organization: Mapped["Organization"] = relationship()
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by])
    asset: Mapped["ScanAsset | None"] = relationship()

    __table_args__ = (
        UniqueConstraint("asset_id", name="uq_uptime_monitors_asset_id"),
        CheckConstraint("check_type IN ('http', 'tcp')", name="ck_uptime_check_type"),
        CheckConstraint("state IN ('unknown', 'up', 'down', 'degraded')", name="ck_uptime_state"),
        CheckConstraint("interval_seconds >= 60 AND interval_seconds <= 900", name="ck_uptime_interval"),
        CheckConstraint("timeout_seconds >= 1 AND timeout_seconds <= 30", name="ck_uptime_timeout"),
    )


class UptimeSample(Base):
    __tablename__ = "uptime_samples"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uptime_monitors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class UptimeEvent(Base):
    __tablename__ = "uptime_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uptime_monitors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_state: Mapped[str] = mapped_column(String(16), nullable=False)
    to_state: Mapped[str] = mapped_column(String(16), nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    notified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
