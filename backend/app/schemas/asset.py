from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.asset import ASSET_SKU_LIMITS
from app.schemas.scan import TARGET_PATTERN

MAX_ASSETS_MULTI = ASSET_SKU_LIMITS["multi"]
MAX_TAGS_PER_ASSET = 8
MAX_TAG_LEN = 32
_TAG_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,31}$")


def normalize_tags(tags: list[str] | None) -> list[str]:
    if not tags:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        tag = raw.strip().lower()
        if not tag:
            continue
        if len(tag) > MAX_TAG_LEN or not _TAG_RE.match(tag):
            raise ValueError("tag must be 1–32 chars: lowercase letters, digits, . _ -")
        if tag in seen:
            continue
        seen.add(tag)
        out.append(tag)
        if len(out) > MAX_TAGS_PER_ASSET:
            raise ValueError(f"at most {MAX_TAGS_PER_ASSET} tags per asset")
    return out


class AssetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scan_type: str = Field(..., pattern=r"^(ip|domain)$")
    target: str = Field(..., min_length=1, max_length=512)
    notes: str | None = Field(default=None, max_length=4000)
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        return normalize_tags(v)

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
    tags: list[str] | None = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        return normalize_tags(v)

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


class AssetPackItem(BaseModel):
    id: uuid.UUID
    name: str
    scan_type: str
    target: str
    schedule_id: uuid.UUID | None = None


class AssetPackResponse(BaseModel):
    organization_id: uuid.UUID
    sku: str | None
    sku_limit: int
    count: int
    assets: list[AssetPackItem]


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    scan_type: str
    target: str
    notes: str | None
    tags: list[str] = Field(default_factory=list)
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    schedule_id: uuid.UUID | None = None
    sku_limit: int | None = None
    sku: str | None = None
