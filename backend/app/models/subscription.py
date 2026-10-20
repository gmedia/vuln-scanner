import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

SUBSCRIPTION_REQUEST_DIRECTIONS = ("upgrade", "downgrade")
SUBSCRIPTION_REQUEST_CYCLES = ("monthly", "annual")
SUBSCRIPTION_REQUEST_STATUSES = ("pending", "approved", "rejected", "canceled")
SUBSCRIPTION_REQUEST_CURRENT_SKUS = ("basic", "pro", "multi", "enterprise")
SUBSCRIPTION_REQUEST_TARGET_SKUS = ("basic", "pro", "multi")


class SubscriptionRequest(Base):
    """A customer's request to change the organization SKU.

    Phase 1 is request-only: ops still issues the invoice and platform admin
    sets ``organizations.sku``. This table records intent, not entitlement.
    """

    __tablename__ = "subscription_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    current_sku: Mapped[str] = mapped_column(String(20), nullable=False)
    target_sku: Mapped[str] = mapped_column(String(20), nullable=False)
    cycle: Mapped[str] = mapped_column(String(10), nullable=False, default="monthly")
    note: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    resolution_note: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    resolved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        CheckConstraint(f"direction IN {SUBSCRIPTION_REQUEST_DIRECTIONS}", name="ck_subscription_request_direction"),
        CheckConstraint(f"cycle IN {SUBSCRIPTION_REQUEST_CYCLES}", name="ck_subscription_request_cycle"),
        CheckConstraint(f"status IN {SUBSCRIPTION_REQUEST_STATUSES}", name="ck_subscription_request_status"),
        CheckConstraint(
            f"current_sku IN {SUBSCRIPTION_REQUEST_CURRENT_SKUS}",
            name="ck_subscription_request_current_sku",
        ),
        CheckConstraint(
            f"target_sku IN {SUBSCRIPTION_REQUEST_TARGET_SKUS}",
            name="ck_subscription_request_target_sku",
        ),
    )
