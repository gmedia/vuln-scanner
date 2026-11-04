from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProviderItem(BaseModel):
    name: str
    label: str
    mode: str


class ProviderListResponse(BaseModel):
    items: list[ProviderItem]


class CheckoutRequestIn(BaseModel):
    provider: str = Field(..., min_length=1, max_length=32)


class CheckoutResponse(BaseModel):
    attempt_id: uuid.UUID
    provider: str
    redirect_url: str | None = None
    expires_at: datetime | None = None
    amount_idr: int
    status: str
