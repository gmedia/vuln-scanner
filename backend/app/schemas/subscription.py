from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SubscriptionPlan(BaseModel):
    sku: str
    label: str
    status: str
    source: str
    cycle: str = "monthly"
    amount_idr: int | None = None
    period_start: datetime | None = None
    period_end: datetime | None = None
    renewal_at: datetime | None = None
    invoice_id: uuid.UUID | None = None
    invoice_number: str | None = None


class SubscriptionUsageItem(BaseModel):
    product: str
    used: int
    limit: int | None = None
    unit: str


class WorkspaceSeats(BaseModel):
    editors: int
    viewers: int
    editor_limit: int | None = None
    viewer_limit: int | None = None


class SubscriptionCatalogItem(BaseModel):
    service: str
    sku: str
    list_idr: int
    seats: int
    invoicable: bool


class SubscriptionBundleItem(BaseModel):
    tier: str
    bundle_idr: int
    alacarte_idr: int
    saving_idr: int
    saving_pct: float


class SubscriptionAnnualPolicy(BaseModel):
    months_paid: int
    months_served: int


class SubscriptionEnterpriseOffer(BaseModel):
    contact_only: bool = True


class SubscriptionCapabilities(BaseModel):
    can_manage: bool
    can_request_change: bool
    can_view_invoices: bool
    can_self_serve: bool = False


class SubscriptionRequestItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    direction: str
    current_sku: str
    target_sku: str
    cycle: str
    note: str = ""
    status: str
    resolution_note: str = ""
    created_at: datetime
    resolved_at: datetime | None = None
    requested_by_email: str | None = None
    organization_name: str | None = None


class SubscriptionOverviewResponse(BaseModel):
    organization_id: uuid.UUID
    organization_name: str
    plan: SubscriptionPlan
    usage: list[SubscriptionUsageItem]
    workspace_seats: WorkspaceSeats
    catalog: list[SubscriptionCatalogItem]
    bundles: list[SubscriptionBundleItem]
    annual: SubscriptionAnnualPolicy
    enterprise: SubscriptionEnterpriseOffer
    capabilities: SubscriptionCapabilities
    pending_request: SubscriptionRequestItem | None = None


class SubscriptionRequestCreate(BaseModel):
    target_sku: str = Field(..., pattern="^(basic|pro|multi)$")
    cycle: str = Field(default="monthly", pattern="^(monthly|annual)$")
    note: str = Field(default="", max_length=500)


class SubscriptionRequestListResponse(BaseModel):
    items: list[SubscriptionRequestItem]
    total: int


class SubscriptionRequestResolve(BaseModel):
    note: str = Field(default="", max_length=500)


__all__ = [
    "SubscriptionAnnualPolicy",
    "SubscriptionBundleItem",
    "SubscriptionCapabilities",
    "SubscriptionCatalogItem",
    "SubscriptionEnterpriseOffer",
    "SubscriptionOverviewResponse",
    "SubscriptionPlan",
    "SubscriptionRequestCreate",
    "SubscriptionRequestItem",
    "SubscriptionRequestListResponse",
    "SubscriptionRequestResolve",
    "SubscriptionUsageItem",
    "WorkspaceSeats",
]
