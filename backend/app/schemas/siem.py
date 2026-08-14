from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
