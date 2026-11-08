"""Pydantic schemas for the AI top-up catalog (S1)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AiTopupPackCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=32)
    label: str = Field(..., min_length=1, max_length=64)
    amount_idr: int = Field(..., ge=1)
    bonus_idr: int = Field(default=0, ge=0)
    active: bool = True
    sort_order: int = 0


class AiTopupPackUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=32)
    label: str | None = Field(default=None, min_length=1, max_length=64)
    amount_idr: int | None = Field(default=None, ge=1)
    bonus_idr: int | None = Field(default=None, ge=0)
    active: bool | None = None
    sort_order: int | None = None


class AiTopupPackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    label: str
    amount_idr: int
    bonus_idr: int
    active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class AiTopupPackList(BaseModel):
    items: list[AiTopupPackOut]
    total: int
