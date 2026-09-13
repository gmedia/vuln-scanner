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
    list_idr: int
    seats: int
    invoicable: bool
    updated_at: datetime


class SkuCatalogListResponse(BaseModel):
    items: list[SkuCatalogItem]


class SkuCatalogUpdateRequest(BaseModel):
    list_idr: int = Field(..., ge=0)


class InvoiceCreateRequest(BaseModel):
    organization_id: uuid.UUID
    sku: str = Field(..., pattern=r"^(basic|pro|multi)$")
    period_start: datetime | None = None
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
    amount_idr: int
    period_start: datetime
    period_end: datetime
    status: str
    bank_ref: str | None = None
    notes: str = ""
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    organization_name: str | None = None
    bank: InvoiceBankCopy | None = None


class InvoiceListResponse(BaseModel):
    items: list[InvoiceItem]
    total: int
