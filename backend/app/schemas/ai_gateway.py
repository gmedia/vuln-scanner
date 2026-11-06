from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator
from pydantic_core import PydanticCustomError


class AiProviderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    base_url: HttpUrl
    auth_header: str = Field(default="Authorization", max_length=64)
    credential: str = Field(..., min_length=1, max_length=4096)
    enabled: bool = True
    status: str = Field(default="ok", max_length=16)


class AiProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    base_url: HttpUrl | None = None
    auth_header: str | None = Field(default=None, max_length=64)
    credential: str | None = Field(default=None, min_length=1, max_length=4096)
    enabled: bool | None = None
    status: str | None = Field(default=None, max_length=16)


class AiProviderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    base_url: str
    auth_header: str
    credential_set: bool
    enabled: bool
    status: str
    last_probed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AiProviderList(BaseModel):
    items: list[AiProviderOut]
    total: int


class AiModelCreate(BaseModel):
    provider_id: uuid.UUID
    public_id: str = Field(..., min_length=3, max_length=128)
    upstream_id: str = Field(..., min_length=1, max_length=256)
    price_usd_per_1m_in: Decimal | None = Field(default=None, ge=0)
    price_usd_per_1m_out: Decimal | None = Field(default=None, ge=0)
    hpp_usd_per_1m_in: Decimal | None = Field(default=None, ge=0)
    hpp_usd_per_1m_out: Decimal | None = Field(default=None, ge=0)
    # Legacy integer fields: accepted for one release and converted to USD.
    hpp_usd_per_1k_in: int = Field(default=0, ge=0)
    hpp_usd_per_1k_out: int = Field(default=0, ge=0)
    price_idr_per_1k_in: int | None = Field(default=None, ge=0)
    price_idr_per_1k_out: int | None = Field(default=None, ge=0)
    max_ctx: int = Field(default=8192, ge=1)
    max_tokens_cap: int = Field(default=4096, ge=1)
    enabled: bool = True

    @model_validator(mode="after")
    def _require_price_pairs(self) -> AiModelCreate:
        if self.price_usd_per_1m_in is None and self.price_idr_per_1k_in is None:
            raise PydanticCustomError("ai_price_in_required", "price_usd_per_1m_in or price_idr_per_1k_in is required")
        if self.price_usd_per_1m_out is None and self.price_idr_per_1k_out is None:
            raise PydanticCustomError(
                "ai_price_out_required",
                "price_usd_per_1m_out or price_idr_per_1k_out is required",
            )
        return self


class AiModelUpdate(BaseModel):
    provider_id: uuid.UUID | None = None
    public_id: str | None = Field(default=None, min_length=3, max_length=128)
    upstream_id: str | None = Field(default=None, min_length=1, max_length=256)
    price_usd_per_1m_in: Decimal | None = Field(default=None, ge=0)
    price_usd_per_1m_out: Decimal | None = Field(default=None, ge=0)
    hpp_usd_per_1m_in: Decimal | None = Field(default=None, ge=0)
    hpp_usd_per_1m_out: Decimal | None = Field(default=None, ge=0)
    hpp_usd_per_1k_in: int | None = Field(default=None, ge=0)
    hpp_usd_per_1k_out: int | None = Field(default=None, ge=0)
    price_idr_per_1k_in: int | None = Field(default=None, ge=0)
    price_idr_per_1k_out: int | None = Field(default=None, ge=0)
    max_ctx: int | None = Field(default=None, ge=1)
    max_tokens_cap: int | None = Field(default=None, ge=1)
    enabled: bool | None = None


class AiUpstreamCreate(BaseModel):
    provider_id: uuid.UUID
    upstream_id: str = Field(..., min_length=1, max_length=256)
    hpp_usd_per_1m_in: Decimal | None = Field(default=None, ge=0)
    hpp_usd_per_1m_out: Decimal | None = Field(default=None, ge=0)
    max_tokens_cap: int | None = Field(default=None, ge=1)
    rank: int | None = Field(default=None, ge=1)


class AiUpstreamUpdate(BaseModel):
    provider_id: uuid.UUID | None = None
    upstream_id: str | None = Field(default=None, min_length=1, max_length=256)
    hpp_usd_per_1m_in: Decimal | None = Field(default=None, ge=0)
    hpp_usd_per_1m_out: Decimal | None = Field(default=None, ge=0)
    max_tokens_cap: int | None = Field(default=None, ge=1)
    enabled: bool | None = None
    rank: int | None = Field(default=None, ge=1)


