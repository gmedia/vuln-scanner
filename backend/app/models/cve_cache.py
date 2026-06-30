from datetime import UTC, datetime

from sqlalchemy import Date, DateTime, Float, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CveCache(Base):
    __tablename__ = "cve_cache"

    cve_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    severity: Mapped[str | None] = mapped_column(String(10), nullable=True)
    published_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    raw_json: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)
    cached_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
