from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class GuardStatusResponse(BaseModel):
    enabled: bool
    wazuh_group: str | None = None
    last_inventory_sync_at: datetime | None = None
    last_alert_sync_at: datetime | None = None
    last_sync_error: str | None = None
    degraded: bool = False


class GuardAgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    wazuh_agent_id: str
    name: str
    status: str
    ip: str | None = None
    version: str | None = None
    last_keep_alive: datetime | None = None
    synced_at: datetime
    created_at: datetime


class GuardAlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    external_id: str
    rule_id: str | None = None
    rule_level: int
    rule_description: str
    agent_wazuh_id: str | None = None
    agent_name: str | None = None
    occurred_at: datetime
    synced_at: datetime
    created_at: datetime


class GuardEnrollTokenCreate(BaseModel):
    label: str | None = Field(default=None, max_length=128)


class GuardEnrollTokenCreated(BaseModel):
    id: uuid.UUID
    label: str | None
    expires_at: datetime
    token: str
    created_at: datetime


class GuardEnrollTokenMeta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    label: str | None
    expires_at: datetime
    revoked_at: datetime | None
    used_at: datetime | None
    created_at: datetime


class GuardEnrollRequest(BaseModel):
    token: str = Field(..., min_length=16, max_length=256)
    agent_name: str = Field(..., min_length=1, max_length=63)


class GuardEnrollResponse(BaseModel):
    agent_id: str
    agent_name: str
    agent_key: str
    manager_host: str
    install_hint: str
    organization_id: str
    saas_base: str


class GuardSyncResponse(BaseModel):
    ok: bool
    agents: int | None = None
    alerts: int | None = None
    reason: str | None = None
    error: str | None = None
