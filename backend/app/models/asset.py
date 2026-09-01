import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.scan_schedule import ScanSchedule
    from app.models.user import User

ORG_SKUS = ("basic", "pro", "multi")
ASSET_SKU_LIMITS: dict[str, int] = {"basic": 1, "pro": 3, "multi": 10}


class ScanAsset(Base):
    __tablename__ = "scan_assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scan_type: Mapped[str] = mapped_column(String(10), nullable=False)
    target: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    organization: Mapped["Organization"] = relationship()
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by])
    schedule: Mapped["ScanSchedule | None"] = relationship(back_populates="asset", uselist=False)

    __table_args__ = (
        UniqueConstraint("organization_id", "scan_type", "target", name="uq_scan_assets_org_type_target"),
        CheckConstraint("scan_type IN ('ip', 'domain')", name="ck_scan_asset_scan_type"),
    )
