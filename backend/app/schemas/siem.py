from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SiemStatusResponse(BaseModel):
    enabled: bool
    indexer_reachable: bool
    degraded: bool = False
    last_error: str | None = None
    search_min_level: int
    max_lookback_hours: int
    max_page_size: int
    include_full_log: bool = False
    wazuh_group: str | None = None


class SiemEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    external_id: str
    rule_id: str | None = None
    rule_level: int
    rule_description: str
    agent_wazuh_id: str | None = None
    agent_name: str | None = None
    occurred_at: datetime


class SiemEventListResponse(BaseModel):
    items: list[SiemEventResponse] = Field(default_factory=list)
    degraded: bool = False
    last_error: str | None = None


class SiemCaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    external_id: str | None = Field(default=None, max_length=128)
    assignee_user_id: UUID | None = None


class SiemCasePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = None
    assignee_user_id: UUID | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in ("open", "ack", "closed"):
            raise ValueError("status must be open, ack, or closed")
        return value


class SiemCaseNoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class SiemCaseEventAttach(BaseModel):
    external_id: str = Field(min_length=1, max_length=128)


class SiemCaseEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_id: str
    rule_id: str | None = None
    rule_level: int
    rule_description: str
    agent_wazuh_id: str | None = None
    agent_name: str | None = None
    occurred_at: datetime


class SiemCaseNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    author_user_id: UUID
    body: str
    created_at: datetime


class SiemCaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    title: str
    status: str
    severity: int | None = None
    created_by_user_id: UUID
    assignee_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None
    events: list[SiemCaseEventResponse] = Field(default_factory=list)
    notes: list[SiemCaseNoteResponse] = Field(default_factory=list)


class SiemCaseListResponse(BaseModel):
    items: list[SiemCaseResponse] = Field(default_factory=list)
