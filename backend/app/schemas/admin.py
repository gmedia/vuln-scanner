import uuid
from datetime import date, datetime

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
    last_login_at: datetime | None = None


class AdminUserList(BaseModel):
    users: list[AdminUserItem]
    total: int


class CreditUpdateRequest(BaseModel):
    amount: int = Field(..., description="Positive=credit, negative=deduct")
    description: str = Field(default="Admin adjustment", max_length=2000)


class PricingItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scan_type: str = Field(..., max_length=20)
    credit_cost: int
    updated_at: datetime


class PricingUpdateRequest(BaseModel):
    credit_cost: int = Field(..., ge=0)


class PricingListResponse(BaseModel):
    items: list[PricingItem]


class HppRateItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str = Field(..., max_length=20)
    amount_idr: int
    updated_at: datetime
    updated_by: uuid.UUID | None = None


class HppRateUpdateRequest(BaseModel):
    amount_idr: int = Field(..., ge=0)


class HppRateListResponse(BaseModel):
    items: list[HppRateItem]


class HppOverheadItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    amount_idr: int
    updated_at: datetime
    updated_by: uuid.UUID | None = None


class HppOverheadUpdateRequest(BaseModel):
    amount_idr: int = Field(..., ge=0)


class HppCostLineItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    incurred_on: datetime
    amount_idr: int
    category: str
    note: str
    created_at: datetime
    created_by: uuid.UUID | None = None


class HppCostLineCreateRequest(BaseModel):
    incurred_on: date
    amount_idr: int = Field(..., ge=0)
    category: str = Field(..., pattern="^(opex|variable)$")
    note: str = Field(default="", max_length=200)


class HppCostLineListResponse(BaseModel):
    items: list[HppCostLineItem]


class HppReportLine(BaseModel):
    key: str
    count: int
    rate_idr: int
    hpp_idr: int
    overhead_share_idr: int
    fully_loaded_hpp_idr: int
    fully_loaded_unit_idr: int


class HppSkuEstimate(BaseModel):
    sku: str
    list_idr: int
    credits_per_month: int
    label: str
    hpp_if_all_ip_idr: int | None
    hpp_if_all_domain_idr: int | None
    margin_if_all_ip_idr: int | None
    margin_if_all_domain_idr: int | None
    margin_if_all_ip_pct: int | None
    margin_if_all_domain_pct: int | None


class HppReportResponse(BaseModel):
    from_date: datetime
    to_date: datetime
    lines: list[HppReportLine]
    total_count: int
    total_hpp_idr: int
    overhead_idr: int
    journal_opex_idr: int
    journal_variable_idr: int
    total_fully_loaded_hpp_idr: int
    unallocated_overhead_idr: int
    sku_estimates: list[HppSkuEstimate]


class HppQuoteRequest(BaseModel):
    provider: str = Field(..., min_length=1, max_length=40)
    region: str = Field(default="", max_length=40)
    cpu_vcpu: int = Field(..., ge=1, le=512)
    ram_gb: int = Field(..., ge=1, le=4096)
    monthly_instance_idr: int = Field(..., ge=0, description="Monthly instance cost in IDR")
    electricity_idr_per_kwh: float = Field(default=1692.0, ge=0)
    power_watt_per_vcpu: float = Field(default=8.0, ge=0)
    pue: float = Field(default=1.3, ge=1.0)
    jobs: dict[str, int] = Field(default_factory=dict)
    overhead_idr: int | None = Field(default=None, ge=0)


class HppQuoteLine(BaseModel):
    key: str
    jobs: int
    rate_idr: int
    hpp_idr: int
    fully_loaded_unit_idr: int


class HppQuoteResponse(BaseModel):
    provider: str
    region: str
    monthly_compute_idr: int
    monthly_power_idr: int
    monthly_total_idr: int
    total_jobs: int
    breakeven_unit_idr: int
    overhead_pool_idr: int
    total_hpp_idr: int
    total_fully_loaded_hpp_idr: int
    breakeven_pct_of_list_basic: float
    breakeven_pct_of_list_pro: float
    breakeven_pct_of_list_multi: float
    lines: list[HppQuoteLine]
    note: str


class EmailSendLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    status: str
    recipient_masked: str
    attempts: int
    error_message: str | None = None
    created_at: datetime


class EmailSendLogList(BaseModel):
    items: list[EmailSendLogItem]
    total: int
