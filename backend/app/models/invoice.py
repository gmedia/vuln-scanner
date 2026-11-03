import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

INVOICE_PRODUCTS = ("scan", "host", "uptime", "guard")
INVOICE_STATUSES = ("draft", "sent", "paid", "void")

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
    seats: Mapped[int] = mapped_column(Integer, nullable=False)
    invoicable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint("product IN ('scan', 'host', 'uptime', 'guard')", name="ck_sku_catalog_product"),
        CheckConstraint("list_idr >= 0", name="ck_sku_catalog_list_idr"),
        CheckConstraint("seats >= 1", name="ck_sku_catalog_seats"),
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
    amount_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    dpp_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ppn_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pph23_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_idr: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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
        UniqueConstraint("number", name="uq_org_invoices_number"),
        Index("ix_org_invoices_status_due_date", "status", "due_date"),
    )
