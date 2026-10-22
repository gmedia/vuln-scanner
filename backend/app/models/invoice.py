import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.asset import ASSET_SKU_LIMITS
from app.models.guard import GUARD_SKU_LIMITS
from app.models.host_protect import HOST_SITE_SKU_LIMITS
from app.models.uptime import UPTIME_SKU_LIMITS

INVOICE_PRODUCTS = ("scan", "host", "uptime", "guard")
INVOICE_SKUS = ("basic", "pro", "multi")
INVOICE_STATUSES = ("draft", "sent", "paid", "void")

# Included capacity per (product, sku). Mirrors sku_catalog.seats, which is seeded
# from these same constants and is not editable, so the two cannot drift.
PRODUCT_SEATS: dict[str, dict[str, int]] = {
    "scan": ASSET_SKU_LIMITS,
    "host": HOST_SITE_SKU_LIMITS,
    "uptime": UPTIME_SKU_LIMITS,
    "guard": GUARD_SKU_LIMITS,
}

SCAN_SKU_LIST_IDR: dict[str, int] = {"basic": 300_000, "pro": 650_000, "multi": 2_000_000}
HOST_SKU_LIST_IDR: dict[str, int] = {"basic": 150_000, "pro": 350_000, "multi": 900_000}
# Owner-locked 2026-10-12 (docs/commercial/pricing-architecture-v1.md §4).
# Uptime/Guard are priced à-la-carte lines, seeded into `sku_catalog` (migration
# add_uptime_guard_catalog) with invoicable=true; these constants remain as code
# defaults / fallbacks when a catalog row is missing.
UPTIME_SKU_LIST_IDR: dict[str, int] = {"basic": 75_000, "pro": 200_000, "multi": 500_000}
GUARD_SKU_LIST_IDR: dict[str, int] = {"basic": 100_000, "pro": 250_000, "multi": 600_000}
# Owner-locked 2026-10-12 (docs/commercial/pricing-architecture-v1.md §3, §5 P2).
# "Sinexis Secure" = one line covering all four attach products at the matching tier.
BUNDLE_LIST_IDR: dict[str, int] = {"basic": 450_000, "pro": 1_000_000, "multi": 2_900_000}
# Annual policy (P2, LOCKED): prepay 10 months, serve 12.
ANNUAL_MONTHS_PAID = 10
ANNUAL_MONTHS_SERVED = 12
SCAN_SKU_SEATS: dict[str, int] = {"basic": 1, "pro": 3, "multi": 10}


class SkuCatalog(Base):
    __tablename__ = "sku_catalog"

    product: Mapped[str] = mapped_column(String(20), primary_key=True)
    sku: Mapped[str] = mapped_column(String(20), primary_key=True)
    list_idr: Mapped[int] = mapped_column(Integer, nullable=False)
    seats: Mapped[int] = mapped_column(Integer, nullable=False)
    invoicable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint("product IN ('scan', 'host', 'uptime', 'guard')", name="ck_sku_catalog_product"),
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
        CheckConstraint("sku IN ('basic', 'pro', 'multi')", name="ck_org_invoices_sku"),
        CheckConstraint("status IN ('draft', 'sent', 'paid', 'void')", name="ck_org_invoices_status"),
        CheckConstraint("amount_idr >= 0", name="ck_org_invoices_amount"),
        UniqueConstraint("number", name="uq_org_invoices_number"),
        Index("ix_org_invoices_status_due_date", "status", "due_date"),
    )
