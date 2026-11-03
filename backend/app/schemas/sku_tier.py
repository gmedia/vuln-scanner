"""API schemas for ``/api/sku-tiers`` and the admin CRUD surface.

The public read schema is additive-only: ``usage``/``has_catalog`` are only
populated by the admin endpoints, so the consumer contract from PR B1 keeps its
shape. Mutation schemas keep the code regex because a tier code is a stable
identifier; they do not enumerate the seeded codes, so an admin can create a
new tier (for example ``pro_plus``) without a deploy.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.sku_tier import SkuTier

SkuProduct = Literal["scan", "host", "uptime", "guard"]

TIER_CODE_PATTERN = r"^[a-z][a-z0-9_]{1,19}$"


class SkuTierLimits(BaseModel):
    scan: int
    host: int
    uptime: int
    guard: int

    @classmethod
    def from_model(cls, tier: SkuTier) -> SkuTierLimits:
        return cls(
            scan=tier.limit_scan,
            host=tier.limit_host,
            uptime=tier.limit_uptime,
            guard=tier.limit_guard,
        )


class SkuTierFeatures(BaseModel):
    allow_status_page: bool
    allow_custom_host: bool
    allow_waf_protect: bool
    allow_siem: bool
    billing_unrestricted: bool
    sales_led: bool
    requestable: bool

    @classmethod
    def from_model(cls, tier: SkuTier) -> SkuTierFeatures:
        return cls(
            allow_status_page=tier.allow_status_page,
            allow_custom_host=tier.allow_custom_host,
            allow_waf_protect=tier.allow_waf_protect,
            allow_siem=tier.allow_siem,
            billing_unrestricted=tier.billing_unrestricted,
            sales_led=tier.sales_led,
            requestable=tier.requestable,
        )


class SkuTierWorkspaceLimits(BaseModel):
    """``None`` means unlimited seats in that dimension."""

    editor: int | None = None
    viewer: int | None = None

    @classmethod
    def from_model(cls, tier: SkuTier) -> SkuTierWorkspaceLimits:
        return cls(editor=tier.workspace_editor_limit, viewer=tier.workspace_viewer_limit)


class SkuUsage(BaseModel):
    """Reference counts that block a hard delete."""

    orgs: int = 0
    subscriptions: int = 0
    invoices: int = 0
    requests: int = 0


class SkuTierItem(BaseModel):
    code: str
    label: str
    rank: int
    active: bool
    requestable: bool
    sales_led: bool
    is_default: bool
    bundle_idr: int | None = None
    limits: SkuTierLimits
    features: SkuTierFeatures
    workspace_limits: SkuTierWorkspaceLimits
    # Admin-only additions; the consumer read path leaves them unset.
    usage: SkuUsage | None = None
    has_catalog: bool = False

    @classmethod
    def from_model(cls, tier: SkuTier) -> SkuTierItem:
        return cls(
            code=tier.code,
            label=tier.label,
            rank=tier.rank,
            active=tier.active,
            requestable=tier.requestable,
            sales_led=tier.sales_led,
            is_default=tier.is_default,
            bundle_idr=tier.bundle_idr,
            limits=SkuTierLimits.from_model(tier),
            features=SkuTierFeatures.from_model(tier),
            workspace_limits=SkuTierWorkspaceLimits.from_model(tier),
        )


class SkuTierHistoryItem(BaseModel):
    id: uuid.UUID
    sku_code: str
    action: str
    actor_email: str | None = None
    changes: dict[str, dict[str, Any]]
    created_at: datetime

class SkuTierHistoryList(BaseModel):
    items: list[SkuTierHistoryItem]
    total: int
    page: int
    page_size: int

class SkuCatalogPriceBody(BaseModel):
    list_idr: int = Field(..., ge=0)
    invoicable: bool


class _SkuTierFields(BaseModel):
    """Shared tier fields; create keeps them required, update makes them partial."""

    model_config = ConfigDict(extra="ignore")


class SkuTierCreate(_SkuTierFields):
    code: str = Field(..., pattern=TIER_CODE_PATTERN)
    label: str = Field(..., min_length=1, max_length=60)
    rank: int | None = Field(default=None, ge=1)
    active: bool = True
    requestable: bool = True
    sales_led: bool = False
    is_default: bool = False
    bundle_idr: int | None = Field(default=None, ge=0)
    limit_scan: int = Field(..., ge=1)
    limit_host: int = Field(..., ge=1)
    limit_uptime: int = Field(..., ge=1)
    limit_guard: int = Field(..., ge=1)
    allow_status_page: bool = False
    allow_custom_host: bool = False
    allow_waf_protect: bool = False
    allow_siem: bool = False
    billing_unrestricted: bool = False
    workspace_editor_limit: int | None = Field(default=None, ge=1)
    workspace_viewer_limit: int | None = Field(default=None, ge=1)
    prices: dict[SkuProduct, SkuCatalogPriceBody] | None = None


class SkuTierUpdate(_SkuTierFields):
    label: str | None = Field(default=None, min_length=1, max_length=60)
    rank: int | None = Field(default=None, ge=1)
    active: bool | None = None
    requestable: bool | None = None
    sales_led: bool | None = None
    is_default: bool | None = None
    bundle_idr: int | None = Field(default=None, ge=0)
    limit_scan: int | None = Field(default=None, ge=1)
    limit_host: int | None = Field(default=None, ge=1)
    limit_uptime: int | None = Field(default=None, ge=1)
    limit_guard: int | None = Field(default=None, ge=1)
    allow_status_page: bool | None = None
    allow_custom_host: bool | None = None
    allow_waf_protect: bool | None = None
    allow_siem: bool | None = None
    billing_unrestricted: bool | None = None
    workspace_editor_limit: int | None = Field(default=None, ge=1)
    workspace_viewer_limit: int | None = Field(default=None, ge=1)
    prices: dict[SkuProduct, SkuCatalogPriceBody] | None = None


__all__ = [
    "SkuCatalogPriceBody",
    "SkuProduct",
    "SkuTierCreate",
    "SkuTierFeatures",
    "SkuTierHistoryItem",
    "SkuTierHistoryList",
    "SkuTierItem",
    "SkuTierLimits",
    "SkuTierUpdate",
    "SkuTierWorkspaceLimits",
    "SkuUsage",
    "TIER_CODE_PATTERN",
]
