import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.scan_job import ScanJob
    from app.models.user import User


class ScanSchedule(Base):
    __tablename__ = "scan_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scan_type: Mapped[str] = mapped_column(String(10), nullable=False)
    target: Mapped[str] = mapped_column(Text, nullable=False)
    cadence: Mapped[str] = mapped_column(String(20), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Jakarta")
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_job_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("scan_jobs.id"), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notify_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user: Mapped["User"] = relationship(back_populates="scan_schedules")
    last_job: Mapped["ScanJob | None"] = relationship(foreign_keys=[last_job_id])

    __table_args__ = (
        CheckConstraint("scan_type IN ('ip', 'domain')", name="ck_schedule_scan_type"),
        CheckConstraint("cadence IN ('weekly', 'monthly')", name="ck_schedule_cadence"),
    )
