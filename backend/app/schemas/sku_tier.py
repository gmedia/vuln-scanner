"""API schemas for the read-only ``/api/sku-tiers`` surface."""

from __future__ import annotations

from pydantic import BaseModel

from app.models.sku_tier import SkuTier


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

__all__ = [
    "SkuTierFeatures",
    "SkuTierItem",
    "SkuTierLimits",
    "SkuTierWorkspaceLimits",
]
