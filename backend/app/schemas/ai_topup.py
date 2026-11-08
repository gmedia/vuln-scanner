"""Pydantic schemas for the AI top-up catalog and orders."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.ai_gateway import AiTopupOrder


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


class AiTopupOrderCreate(BaseModel):
    pack_id: uuid.UUID
    method: Literal["manual_transfer", "midtrans"]


class AiTopupCheckoutIn(BaseModel):
    provider: Literal["midtrans"]


class AiTopupCheckoutOut(BaseModel):
    redirect_url: str
    attempt_id: uuid.UUID


class AiTopupBankOut(BaseModel):
    bank_name: str | None = None
    bank_account: str | None = None
    bank_holder: str | None = None


class AiTopupOrderOut(BaseModel):
    """Customer-facing order DTO. Never exposes internal proof/bank references."""

    id: uuid.UUID
    organization_id: uuid.UUID
    pack_id: uuid.UUID | None = None
    pack_code: str | None = None
    reference_code: str
    amount_idr: int
    credit_idr: int
    bonus_idr: int
    currency: str
    payment_method: str
    status: str
    has_proof: bool
    proof_uploaded_at: datetime | None = None
    paid_at: datetime | None = None
    expires_at: datetime
    created_at: datetime
    updated_at: datetime
    bank: AiTopupBankOut | None = None

    @classmethod
    def from_order(cls, order: AiTopupOrder, *, bank: AiTopupBankOut | None = None) -> AiTopupOrderOut:
        return cls(
            id=order.id,
            organization_id=order.organization_id,
            pack_id=order.pack_id,
            pack_code=order.pack_code,
            reference_code=order.reference_code,
            amount_idr=order.amount_idr,
            credit_idr=order.credit_idr,
            bonus_idr=order.bonus_idr,
            currency=order.currency,
            payment_method=order.payment_method,
            status=order.status,
            has_proof=order.proof_object_key is not None,
            proof_uploaded_at=order.proof_uploaded_at,
            paid_at=order.paid_at,
            expires_at=order.expires_at,
            created_at=order.created_at,
            updated_at=order.updated_at,
            bank=bank,
        )


class AiTopupOrderList(BaseModel):
    items: list[AiTopupOrderOut]
    total: int
    page: int
    limit: int


class AiTopupAdminOrderOut(BaseModel):
    """Admin-facing order DTO. Exposes verification metadata but never the proof ref."""

    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str | None = None
    created_by_user_id: uuid.UUID | None = None
    pack_id: uuid.UUID | None = None
    pack_code: str | None = None
    reference_code: str
    amount_idr: int
    credit_idr: int
    bonus_idr: int
    currency: str
    payment_method: str
    status: str
    has_proof: bool
    proof_mime: str | None = None
    proof_size_bytes: int | None = None
    proof_uploaded_at: datetime | None = None
    bank_ref: str | None = None
    verified_by_user_id: uuid.UUID | None = None
    verified_at: datetime | None = None
    rejection_reason: str | None = None
    resolution_note: str | None = None
    paid_at: datetime | None = None
    expires_at: datetime
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_order(
        cls,
        order: AiTopupOrder,
        *,
        organization_name: str | None = None,
    ) -> AiTopupAdminOrderOut:
        return cls(
            id=order.id,
            organization_id=order.organization_id,
            organization_name=organization_name,
            created_by_user_id=order.created_by_user_id,
            pack_id=order.pack_id,
            pack_code=order.pack_code,
            reference_code=order.reference_code,
            amount_idr=order.amount_idr,
            credit_idr=order.credit_idr,
            bonus_idr=order.bonus_idr,
            currency=order.currency,
            payment_method=order.payment_method,
            status=order.status,
            has_proof=order.proof_object_key is not None,
            proof_mime=order.proof_mime,
            proof_size_bytes=order.proof_size_bytes,
            proof_uploaded_at=order.proof_uploaded_at,
            bank_ref=order.bank_ref,
            verified_by_user_id=order.verified_by_user_id,
            verified_at=order.verified_at,
            rejection_reason=order.rejection_reason,
            resolution_note=order.resolution_note,
            paid_at=order.paid_at,
            expires_at=order.expires_at,
            created_at=order.created_at,
            updated_at=order.updated_at,
        )


class AiTopupAdminOrderList(BaseModel):
    items: list[AiTopupAdminOrderOut]
    total: int
    page: int
    limit: int


class AiTopupApproveIn(BaseModel):
    bank_ref: str | None = Field(default=None, max_length=64)
    force: bool = False


class AiTopupRejectIn(BaseModel):
    reason: str = Field(..., min_length=1, max_length=255)


class AiTopupResolveRefundIn(BaseModel):
    action: Literal["clawback", "write_off"]
    note: str | None = Field(default=None, max_length=255)
