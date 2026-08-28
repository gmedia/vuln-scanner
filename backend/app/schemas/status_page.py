from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
_HOST_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


def normalize_slug(raw: str) -> str:
    value = (raw or "").strip().lower()
    if not _SLUG_RE.match(value):
        raise ValueError("slug must be lowercase alphanumeric with hyphens")
    return value


def normalize_hostname(raw: str) -> str:
    value = (raw or "").strip().lower().rstrip(".")
    if not _HOST_RE.match(value):
        raise ValueError("invalid hostname")
    return value


class StatusPageCreate(BaseModel):
    slug: str
    title: str = Field(min_length=1, max_length=255)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        return normalize_slug(v)


class StatusPageUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = None
    published: bool | None = None
    custom_hostname: str | None = None

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        return normalize_slug(v)

    @field_validator("custom_hostname")
    @classmethod
    def _host(cls, v: str | None) -> str | None:
        if v is None or v.strip() == "":
            return None
        return normalize_hostname(v)


class StatusComponentCreate(BaseModel):
    monitor_id: uuid.UUID
    display_name: str = Field(min_length=1, max_length=255)
    sort_order: int = 0


class StatusIncidentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    impact: str = "minor"
    status: str = "investigating"
    body: str = Field(min_length=1, max_length=4000)

    @field_validator("impact")
    @classmethod
    def _impact(cls, v: str) -> str:
        if v not in ("none", "minor", "major", "critical"):
            raise ValueError("invalid impact")
        return v

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in ("investigating", "identified", "monitoring", "resolved"):
            raise ValueError("invalid status")
        return v


class StatusIncidentUpdateCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    status: str

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        if v not in ("investigating", "identified", "monitoring", "resolved"):
            raise ValueError("invalid status")
        return v


class StatusComponentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    monitor_id: uuid.UUID
    display_name: str
    sort_order: int
    state: str | None = None


class StatusIncidentUpdateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    body: str
    status: str
    created_at: datetime


class StatusIncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    impact: str
    status: str
    started_at: datetime
    resolved_at: datetime | None
    created_at: datetime
    updates: list[StatusIncidentUpdateResponse] = Field(default_factory=list)


class StatusPageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    slug: str
    title: str
    published: bool
    custom_hostname: str | None
    hostname_status: str
    cname_target: str
    public_path: str
    created_at: datetime
    updated_at: datetime
    components: list[StatusComponentResponse] = Field(default_factory=list)
    incidents: list[StatusIncidentResponse] = Field(default_factory=list)
    overall: str | None = None
