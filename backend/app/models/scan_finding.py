import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ScanFinding(Base):
    __tablename__ = "scan_findings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("scan_jobs.id", ondelete="CASCADE"), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cve_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    remediation: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    found_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("severity IN ('critical', 'high', 'medium', 'low', 'info')", name="ck_severity"),
    )
