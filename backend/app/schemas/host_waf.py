from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class HostWafPolicyUpsert(BaseModel):
    mode: str = Field(..., pattern=r"^(off|detect|protect)$")
    engine: str = Field(default="mock", pattern=r"^(mock|coraza|nginx_modsec)$")
    paranoia: int = Field(default=1, ge=1, le=4)

    @field_validator("engine")
    @classmethod
    def allowed_engines(cls, v: str) -> str:
        if v not in ("mock", "coraza", "nginx_modsec"):
            raise ValueError("engine must be mock, coraza, or nginx_modsec")
        return v


class HostWafPolicyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    site_id: uuid.UUID
    mode: str
    engine: str
    paranoia: int
    updated_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    site_name: str | None = None


class HostWafEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    site_id: uuid.UUID
    policy_id: uuid.UUID | None
    action: str
    rule_id: str
    method: str
    path: str
    http_status: int | None
    created_at: datetime


class HostWafSnippetResponse(BaseModel):
    site_id: uuid.UUID
    engine: str
    mode: str
    filename: str
    content: str


MAX_AGENT_WAF_EVENTS = 100
_HTTP_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"})


class HostAgentWafEventIn(BaseModel):
    action: str = Field(..., pattern=r"^(log|block)$")
    rule_id: str = Field(..., min_length=1, max_length=128)
    method: str = Field(..., min_length=1, max_length=8)
    path: str = Field(..., min_length=1, max_length=512)
    http_status: int | None = Field(default=None, ge=100, le=599)

    @field_validator("rule_id", "path")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return v.strip()

    @field_validator("method")
    @classmethod
    def normalize_method(cls, v: str) -> str:
        method = v.strip().upper()
        if method not in _HTTP_METHODS:
            raise ValueError("unsupported HTTP method")
        return method


class HostAgentWafEventsIngest(BaseModel):
    agent_id: uuid.UUID
    site_id: uuid.UUID
    events: list[HostAgentWafEventIn] = Field(default_factory=list)


class HostAgentWafEventsResponse(BaseModel):
    ok: bool
    accepted: int = 0
