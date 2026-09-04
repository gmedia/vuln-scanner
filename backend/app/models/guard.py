import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.asset import ScanAsset
    from app.models.organization import Organization
    from app.models.user import User

AGENT_STATUSES = (
    "active",
    "disconnected",
    "pending",
    "never_connected",
    "unknown",
)


def wazuh_group_for_org(organization_id: uuid.UUID) -> str:
    return f"org_{organization_id.hex}"


class GuardOrgBinding(Base):
    __tablename__ = "guard_org_bindings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    wazuh_group: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_inventory_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_alert_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    organization: Mapped["Organization"] = relationship()


class GuardAgent(Base):
    __tablename__ = "guard_agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    wazuh_agent_id: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_keep_alive: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_helper_poll_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    results_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    results_token_revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scan_assets.id", ondelete="SET NULL"), nullable=True
    )
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    organization: Mapped["Organization"] = relationship()
    asset: Mapped["ScanAsset | None"] = relationship()

    __table_args__ = (
        UniqueConstraint("organization_id", "wazuh_agent_id", name="uq_guard_agent_org_wazuh"),
        CheckConstraint(f"status IN {AGENT_STATUSES}", name="ck_guard_agent_status"),
        Index(
            "uq_guard_agents_asset_id",
            "asset_id",
            unique=True,
            sqlite_where=text("asset_id IS NOT NULL"),
            postgresql_where=text("asset_id IS NOT NULL"),
        ),
    )


class GuardAlert(Base):
    __tablename__ = "guard_alerts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_id: Mapped[str] = mapped_column(String(128), nullable=False)
    rule_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    rule_level: Mapped[int] = mapped_column(Integer, nullable=False)
    rule_description: Mapped[str] = mapped_column(String(512), nullable=False)
    agent_wazuh_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (UniqueConstraint("organization_id", "external_id", name="uq_guard_alert_org_external"),)


class GuardEnrollToken(Base):
    __tablename__ = "guard_enroll_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    label: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_user_id])
