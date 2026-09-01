from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.host_protect import HOST_SITE_SKU_LIMITS
from app.services.host_path import validate_root_path

MAX_SITES_MULTI = HOST_SITE_SKU_LIMITS["multi"]


class HostSiteCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    guard_agent_id: uuid.UUID
    root_path: str = Field(..., min_length=1, max_length=1024)
    cms_hint: str | None = Field(default=None, pattern=r"^(wordpress|laravel|unknown)$")
    asset_id: uuid.UUID | None = None
    enabled: bool = True
    auto_quarantine: bool = False

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("root_path")
    @classmethod
    def check_path(cls, v: str) -> str:
        return validate_root_path(v)


class HostSiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    cms_hint: str | None = Field(default=None, pattern=r"^(wordpress|laravel|unknown)$")
    enabled: bool | None = None
    auto_quarantine: bool | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return v.strip()


class HostSiteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    guard_agent_id: uuid.UUID
    asset_id: uuid.UUID | None
    name: str
    root_path: str
    cms_hint: str | None
    enabled: bool
    auto_quarantine: bool
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    sku: str | None = None
    sku_limit: int | None = None


class HostScanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    site_id: uuid.UUID
    status: str
    trigger: str
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None
    hit_count: int
    created_at: datetime


MAX_AGENT_FINDINGS = 500
MAX_AGENT_BODY_BYTES = 256 * 1024


class HostAgentFinding(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    rel_path: str = Field(..., min_length=1, max_length=1024)
    hit_class: str = Field(..., alias="class", pattern=r"^(webshell|backdoor|malware|spam_seo|suspicious)$")
    rule_id: str = Field(..., min_length=1, max_length=128)
    sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")

    @field_validator("rel_path", "rule_id")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return v.strip()


class HostAgentResultsIngest(BaseModel):
    scan_id: uuid.UUID
    agent_id: uuid.UUID
    engine: str = Field(..., pattern=r"^(yara|needles|clam)$")
    findings: list[HostAgentFinding] = Field(default_factory=list)


class HostAgentResultsResponse(BaseModel):
    ok: bool
    scan_id: uuid.UUID
    hit_count: int
    engine: str


class HostAgentPollJob(BaseModel):
    scan_id: uuid.UUID
    site_id: uuid.UUID
    root_path: str
    trigger: str


class HostAgentPollResponse(BaseModel):
    jobs: list[HostAgentPollJob]


class HostHitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    site_id: uuid.UUID
    scan_id: uuid.UUID | None
    rel_path: str
    hit_class: str = Field(serialization_alias="class")
    engine: str
    rule_id: str
    status: str
    sha256: str | None
    first_seen_at: datetime
    last_seen_at: datetime
