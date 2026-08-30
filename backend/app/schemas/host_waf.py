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
    def s1_mock_only(cls, v: str) -> str:
        if v != "mock":
            raise ValueError("only engine=mock is allowed until Host WAF S4")
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