class AiUpstreamOut(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    provider_name: str
    provider_status: str
    provider_enabled: bool
    upstream_id: str
    hpp_usd_per_1m_in: float | None
    hpp_usd_per_1m_out: float | None
    max_tokens_cap: int | None
    rank: int
    enabled: bool


class AiModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    provider_id: uuid.UUID
    public_id: str
    upstream_id: str
    hpp_usd_per_1k_in: int
    hpp_usd_per_1k_out: int
    price_idr_per_1k_in: int
    price_idr_per_1k_out: int
    price_usd_per_1m_in: float
    price_usd_per_1m_out: float
    hpp_usd_per_1m_in: float
    hpp_usd_per_1m_out: float
    max_ctx: int
    max_tokens_cap: int
    enabled: bool
    created_at: datetime
    updated_at: datetime
    upstreams: list[AiUpstreamOut] = []


class AiModelList(BaseModel):
    items: list[AiModelOut]
    total: int


class AiWalletOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    organization_id: uuid.UUID
    balance_idr: int
    currency: str


class AiWalletTopup(BaseModel):
    amount_idr: int = Field(..., ge=1)


class AiPublicModelOut(BaseModel):
    public_id: str
    price_idr_per_1k_in: int
    price_idr_per_1k_out: int
    price_usd_per_1m_in: float
    price_usd_per_1m_out: float
    fx_rate: float
    fx_source: str
    fx_effective_date: date | None
    fx_stale: bool
    max_ctx: int
    max_tokens_cap: int


class AiPublicModelList(BaseModel):
    items: list[AiPublicModelOut]
    total: int


class AiUsageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID | None
    source: str
    model_public_id: str
    prompt_tokens: int
    completion_tokens: int
    cached_tokens: int = 0
    ttft_ms: int | None = None
    billed_idr: int
    latency_ms: int | None
    http_status: int | None
    finish_reason: str | None
    tps: float | None = None
    created_at: datetime

    @model_validator(mode="after")
    def _derive_tps(self) -> AiUsageOut:
        """Output tokens per second over the generation window.

        Streaming rows know TTFT, so the generation window is ``latency - ttft``.
        Non-streaming rows have no first-token timestamp; use the whole request
        latency rather than inventing a TTFT. Never divide by zero or report a
        rate for a row with no completion tokens.
        """
        if self.tps is not None or self.completion_tokens <= 0 or self.latency_ms is None:
            return self
        elapsed_ms = self.latency_ms - (self.ttft_ms or 0)
        if elapsed_ms <= 0:
            return self
        self.tps = round(self.completion_tokens / (elapsed_ms / 1000), 2)
        return self


class AiUsageList(BaseModel):
    items: list[AiUsageOut]
    total: int


class AiAdminUsageOut(AiUsageOut):
    request_payload: dict[str, Any] | None = None
    response_payload: dict[str, Any] | None = None
    cogs_idr: int = 0
    billed_usd: float | None = None
    cogs_usd: float | None = None
    fx_rate: float | None = None
    fx_source: str | None = None
    fx_effective_date: date | None = None
    price_usd_per_1m_in: float | None = None
    price_usd_per_1m_out: float | None = None
    hpp_usd_per_1m_in: float | None = None
    hpp_usd_per_1m_out: float | None = None
    margin_idr: int = 0

    @model_validator(mode="after")
    def _derive_margin(self) -> AiAdminUsageOut:
        self.margin_idr = self.billed_idr - self.cogs_idr
        return self


class AiAdminUsageList(BaseModel):
    items: list[AiAdminUsageOut]
    total: int


class AiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)


class AiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    prefix: str
    is_active: bool
    rate_limit_rpm: int
    created_at: datetime
    last_used_at: datetime | None
    key: str | None = None


class AiKeyList(BaseModel):
    items: list[AiKeyOut]
    total: int


class AiFxRateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    base: str
    quote: str
    rate: float
    source: str
    effective_date: date
    fetched_at: datetime
    created_by: uuid.UUID | None = None


class AiFxStatusOut(BaseModel):
    rate: float
    source: str
    effective_date: date | None
    fetched_at: datetime | None
    using_env_fallback: bool
    env_rate: int
    auto_fetch_enabled: bool
    history: list[AiFxRateOut]


class AiFxManualIn(BaseModel):
    rate: float = Field(gt=0, le=1_000_000)
