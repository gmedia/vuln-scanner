from pydantic import BaseModel
from datetime import datetime
import uuid


class KeyCreateRequest(BaseModel):
    name: str
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
