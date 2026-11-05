"""Promo codes: discount definitions, redemption ledger and audit history.

``PromoCode`` is a billing discount object. It is never a payment method and
never holds a balance. ``PromoRedemption`` is the usage ledger: one row per
discounted invoice, written in the same transaction as the invoice, released
(never deleted) when that invoice is voided. ``PromoCodeHistory`` mirrors
``sku_tier_history`` and deliberately has **no** foreign key on
``promo_code_id`` so deleting an unused code does not erase its audit trail.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    false,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

PROMO_CODE_PATTERN = r"^[A-Z0-9][A-Z0-9_-]{7,31}$"
PROMO_KINDS = ("percent", "fixed")
PROMO_REDEMPTION_STATUSES = ("applied", "released")
PROMO_HISTORY_ACTIONS = (
    "created",
    "updated",
    "deactivated",
    "reactivated",
    "deleted",
    "approved",
    "approval_reset",
)

_ACTION_CHECK = (
    "action IN (" + ", ".join(f"'{action}'" for action in PROMO_HISTORY_ACTIONS) + ")"
)

class PromoCode(Base):
    __tablename__ = "promo_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    percent_off_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_idr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_amount_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_discount_idr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    applies_to_sku: Mapped[str | None] = mapped_column(
        String(20),
        ForeignKey("sku_tiers.code", ondelete="RESTRICT"),
        nullable=True,
    )
    applies_to_product: Mapped[str | None] = mapped_column(String(20), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    max_redemptions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_redemptions_per_org: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    # Finance cap (promo-codes-v1 §1 PC9/P9): a code above 50% or IDR 5.000.000
    # is created inactive and needs a *second* platform admin to enable it.
    requires_approval: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        UniqueConstraint("code", name="uq_promo_codes_code"),
        CheckConstraint("code = upper(code)", name="ck_promo_codes_code_upper"),
        # SQLite (the test harness) has no regex operator, so this CHECK is
        # emitted only on PostgreSQL, matching ``sku_tiers.code``.
        CheckConstraint(
            f"code ~ '{PROMO_CODE_PATTERN}'", name="ck_promo_codes_code_pattern"
        ).ddl_if(dialect="postgresql"),
        CheckConstraint("kind IN ('percent', 'fixed')", name="ck_promo_codes_kind"),
        CheckConstraint(
            "percent_off_bp IS NULL OR (percent_off_bp >= 1 AND percent_off_bp <= 10000)",
            name="ck_promo_codes_percent",
        ),
        CheckConstraint(
            "amount_idr IS NULL OR amount_idr > 0", name="ck_promo_codes_amount"
        ),
        CheckConstraint(
            "(kind = 'percent' AND percent_off_bp IS NOT NULL AND amount_idr IS NULL) "
            "OR (kind = 'fixed' AND amount_idr IS NOT NULL AND percent_off_bp IS NULL)",
            name="ck_promo_codes_kind_value",
        ),
        CheckConstraint("min_amount_idr >= 0", name="ck_promo_codes_min_amount"),
        CheckConstraint(
            "max_discount_idr IS NULL OR max_discount_idr > 0",
            name="ck_promo_codes_max_discount",
        ),
        CheckConstraint(
            "applies_to_product IS NULL OR applies_to_product IN "
            "('scan', 'host', 'uptime', 'guard')",
            name="ck_promo_codes_product",
        ),
        CheckConstraint(
            "starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at",
            name="ck_promo_codes_window",
        ),
        CheckConstraint(
            "max_redemptions IS NULL OR max_redemptions >= 1",
            name="ck_promo_codes_max_redemptions",
        ),
        CheckConstraint(
            "max_redemptions_per_org >= 1",
            name="ck_promo_codes_max_redemptions_per_org",
        ),
        Index("ix_promo_codes_active", "active"),
    )

class PromoRedemption(Base):
    __tablename__ = "promo_redemptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    promo_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("promo_codes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("org_invoices.id", ondelete="CASCADE"),
        nullable=False,
    )
    subscription_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscription_requests.id", ondelete="SET NULL"),
        nullable=True,
    )
    code_snapshot: Mapped[str] = mapped_column(String(32), nullable=False)
    discount_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="applied"
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    released_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("invoice_id", name="uq_promo_redemptions_invoice"),
        CheckConstraint(
            "code_snapshot = upper(code_snapshot)",
            name="ck_promo_redemptions_code_upper",
        ),
        CheckConstraint("discount_idr > 0", name="ck_promo_redemptions_discount"),
        CheckConstraint(
            "status IN ('applied', 'released')", name="ck_promo_redemptions_status"
        ),
        CheckConstraint(
            "(status = 'released') = (released_at IS NOT NULL)",
            name="ck_promo_redemptions_released",
        ),
        Index(
            "ix_promo_redemptions_code_org_status",
            "promo_code_id",
            "organization_id",
            "status",
        ),
        Index("ix_promo_redemptions_org_created", "organization_id", "created_at"),
        Index(
            "uq_promo_redemption_request",
            "subscription_request_id",
            unique=True,
            postgresql_where=text("subscription_request_id IS NOT NULL"),
            sqlite_where=text("subscription_request_id IS NOT NULL"),
        ),
    )

class PromoCodeHistory(Base):
    __tablename__ = "promo_code_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    promo_code_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
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
        CheckConstraint(_ACTION_CHECK, name="ck_promo_code_history_action"),
        Index("ix_promo_code_history_code_created", "promo_code_id", "created_at"),
    )

__all__ = [
    "PROMO_CODE_PATTERN",
    "PROMO_HISTORY_ACTIONS",
    "PROMO_KINDS",
    "PROMO_REDEMPTION_STATUSES",
    "PromoCode",
    "PromoCodeHistory",
    "PromoRedemption",
]
