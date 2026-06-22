import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AdminStats(BaseModel):
    total_users: int
    total_scans: int
    total_findings: int
    credits_distributed: int
    credits_used: int


class AdminUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    is_admin: bool
    is_verified: bool
    credits: int
    scan_count: int
    created_at: datetime


class AdminUserList(BaseModel):
    users: list[AdminUserItem]
    total: int


class CreditUpdateRequest(BaseModel):
    amount: int = Field(..., description="Positive=credit, negative=deduct")
    description: str = Field(default="Admin adjustment")


class PricingItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scan_type: str
    credit_cost: int
    updated_at: datetime


class PricingUpdateRequest(BaseModel):
    credit_cost: int = Field(..., ge=0)


class PricingListResponse(BaseModel):
    items: list[PricingItem]
