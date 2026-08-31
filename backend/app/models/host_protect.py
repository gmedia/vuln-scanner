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

if TYPE_CHECKING:
    from app.models.asset import ScanAsset
    from app.models.guard import GuardAgent
    from app.models.organization import Organization
    from app.models.user import User

HOST_SITE_SKU_LIMITS: dict[str, int] = {"basic": 1, "pro": 3, "multi": 10}

CMS_HINTS = ("wordpress", "laravel", "unknown")
SCAN_STATUSES = ("queued", "running", "completed", "failed")
SCAN_TRIGGERS = ("schedule", "manual")
HIT_CLASSES = ("webshell", "backdoor", "malware", "spam_seo", "suspicious")
HIT_ENGINES = ("yara", "clam", "mock", "needles")
HIT_STATUSES = ("open", "quarantined", "ignored", "restored")
QUARANTINE_ACTIONS = ("quarantine", "restore")


class HostSite(Base):
    __tablename__ = "host_sites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    guard_agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("guard_agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scan_assets.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    root_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    cms_hint: Mapped[str | None] = mapped_column(String(32), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    auto_quarantine: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    organization: Mapped["Organization"] = relationship()
    guard_agent: Mapped["GuardAgent"] = relationship()
    asset: Mapped["ScanAsset | None"] = relationship()
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by])

    __table_args__ = (
        UniqueConstraint("organization_id", "guard_agent_id", "root_path", name="uq_host_sites_org_agent_path"),
        CheckConstraint("cms_hint IS NULL OR cms_hint IN ('wordpress', 'laravel', 'unknown')", name="ck_host_site_cms"),
    )


class HostScan(Base):
    __tablename__ = "host_scans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    trigger: Mapped[str] = mapped_column(String(16), nullable=False, default="manual")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (
        CheckConstraint(f"status IN {SCAN_STATUSES}", name="ck_host_scan_status"),
        CheckConstraint(f"trigger IN {SCAN_TRIGGERS}", name="ck_host_scan_trigger"),
    )


class HostHit(Base):
    __tablename__ = "host_hits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_scans.id", ondelete="SET NULL"), nullable=True
    )
    rel_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    hit_class: Mapped[str] = mapped_column("class", String(32), nullable=False)
    engine: Mapped[str] = mapped_column(String(16), nullable=False)
    rule_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (
        CheckConstraint(f"class IN {HIT_CLASSES}", name="ck_host_hit_class"),
        CheckConstraint(f"engine IN {HIT_ENGINES}", name="ck_host_hit_engine"),
        CheckConstraint(f"status IN {HIT_STATUSES}", name="ck_host_hit_status"),
    )


class HostQuarantineEvent(Base):
    __tablename__ = "host_quarantine_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("host_hits.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    dest_basename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (CheckConstraint(f"action IN {QUARANTINE_ACTIONS}", name="ck_host_quarantine_action"),)
