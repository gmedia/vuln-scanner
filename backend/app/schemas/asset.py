from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.asset import ASSET_SKU_LIMITS
from app.schemas.scan import TARGET_PATTERN

MAX_ASSETS_MULTI = ASSET_SKU_LIMITS["multi"]


class AssetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scan_type: str = Field(..., pattern=r"^(ip|domain)$")
    target: str = Field(..., min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("target")
    @classmethod
    def validate_target(cls, v: str, info) -> str:  # type: ignore[no-untyped-def]
        raw = v.strip()
        scan_type = info.data.get("scan_type")
        if scan_type == "domain":
            if len(raw) > 253 or "." not in raw:
                raise ValueError("domain must be a valid fully-qualified domain name")
            if not re.match(r"^[a-zA-Z0-9._\-]+$", raw):
                raise ValueError("domain contains invalid characters")
            for label in raw.split("."):
                if not label or len(label) > 63 or label.startswith("-") or label.endswith("-"):
                    raise ValueError("domain must be a valid fully-qualified domain name")
            return raw.lower()
        if not TARGET_PATTERN.match(raw):
            raise ValueError("target must be a valid IPv4 address or fully-qualified domain name")
        return raw

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return v.strip()


class AssetScheduleCreate(BaseModel):
    cadence: str = Field(..., pattern=r"^(weekly|monthly)$")
    timezone: str = Field(default="Asia/Jakarta", max_length=64)
    notify_email: str | None = Field(default=None, max_length=255)
    enabled: bool = True
    name: str | None = Field(default=None, max_length=255)


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    scan_type: str
    target: str
    notes: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    schedule_id: uuid.UUID | None = None
    sku_limit: int | None = None
    sku: str | None = None
