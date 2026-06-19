import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class ScanRequest(BaseModel):
    target: str = Field(..., min_length=1, max_length=500)
    ports: str | None = Field(default="1-1000", pattern=r"^\d+(-\d+)?(,\d+(-\d+)?)*$")


class DomainScanRequest(BaseModel):
    domain: str = Field(..., min_length=3, max_length=253)


class ScanJobResponse(BaseModel):
    id: uuid.UUID
    scan_type: str
    target: str
    status: str
    progress: int
    result_summary: dict | None
    celery_task_id: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class ScanFindingResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    severity: str
    category: str | None
    title: str
    description: str | None
    cve_id: str | None
    cvss_score: float | None
    remediation: str | None
    found_at: datetime

    class Config:
        from_attributes = True


class ScanJobDetailResponse(ScanJobResponse):
    findings: list[ScanFindingResponse] = []


class ScanHistoryParams(BaseModel):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    scan_type: str | None = None


class PaginatedResponse(BaseModel):
    items: list[ScanJobResponse]
    total: int
    page: int
    limit: int
    pages: int


class ErrorResponse(BaseModel):
    detail: str
