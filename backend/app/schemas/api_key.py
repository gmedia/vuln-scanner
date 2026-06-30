import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class KeyCreateRequest(BaseModel):
    name: str = Field(..., max_length=100, description="API key name (max 100 chars)")
    rate_limit: int = 60


class KeyResponse(BaseModel):
    id: uuid.UUID
    name: str | None
    is_active: bool
    rate_limit: int
    created_at: datetime
    key: str | None = None


class KeyRevokeResponse(BaseModel):
    id: uuid.UUID
    is_active: bool


class KeyListResponse(BaseModel):
    keys: list[KeyResponse]
