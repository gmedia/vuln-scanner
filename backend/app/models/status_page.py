import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.uptime import UptimeMonitor
    from app.models.user import User

STATUS_PAGE_PUBLISH_SKUS = frozenset({"pro", "multi"})
STATUS_PAGE_CUSTOM_HOST_SKUS = frozenset({"multi"})
RESERVED_HOST_SUFFIXES = (".sinexis.app",)
PLATFORM_HOSTS = frozenset(
    {
        "sinexis.app",
        "www.sinexis.app",
        "appmedia.id",
        "www.appmedia.id",
        "vs.appmedia.id",
        "www.vs.appmedia.id",
    }
)


class StatusPage(Base):
    __tablename__ = "status_pages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    custom_hostname: Mapped[str | None] = mapped_column(String(253), nullable=True)
    hostname_status: Mapped[str] = mapped_column(String(24), nullable=False, default="none")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    organization: Mapped["Organization"] = relationship()
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by])
    components: Mapped[list["StatusPageComponent"]] = relationship(back_populates="page", cascade="all, delete-orphan")
    incidents: Mapped[list["StatusIncident"]] = relationship(back_populates="page", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_status_pages_organization_id"),
        UniqueConstraint("slug", name="uq_status_pages_slug"),
        UniqueConstraint("custom_hostname", name="uq_status_pages_custom_hostname"),
        CheckConstraint(
            "hostname_status IN ('none', 'pending_dns', 'active', 'failed')",
            name="ck_status_pages_hostname_status",
        ),
    )


class StatusPageComponent(Base):
    __tablename__ = "status_page_components"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("status_pages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    monitor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uptime_monitors.id", ondelete="CASCADE"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    page: Mapped[StatusPage] = relationship(back_populates="components")
    monitor: Mapped["UptimeMonitor"] = relationship()

    __table_args__ = (UniqueConstraint("page_id", "monitor_id", name="uq_status_page_components_page_monitor"),)


class StatusIncident(Base):
    __tablename__ = "status_incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("status_pages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    impact: Mapped[str] = mapped_column(String(16), nullable=False, default="minor")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="investigating")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    page: Mapped[StatusPage] = relationship(back_populates="incidents")
    updates: Mapped[list["StatusIncidentUpdate"]] = relationship(
        back_populates="incident", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("impact IN ('none', 'minor', 'major', 'critical')", name="ck_status_incidents_impact"),
        CheckConstraint(
            "status IN ('investigating', 'identified', 'monitoring', 'resolved')",
            name="ck_status_incidents_status",
        ),
    )


class StatusIncidentUpdate(Base):
    __tablename__ = "status_incident_updates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("status_incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    incident: Mapped[StatusIncident] = relationship(back_populates="updates")
