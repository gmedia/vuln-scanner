"""Request/response schemas for promo codes.

Codes are case-insensitive at the edge but stored uppercase: the ``before``
validator normalizes before the regex runs, so a customer can type
``launch2026`` and still hit the canonical row.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.promo import PROMO_CODE_PATTERN
from app.schemas.sku_tier import TIER_CODE_PATTERN

PromoKind = Literal["percent", "fixed"]
PromoProduct = Literal["scan", "host", "uptime", "guard"]
PromoCycle = Literal["monthly", "annual"]

def _upper(value: Any) -> Any:
    return value.strip().upper() if isinstance(value, str) else value

class PromoCodeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., pattern=PROMO_CODE_PATTERN)
    description: str = Field(default="", max_length=200)
    kind: PromoKind
    percent_off_bp: int | None = Field(default=None, ge=1, le=10000)
    amount_idr: int | None = Field(default=None, gt=0)
    min_amount_idr: int = Field(default=0, ge=0)
    max_discount_idr: int | None = Field(default=None, gt=0)
    applies_to_sku: str | None = Field(default=None, pattern=TIER_CODE_PATTERN)
    applies_to_product: PromoProduct | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_redemptions: int | None = Field(default=None, ge=1)
    max_redemptions_per_org: int = Field(default=1, ge=1)

    _normalize_code = field_validator("code", mode="before")(_upper)

class PromoCodeUpdate(BaseModel):
    """Partial update. ``code`` and ``active`` are intentionally absent from
    normal edits: the code is always immutable and activation has its own
    audited endpoints. ``code`` is accepted only so the service can answer a
    change attempt with an explicit 409 instead of silently ignoring it.
    """

    model_config = ConfigDict(extra="forbid")

    code: str | None = Field(default=None, pattern=PROMO_CODE_PATTERN)
    description: str | None = Field(default=None, max_length=200)
    kind: PromoKind | None = None
    percent_off_bp: int | None = Field(default=None, ge=1, le=10000)
    amount_idr: int | None = Field(default=None, gt=0)
    min_amount_idr: int | None = Field(default=None, ge=0)
    max_discount_idr: int | None = Field(default=None, gt=0)
    applies_to_sku: str | None = Field(default=None, pattern=TIER_CODE_PATTERN)
    applies_to_product: PromoProduct | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_redemptions: int | None = Field(default=None, ge=1)
    max_redemptions_per_org: int | None = Field(default=None, ge=1)

    _normalize_code = field_validator("code", mode="before")(_upper)

class PromoCodeItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    description: str = ""
    kind: str
    percent_off_bp: int | None = None
    amount_idr: int | None = None
    min_amount_idr: int = 0
    max_discount_idr: int | None = None
    applies_to_sku: str | None = None
    applies_to_product: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    max_redemptions: int | None = None
    max_redemptions_per_org: int = 1
    active: bool = True
    created_by_user_id: uuid.UUID | None = None
    updated_by_user_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

class PromoCodeListResponse(BaseModel):
    items: list[PromoCodeItem]
    total: int
    page: int
    page_size: int

class PromoCodeHistoryItem(BaseModel):
    id: uuid.UUID
    promo_code_id: uuid.UUID
    action: str
    actor_email: str | None = None
    changes: dict[str, dict[str, Any]]
    created_at: datetime

class PromoCodeHistoryList(BaseModel):
    items: list[PromoCodeHistoryItem]
    total: int
    page: int
    page_size: int

class PromoRedemptionItem(BaseModel):
    id: uuid.UUID
    promo_code_id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str | None = None
    invoice_id: uuid.UUID
    invoice_number: str | None = None
    subscription_request_id: uuid.UUID | None = None
    code_snapshot: str
    discount_idr: int
    status: str
    created_at: datetime
    released_at: datetime | None = None

class PromoRedemptionList(BaseModel):
    items: list[PromoRedemptionItem]
    total: int
    page: int
    page_size: int

class PromoValidateRequest(BaseModel):
    organization_id: uuid.UUID
    code: str = Field(..., pattern=PROMO_CODE_PATTERN)
    product: PromoProduct = "scan"
    sku: str = Field(..., pattern=TIER_CODE_PATTERN)
    cycle: PromoCycle = "monthly"

    _normalize_code = field_validator("code", mode="before")(_upper)

class CustomerPromoValidateRequest(BaseModel):
    code: str = Field(..., pattern=PROMO_CODE_PATTERN)
    target_sku: str = Field(..., pattern=TIER_CODE_PATTERN)
    cycle: PromoCycle = "monthly"

    _normalize_code = field_validator("code", mode="before")(_upper)

class PromoValidateResponse(BaseModel):
    valid: bool = True
    description: str = ""
    discount_idr: int
    total_idr: int

__all__ = [
    "CustomerPromoValidateRequest",
    "PromoCodeCreate",
    "PromoCodeHistoryItem",
    "PromoCodeHistoryList",
    "PromoCodeItem",
    "PromoCodeListResponse",
    "PromoCodeUpdate",
    "PromoCycle",
    "PromoKind",
    "PromoProduct",
    "PromoRedemptionItem",
    "PromoRedemptionList",
    "PromoValidateRequest",
    "PromoValidateResponse",
]
