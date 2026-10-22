from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PKP_STATUS = Literal["unknown", "pkp", "non_pkp"]
RECIPIENT_KIND = Literal["billing", "account"]


class BillingProfileUpdate(BaseModel):
    legal_name: str = Field(default="", max_length=255)
    tax_id: str = Field(default="", max_length=32)
    nitku: str = Field(default="", max_length=32)
    address_line1: str = Field(default="", max_length=255)
    address_line2: str = Field(default="", max_length=255)
    city: str = Field(default="", max_length=128)
    province: str = Field(default="", max_length=128)
    postal_code: str = Field(default="", max_length=16)
    country: str = Field(default="ID", min_length=2, max_length=2)
    billing_email: str = Field(default="", max_length=320)
    po_required: bool = False
    po_number: str = Field(default="", max_length=64)
    payment_terms_days: int = Field(default=0, ge=0, le=180)
    pkp_status: PKP_STATUS = "unknown"

    @field_validator("tax_id")
    @classmethod
    def _tax_id_shape(cls, value: str) -> str:
        value = value.strip()
        if value and not re.fullmatch(r"\d{16}", value):
            raise ValueError("tax_id must be 16 digits (NPWP)")
        return value

    @field_validator("nitku")
    @classmethod
    def _nitku_shape(cls, value: str) -> str:
        value = value.strip()
        if value and not re.fullmatch(r"\d{22}", value):
            raise ValueError("nitku must be 22 digits")
        return value

    @field_validator("billing_email")
    @classmethod
    def _email_shape(cls, value: str) -> str:
        value = value.strip().lower()
        if value and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("billing_email is not a valid address")
        return value

    @field_validator("country")
    @classmethod
    def _country_upper(cls, value: str) -> str:
        return value.strip().upper()


class BillingRecipientCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    kind: RECIPIENT_KIND = "billing"
    is_primary: bool = False

    @field_validator("email")
    @classmethod
    def _email_norm(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("email is not a valid address")
        return value


class BillingRecipientItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    kind: str
    is_primary: bool
    verified_at: datetime | None = None


class BillingProfileResponse(BaseModel):
    organization_id: uuid.UUID
    legal_name: str
    tax_id: str
    nitku: str
    address_line1: str
    address_line2: str
    city: str
    province: str
    postal_code: str
    country: str
    billing_email: str
    po_required: bool
    po_number: str
    payment_terms_days: int
    pkp_status: str
    recipients: list[BillingRecipientItem] = Field(default_factory=list)


__all__ = [
    "BillingProfileResponse",
    "BillingProfileUpdate",
    "BillingRecipientCreate",
    "BillingRecipientItem",
]
