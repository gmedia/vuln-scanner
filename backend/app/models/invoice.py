import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

INVOICE_PRODUCTS = ("scan", "host")
INVOICE_SKUS = ("basic", "pro", "multi")
INVOICE_STATUSES = ("draft", "sent", "paid", "void")

SCAN_SKU_LIST_IDR: dict[str, int] = {"basic": 300_000, "pro": 650_000, "multi": 2_000_000}
HOST_SKU_LIST_IDR: dict[str, int] = {"basic": 150_000, "pro": 350_000, "multi": 900_000}
SCAN_SKU_SEATS: dict[str, int] = {"basic": 1, "pro": 3, "multi": 10}


class SkuCatalog(Base):
    __tablename__ = "sku_catalog"

    product: Mapped[str] = mapped_column(String(20), primary_key=True)
    sku: Mapped[str] = mapped_column(String(20), primary_key=True)
    list_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    seats: Mapped[int] = mapped_column(Integer, nullable=False)
    invoicable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (
        CheckConstraint("product IN ('scan', 'host')", name="ck_sku_catalog_product"),
        CheckConstraint("sku IN ('basic', 'pro', 'multi')", name="ck_sku_catalog_sku"),
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
    sku: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
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
        CheckConstraint("product IN ('scan', 'host')", name="ck_org_invoices_product"),
        CheckConstraint("sku IN ('basic', 'pro', 'multi')", name="ck_org_invoices_sku"),
        CheckConstraint("status IN ('draft', 'sent', 'paid', 'void')", name="ck_org_invoices_status"),
        CheckConstraint("amount_idr >= 0", name="ck_org_invoices_amount"),
        UniqueConstraint("number", name="uq_org_invoices_number"),
    )
