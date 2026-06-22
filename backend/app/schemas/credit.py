import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CreditInfo(BaseModel):
    credits: int
    is_admin: bool


class CreditLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: int
    type: str
    description: str | None
    reference_id: uuid.UUID | None
    created_at: datetime


class CreditHistoryResponse(BaseModel):
    items: list[CreditLogItem]
    total: int


class ScanEligibility(BaseModel):
    eligible: bool
    required_credits: int
    current_credits: int
    scan_type: str
