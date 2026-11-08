import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

BILLING_STATUSES = ("incomplete", "active", "past_due", "canceled")
BILLING_CYCLES = ("monthly", "annual")
PAYMENT_ATTEMPT_STATUSES = ("pending", "succeeded", "failed", "expired", "refunded")
PAYMENT_EVENT_STATUSES = ("received", "processed", "ignored", "failed")
BILLING_REMINDER_STAGES = ("due_soon", "due_today", "overdue_1", "overdue_2", "final", "suspend_notice")
PAYABLE_KINDS = ("invoice", "topup")


class Subscription(Base):
    """Persisted subscription lifecycle for an organization.

    Phase 1 is manual/ops-driven: the invoice is still issued in-app and an
    admin records the payment. Provider ids are stored now so a gateway
    adapter can be added without another schema change.
    """

    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    sku: Mapped[str] = mapped_column(
        String(20), ForeignKey("sku_tiers.code", ondelete="RESTRICT"), nullable=False, default="basic", index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="incomplete")
    cycle: Mapped[str] = mapped_column(String(10), nullable=False, default="monthly")
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cancel_note: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    provider_subscription_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        CheckConstraint(f"status IN {BILLING_STATUSES}", name="ck_subscriptions_status"),
        CheckConstraint(f"cycle IN {BILLING_CYCLES}", name="ck_subscriptions_cycle"),
    )


class PaymentAttempt(Base):
    """One attempt to collect one invoice (or one subscription period)."""

    __tablename__ = "payment_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("org_invoices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    topup_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_topup_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    payable_kind: Mapped[str] = mapped_column(String(10), nullable=False, default="invoice", server_default="invoice")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    provider_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_order_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_token: Mapped[str | None] = mapped_column(String(512), nullable=True)
    checkout_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    attempt_seq: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    amount_idr: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="IDR")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    failure_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fee_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    refunded_amount_idr: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default=text("0"))
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    succeeded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        CheckConstraint(f"status IN {PAYMENT_ATTEMPT_STATUSES}", name="ck_payment_attempt_status"),
        CheckConstraint("amount_idr >= 0", name="ck_payment_attempt_amount"),
        CheckConstraint("fee_idr >= 0", name="ck_payment_attempt_fee"),
        CheckConstraint("refunded_amount_idr >= 0", name="ck_payment_attempt_refunded"),
        CheckConstraint(f"payable_kind IN {PAYABLE_KINDS}", name="ck_payment_attempt_payable_kind"),
        CheckConstraint(
            "payable_kind <> 'invoice' OR invoice_id IS NOT NULL",
            name="ck_payment_attempt_invoice_required",
        ),
        CheckConstraint(
            "payable_kind <> 'topup' OR topup_order_id IS NOT NULL",
            name="ck_payment_attempt_topup_required",
        ),
        CheckConstraint(
            "NOT (invoice_id IS NOT NULL AND topup_order_id IS NOT NULL)",
            name="ck_payment_attempt_payable_exclusive",
        ),
        Index(
            "uq_payment_attempt_provider_order",
            "provider",
            "provider_order_id",
            unique=True,
            postgresql_where=text("provider_order_id IS NOT NULL"),
            sqlite_where=text("provider_order_id IS NOT NULL"),
        ),
        Index(
            "uq_payment_attempt_pending_invoice",
            "invoice_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
        Index(
            "uq_payment_attempt_pending_topup",
            "topup_order_id",
            unique=True,
            postgresql_where=text("status = 'pending' AND topup_order_id IS NOT NULL"),
            sqlite_where=text("status = 'pending' AND topup_order_id IS NOT NULL"),
        ),
        # At most one settled manual payment per invoice. Two concurrent
        # "record payment" requests can both pass the invoice-state check; the
        # second insert now fails at the DB instead of double-booking revenue.
        Index(
            "uq_payment_attempt_manual_succeeded",
            "invoice_id",
            unique=True,
            postgresql_where=text("provider = 'manual' AND status = 'succeeded'"),
            sqlite_where=text("provider = 'manual' AND status = 'succeeded'"),
        ),
    )


class PaymentEvent(Base):
    """Inbound webhook event, deduplicated by (provider, event_id)."""

    __tablename__ = "payment_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="received")
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_payment_event_provider_event"),
        CheckConstraint(f"status IN {PAYMENT_EVENT_STATUSES}", name="ck_payment_event_status"),
        Index("ix_payment_events_received_at", "received_at"),
    )


class BillingReminder(Base):
    """One sent (or attempted) reminder stage per invoice.

    ``stage`` is idempotency: the unique key stops an hourly sweep from
    emailing the same stage twice. ``stage_rank`` lets the sweep skip stages
    that were overtaken while the worker was down.
    """

    __tablename__ = "billing_reminders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("org_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stage: Mapped[str] = mapped_column(String(32), nullable=False)
    stage_rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        UniqueConstraint("invoice_id", "stage", name="uq_billing_reminder_invoice_stage"),
        CheckConstraint(f"stage IN {BILLING_REMINDER_STAGES}", name="ck_billing_reminder_stage"),
    )


BILLING_RECIPIENT_KINDS = ("billing", "account")
PKP_STATUSES = ("unknown", "pkp", "non_pkp")


class OrgBillingProfile(Base):
    """Buyer identity and payment terms used on invoices and reminders.

    Kept separate from ``organizations`` so billing data can be edited by a
    billing role without granting product-admin rights.
    """

    __tablename__ = "org_billing_profiles"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    tax_id: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    nitku: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    address_line1: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    address_line2: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    city: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    province: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    postal_code: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="ID")
    billing_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    po_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    po_number: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    payment_terms_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pkp_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        CheckConstraint(f"pkp_status IN {PKP_STATUSES}", name="ck_billing_profile_pkp_status"),
        CheckConstraint(
            "payment_terms_days >= 0 AND payment_terms_days <= 180",
            name="ck_billing_profile_payment_terms",
        ),
    )


class BillingRecipient(Base):
    """Email-only billing contact. Does not grant product access."""

    __tablename__ = "billing_recipients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="billing")
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_billing_recipient_org_email"),
        CheckConstraint(f"kind IN {BILLING_RECIPIENT_KINDS}", name="ck_billing_recipient_kind"),
        Index(
            "uq_billing_recipient_primary",
            "organization_id",
            unique=True,
            postgresql_where=text("is_primary AND disabled_at IS NULL"),
            sqlite_where=text("is_primary AND disabled_at IS NULL"),
        ),
    )
