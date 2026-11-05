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
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

INVOICE_PRODUCTS = ("scan", "host", "uptime", "guard")
INVOICE_STATUSES = ("draft", "sent", "paid", "void")

def _total_default(context: Any) -> int:
    """Derive the payable total when a caller does not supply one.

    The database enforces ``total_idr = amount_idr - discount_idr + ppn_idr``;
    this default keeps direct ORM fixtures (and legacy inserts) consistent with
    that invariant instead of failing on an implicit zero.
    """
    params = context.get_current_parameters()
    amount = int(params.get("amount_idr") or 0)
    discount = int(params.get("discount_idr") or 0)
    ppn = int(params.get("ppn_idr") or 0)
    return amount - discount + ppn

# Annual policy (P2, LOCKED): prepay 10 months, serve 12.
ANNUAL_MONTHS_PAID = 10
ANNUAL_MONTHS_SERVED = 12


class SkuCatalog(Base):
    __tablename__ = "sku_catalog"

    product: Mapped[str] = mapped_column(String(20), primary_key=True)
    sku: Mapped[str] = mapped_column(
        String(20), ForeignKey("sku_tiers.code", ondelete="CASCADE"), primary_key=True, index=True
    )
    list_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    invoicable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint("product IN ('scan', 'host', 'uptime', 'guard')", name="ck_sku_catalog_product"),
        CheckConstraint("list_idr >= 0", name="ck_sku_catalog_list_idr"),
    )


class OrgInvoice(Base):
    __tablename__ = "org_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    product: Mapped[str] = mapped_column(String(20), nullable=False, default="scan")
    sku: Mapped[str] = mapped_column(
        String(20), ForeignKey("sku_tiers.code", ondelete="RESTRICT"), nullable=False, index=True
    )
    subscription_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscription_requests.id", ondelete="SET NULL"),
        nullable=True,
    )
    amount_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    promo_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    dpp_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ppn_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pph23_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=_total_default)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    bank_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        CheckConstraint("product IN ('scan', 'host', 'uptime', 'guard')", name="ck_org_invoices_product"),
        CheckConstraint("status IN ('draft', 'sent', 'paid', 'void')", name="ck_org_invoices_status"),
        CheckConstraint("amount_idr >= 0", name="ck_org_invoices_amount"),
        CheckConstraint(
            "promo_code IS NULL OR promo_code = upper(promo_code)",
            name="ck_org_invoices_promo_code_upper",
        ),
        CheckConstraint(
            "discount_idr >= 0 AND discount_idr <= amount_idr",
            name="ck_org_invoices_discount",
        ),
        CheckConstraint(
            "total_idr = amount_idr - discount_idr + ppn_idr",
            name="ck_org_invoices_total",
        ),
        UniqueConstraint("number", name="uq_org_invoices_number"),
        Index("ix_org_invoices_status_due_date", "status", "due_date"),
        Index("ix_org_invoices_subscription_request_id", "subscription_request_id"),
        # A request backs at most one invoice row. Voiding clears the column,
        # so the predicate stays on the (stable) link column rather than on the
        # mutable ``status`` column; see the migration docstring.
        Index(
            "uq_org_invoices_subscription_request",
            "subscription_request_id",
            unique=True,
            postgresql_where=text("subscription_request_id IS NOT NULL"),
            sqlite_where=text("subscription_request_id IS NOT NULL"),
        ),
    )
