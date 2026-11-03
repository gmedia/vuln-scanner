"""Append-only audit trail for SKU tier configuration and price changes.

``sku_code`` is deliberately **not** a foreign key: deleting an unused tier must
not erase the record of what it once was. Rows are written by
``SkuTierService`` (tier mutations) and ``InvoiceService.update_catalog``
(price-only edits), each in the same transaction as the mutation itself.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SKU_TIER_HISTORY_ACTIONS = (
    "created",
    "updated",
    "deactivated",
    "reactivated",
    "deleted",
    "price_updated",
)

_ACTION_CHECK = "action IN (" + ", ".join(f"'{action}'" for action in SKU_TIER_HISTORY_ACTIONS) + ")"

class SkuTierHistory(Base):
    __tablename__ = "sku_tier_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku_code: Mapped[str] = mapped_column(String(20), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    changes: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        CheckConstraint(_ACTION_CHECK, name="ck_sku_tier_history_action"),
        Index("ix_sku_tier_history_sku_created", "sku_code", "created_at"),
    )
