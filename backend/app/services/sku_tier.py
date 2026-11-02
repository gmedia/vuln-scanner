"""Read access to the ``sku_tiers`` table.

``sku_tiers`` is the runtime source of truth for tier labels, ranking, product
capacity caps, feature gates and workspace seat limits. The legacy constant
dicts in ``app/models/*`` are seed-only from PR A onward; no runtime read path
may fall back to them.

Unknown tiers are never silently mapped to the most generous tier: ``get``
raises 404 and callers that need an active tier use ``get_active`` (400 when
the tier exists but is retired). Grandfathered orgs may keep reading an
inactive tier, which is why the plain ``get`` path does not filter on ``active``.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sku_tier import SkuTier

_PRODUCT_ATTRIBUTES: dict[str, str] = {
    "scan": "limit_scan",
    "host": "limit_host",
    "uptime": "limit_uptime",
    "guard": "limit_guard",
}

@dataclass(frozen=True)
class SkuFeatures:
    """Feature gates for one tier, decoupled from the ORM row."""

    allow_status_page: bool
    allow_custom_host: bool
    allow_waf_protect: bool
    allow_siem: bool
    billing_unrestricted: bool
    sales_led: bool
    requestable: bool

    @classmethod
    def from_tier(cls, tier: SkuTier) -> SkuFeatures:
        return cls(
            allow_status_page=tier.allow_status_page,
            allow_custom_host=tier.allow_custom_host,
            allow_waf_protect=tier.allow_waf_protect,
            allow_siem=tier.allow_siem,
            billing_unrestricted=tier.billing_unrestricted,
            sales_led=tier.sales_led,
            requestable=tier.requestable,
        )

def _seat_word(limit: int | None, noun: str) -> str:
    if limit is None:
        return f"unlimited {noun}s"
    return f"{limit} {noun}" if limit == 1 else f"{limit} {noun}s"

def workspace_seat_cap_detail(label: str, editor_limit: int | None, viewer_limit: int | None) -> str:
    """User-facing seat-cap message built from the tier's actual limits."""
    return (
        f"{label} workspace allows {_seat_word(editor_limit, 'editor')} and "
        f"{_seat_word(viewer_limit, 'viewer')}. Upgrade for more seats."
    )

class SkuTierService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list(self, *, include_inactive: bool = False) -> list[SkuTier]:
        stmt = select(SkuTier).order_by(SkuTier.rank.asc())
        if not include_inactive:
            stmt = stmt.where(SkuTier.active.is_(True))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get(self, code: str) -> SkuTier:
        tier = await self.db.get(SkuTier, code)
        if tier is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown SKU tier '{code}'",
            )
        return tier

    async def get_active(self, code: str) -> SkuTier:
        tier = await self.get(code)
        if not tier.active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SKU tier '{tier.label}' is inactive",
            )
        return tier

    async def default(self) -> SkuTier:
        result = await self.db.execute(select(SkuTier).where(SkuTier.is_default.is_(True)).limit(1))
        tier = result.scalar_one_or_none()
        if tier is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No default SKU tier configured (sku_tiers.is_default)",
            )
        return tier

    async def limits(self, code: str) -> dict[str, int]:
        tier = await self.get(code)
        return {
            "scan": tier.limit_scan,
            "host": tier.limit_host,
            "uptime": tier.limit_uptime,
            "guard": tier.limit_guard,
        }

    async def product_limit(self, code: str, product: str) -> int:
        attribute = _PRODUCT_ATTRIBUTES.get(product)
        if attribute is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown product '{product}'")
        tier = await self.get(code)
        return int(getattr(tier, attribute))

    async def features(self, code: str) -> SkuFeatures:
        return SkuFeatures.from_tier(await self.get(code))

    async def workspace_limits(self, code: str) -> tuple[int | None, int | None]:
        tier = await self.get(code)
        return tier.workspace_editor_limit, tier.workspace_viewer_limit

    async def label(self, code: str) -> str:
        return (await self.get(code)).label

__all__ = ["SkuFeatures", "SkuTierService", "workspace_seat_cap_detail"]
