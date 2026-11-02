import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    false,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SkuTier(Base):
    """First-class catalog tier: label, ranking, feature gates and caps.

    ``sku_catalog`` keeps pricing per ``(product, sku)``; this table owns the
    tier's commercial semantics. Product limits are never NULL (``>= 1``);
    only workspace seat limits may be NULL, which means unlimited.
    """

    __tablename__ = "sku_tiers"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    label: Mapped[str] = mapped_column(String(60), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    requestable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    sales_led: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    bundle_idr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    limit_scan: Mapped[int] = mapped_column(Integer, nullable=False)
    limit_host: Mapped[int] = mapped_column(Integer, nullable=False)
    limit_uptime: Mapped[int] = mapped_column(Integer, nullable=False)
    limit_guard: Mapped[int] = mapped_column(Integer, nullable=False)
    allow_status_page: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    allow_custom_host: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    allow_waf_protect: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    allow_siem: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    billing_unrestricted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    workspace_editor_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    workspace_viewer_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        # SQLite (the test harness) has no regex operator, so this CHECK is
        # emitted only on PostgreSQL. The Alembic migration defines it inline.
        CheckConstraint("code ~ '^[a-z][a-z0-9_]{1,19}$'", name="ck_sku_tiers_code").ddl_if(dialect="postgresql"),
        CheckConstraint("rank >= 1", name="ck_sku_tiers_rank"),
        CheckConstraint("bundle_idr IS NULL OR bundle_idr >= 0", name="ck_sku_tiers_bundle"),
        CheckConstraint(
            "limit_scan >= 1 AND limit_host >= 1 AND limit_uptime >= 1 AND limit_guard >= 1",
            name="ck_sku_tiers_limits",
        ),
        CheckConstraint(
            "(workspace_editor_limit IS NULL OR workspace_editor_limit >= 1) AND "
            "(workspace_viewer_limit IS NULL OR workspace_viewer_limit >= 1)",
            name="ck_sku_tiers_workspace",
        ),
        Index("uq_sku_tiers_rank", "rank", unique=True),
        Index(
            "uq_sku_tiers_default",
            "is_default",
            unique=True,
            postgresql_where=text("is_default"),
            sqlite_where=text("is_default"),
        ),
        Index("ix_sku_tiers_active", "active"),
    )
