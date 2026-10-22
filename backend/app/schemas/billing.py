from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SubscriptionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    sku: str
    status: str
    cycle: str
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = False
    canceled_at: datetime | None = None
    ended_at: datetime | None = None
    provider: str = "manual"
    provider_subscription_id: str | None = None
    created_at: datetime
    updated_at: datetime
    organization_name: str | None = None


class PaymentAttemptItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    subscription_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None
    provider: str
    provider_ref: str | None = None
    created_by_user_id: uuid.UUID | None = None
    amount_idr: int
    currency: str = "IDR"
    status: str
    method: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    next_retry_at: datetime | None = None
    succeeded_at: datetime | None = None
    failed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SubscriptionDetail(SubscriptionItem):
    attempts: list[PaymentAttemptItem] = Field(default_factory=list)


class SubscriptionListResponse(BaseModel):
    items: list[SubscriptionItem]
    total: int


class RecordPaymentRequest(BaseModel):
    invoice_id: uuid.UUID
    method: str = Field(default="bank_transfer", max_length=32)
    reference: str | None = Field(default=None, max_length=128)


class RecordPaymentResponse(BaseModel):
    subscription: SubscriptionItem | None = None
    attempt: PaymentAttemptItem
    invoice_id: uuid.UUID
    invoice_status: str


class CancelSubscriptionRequest(BaseModel):
    at_period_end: bool = True
    note: str = Field(default="", max_length=500)


class SubscriptionCancelRequest(BaseModel):
    note: str = Field(default="", max_length=500)


class PaymentEventIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., min_length=1, max_length=64)
    data: dict[str, Any] = Field(default_factory=dict)


class PaymentEventResult(BaseModel):
    status: str
    event_id: str
