from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


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
    created_at: datetime
    updated_at: datetime


class AiProviderList(BaseModel):
    items: list[AiProviderOut]
    total: int


class AiModelCreate(BaseModel):
    provider_id: uuid.UUID
    public_id: str = Field(..., min_length=3, max_length=128)
    upstream_id: str = Field(..., min_length=1, max_length=256)
    hpp_usd_per_1k_in: int = Field(default=0, ge=0)
    hpp_usd_per_1k_out: int = Field(default=0, ge=0)
    price_idr_per_1k_in: int = Field(..., ge=0)
    price_idr_per_1k_out: int = Field(..., ge=0)
    max_ctx: int = Field(default=8192, ge=1)
    max_tokens_cap: int = Field(default=4096, ge=1)
    enabled: bool = True


class AiModelUpdate(BaseModel):
    public_id: str | None = Field(default=None, min_length=3, max_length=128)
    upstream_id: str | None = Field(default=None, min_length=1, max_length=256)
    hpp_usd_per_1k_in: int | None = Field(default=None, ge=0)
    hpp_usd_per_1k_out: int | None = Field(default=None, ge=0)
    price_idr_per_1k_in: int | None = Field(default=None, ge=0)
    price_idr_per_1k_out: int | None = Field(default=None, ge=0)
    max_ctx: int | None = Field(default=None, ge=1)
    max_tokens_cap: int | None = Field(default=None, ge=1)
    enabled: bool | None = None


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
    max_ctx: int
    max_tokens_cap: int
    enabled: bool
    created_at: datetime
    updated_at: datetime


class AiModelList(BaseModel):
    items: list[AiModelOut]
    total: int
