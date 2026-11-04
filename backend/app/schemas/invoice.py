import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AdminOrgItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    sku: str
    kind: str


class AdminOrgListResponse(BaseModel):
    items: list[AdminOrgItem]
    total: int


class SkuCatalogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product: str
    sku: str
    label: str
    active: bool
    list_idr: int
    seats: int
    invoicable: bool
    updated_at: datetime
    updated_by: uuid.UUID | None = None
    updated_by_email: str | None = None


class SkuCatalogListResponse(BaseModel):
    items: list[SkuCatalogItem]


class SkuPriceItem(BaseModel):
    service: str  # scan | host | uptime | guard
    sku: str  # any sku_tiers.code
    label: str
    active: bool
    list_idr: int
    invoicable: bool


class BundlePriceItem(BaseModel):
    tier: str  # any non-sales-led sku_tiers.code
    label: str
    active: bool
    bundle_idr: int
    alacarte_idr: int
    saving_idr: int
    saving_pct: float


class AnnualPolicy(BaseModel):
    months_paid: int
    months_served: int


class SkuPriceListResponse(BaseModel):
    items: list[SkuPriceItem]
    bundles: list[BundlePriceItem] = []
    annual: AnnualPolicy | None = None


class SkuCatalogUpdateRequest(BaseModel):
    list_idr: int = Field(..., ge=0)
    invoicable: bool | None = None


class InvoiceCreateRequest(BaseModel):
    organization_id: uuid.UUID
    # Admin endpoints must accept any tier code that exists in sku_tiers, not
    # an enumerated seed list; the service resolves the row (404) and applies
    # the active/grandfathered rule.
    sku: str = Field(..., pattern=r"^[a-z][a-z0-9_]{1,19}$")
    product: str = Field(default="scan", pattern=r"^(scan|host|uptime|guard)$")
    period_start: datetime | None = None
    due_date: datetime | None = None
    cycle: str = Field(default="monthly", pattern="^(monthly|annual)$")
    notes: str = Field(default="", max_length=500)


class InvoicePaidRequest(BaseModel):
    bank_ref: str | None = Field(default=None, max_length=64)


class InvoiceBankCopy(BaseModel):
    bank_name: str | None = None
    bank_account: str | None = None
    bank_holder: str | None = None


class InvoiceItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    number: str
    product: str
    sku: str
    seats: int
    amount_idr: int
    dpp_idr: int = 0
    ppn_idr: int = 0
    pph23_idr: int = 0
    total_idr: int = 0
    period_start: datetime
    period_end: datetime
    due_date: datetime
    sent_at: datetime | None = None
    status: str
    bank_ref: str | None = None
    notes: str = ""
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    organization_name: str | None = None
    bank: InvoiceBankCopy | None = None
    payment_status: str | None = None
    can_pay: bool = False


class InvoiceListResponse(BaseModel):
    items: list[InvoiceItem]
    total: int
