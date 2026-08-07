import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.scan import TARGET_PATTERN

MAX_SCHEDULES_PER_USER = 10


class ScheduleCreate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    scan_type: str = Field(..., pattern=r"^(ip|domain)$")
    target: str = Field(..., min_length=1, max_length=512)
    cadence: str = Field(..., pattern=r"^(weekly|monthly)$")
    timezone: str = Field(default="Asia/Jakarta", max_length=64)
    notify_email: str | None = Field(default=None, max_length=255)
    enabled: bool = True

    @field_validator("target")
    @classmethod
    def validate_target(cls, v: str, info) -> str:  # type: ignore[no-untyped-def]
        raw = v.strip()
        scan_type = info.data.get("scan_type")
        if scan_type == "domain":
            if len(raw) > 253 or "." not in raw:
                raise ValueError("domain must be a valid fully-qualified domain name")
            if not re.match(r"^[a-zA-Z0-9._\-]+$", raw):
                raise ValueError("domain contains invalid characters")
            for label in raw.split("."):
                if not label or len(label) > 63 or label.startswith("-") or label.endswith("-"):
                    raise ValueError("domain must be a valid fully-qualified domain name")
            return raw.lower()
        if not TARGET_PATTERN.match(raw):
            raise ValueError("target must be a valid IPv4 address or fully-qualified domain name")
        return raw


class ScheduleUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    target: str | None = Field(default=None, min_length=1, max_length=512)
    cadence: str | None = Field(default=None, pattern=r"^(weekly|monthly)$")
    timezone: str | None = Field(default=None, max_length=64)
    notify_email: str | None = Field(default=None, max_length=255)
    enabled: bool | None = None

    @field_validator("target")
    @classmethod
    def validate_target(cls, v: str | None) -> str | None:
        if v is None:
            return v
        raw = v.strip()
        if not TARGET_PATTERN.match(raw):
            raise ValueError("target must be a valid IPv4 address or fully-qualified domain name")
        return raw


class ScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str | None
    scan_type: str
    target: str
    cadence: str
    timezone: str
    next_run_at: datetime
    last_run_at: datetime | None
    last_job_id: uuid.UUID | None
    enabled: bool
    notify_email: str | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime
