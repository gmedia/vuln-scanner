import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InboxItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    status: str
    recipient_masked: str
    attempts: int
    created_at: datetime
    job_id: uuid.UUID | None = None


class InboxListResponse(BaseModel):
    items: list[InboxItem]
    total: int
