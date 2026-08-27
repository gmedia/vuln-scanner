from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class OrgCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=64)
    kind: str = Field(default="company", pattern=r"^(company|hotel)$")


class OrgUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=64)
    sku: str | None = Field(default=None, pattern=r"^(basic|pro|multi)$")


class OrgSwitchRequest(BaseModel):
    organization_id: uuid.UUID


class OrgMembershipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    kind: str
    sku: str = "multi"
    role: str
    created_at: datetime


class OrgDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    kind: str
    sku: str = "multi"
    created_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str | None = None
    role: str
    created_at: datetime
    organization_id: uuid.UUID | None = None


class MemberRoleUpdate(BaseModel):
    role: str = Field(..., pattern=r"^(owner|admin|member|viewer)$")


class InviteCreateRequest(BaseModel):
    email: EmailStr = Field(..., max_length=254)
    role: str = Field(default="member", pattern=r"^(admin|member|viewer)$")

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: EmailStr) -> str:
        return str(v).strip().lower()


class InviteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime
    token: str | None = None


class InviteAcceptRequest(BaseModel):
    token: str = Field(..., min_length=8, max_length=256)


class OrgSwitchResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    active_org_id: uuid.UUID
