import logging
import secrets
import uuid
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.credit_log import CreditLog
from app.models.email_send_log import EMAIL_SEND_KINDS, EMAIL_SEND_STATUSES, EmailSendLog
from app.models.email_verification import EmailVerificationToken
from app.models.host_protect import HostScan
from app.models.hpp import (
    HPP_COST_CATEGORIES,
    HPP_KEYS,
    HPP_OVERHEAD_SINGLETON_ID,
    HppCostLine,
    HppOverhead,
    HppRate,
)
from app.models.pricing import PricingConfig
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User
from app.schemas.admin import (
    AdminStats,
    AdminUserItem,
    AdminUserList,
    CreditUpdateRequest,
    EmailSendLogItem,
    EmailSendLogList,
    HppCostLineCreateRequest,
    HppCostLineItem,
    HppCostLineListResponse,
    HppOverheadItem,
    HppOverheadUpdateRequest,
    HppRateItem,
    HppRateListResponse,
    HppRateUpdateRequest,
    HppReportLine,
    HppReportResponse,
    HppSkuEstimate,
    PricingItem,
    PricingListResponse,
    PricingUpdateRequest,
)
from app.schemas.auth import MessageResponse
from app.services.auth import get_current_admin
from app.services.email import send_verification_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

admin_limiter = RateLimiter(
    max_requests=settings.admin_rate_limit,
    window_seconds=settings.admin_rate_limit_window,
    prefix="ratelimit:admin",
)


@router.get("/stats", response_model=AdminStats)
async def get_stats(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminStats | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 0

    total_scans_result = await db.execute(select(func.count(ScanJob.id)))
    total_scans = total_scans_result.scalar() or 0

    total_findings_result = await db.execute(select(func.count(ScanFinding.id)))
    total_findings = total_findings_result.scalar() or 0

    credits_distributed_result = await db.execute(
        select(func.coalesce(func.sum(CreditLog.amount), 0)).where(CreditLog.type == "credit")
    )
    credits_distributed = credits_distributed_result.scalar() or 0

    credits_used_result = await db.execute(
        select(func.coalesce(func.sum(CreditLog.amount), 0)).where(CreditLog.type == "deduct")
    )
    credits_used = credits_used_result.scalar() or 0

    return AdminStats(
        total_users=total_users,
        total_scans=total_scans,
        total_findings=total_findings,
        credits_distributed=credits_distributed,
        credits_used=credits_used,
    )


@router.get("/users", response_model=AdminUserList)
async def get_users(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default=""),
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserList | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    count_query = select(func.count(User.id))
    if search:
        count_query = count_query.where(User.email.ilike(f"%{search}%"))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = select(User)
    if search:
        query = query.where(User.email.ilike(f"%{search}%"))
    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    users = result.scalars().all()

    user_items = []
    for user in users:
        scan_count_result = await db.execute(select(func.count(ScanJob.id)).where(ScanJob.user_id == user.id))
        scan_count = scan_count_result.scalar() or 0
        user_items.append(
            AdminUserItem(
                id=user.id,
                email=user.email,
                is_admin=user.is_admin,
                is_verified=user.is_verified,
                credits=user.credits,
                scan_count=scan_count,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            )
        )

    return AdminUserList(users=user_items, total=total)


@router.get("/users/{user_id}", response_model=AdminUserItem)
async def get_user_detail(
    request: Request,
    user_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    scan_count_result = await db.execute(select(func.count(ScanJob.id)).where(ScanJob.user_id == user.id))
    scan_count = scan_count_result.scalar() or 0

    return AdminUserItem(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        is_verified=user.is_verified,
        credits=user.credits,
        scan_count=scan_count,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.post("/users/{user_id}/credits", response_model=AdminUserItem)
async def adjust_user_credits(
    request: Request,
    user_id: uuid.UUID,
    body: CreditUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.amount < 0 and user.credits + body.amount < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient credits for deduction")

    await db.execute(
        text("UPDATE users SET credits = credits + :amount WHERE id = :uid"),
        {"amount": body.amount, "uid": user_id},
    )

    log_type = "credit" if body.amount > 0 else "deduct"
    log = CreditLog(
        user_id=user_id,
        amount=abs(body.amount),
        type=log_type,
        description=body.description,
        performed_by=current_admin.id,
    )
    db.add(log)
    await db.commit()

    await db.refresh(user)

    scan_count_result = await db.execute(select(func.count(ScanJob.id)).where(ScanJob.user_id == user.id))
    scan_count = scan_count_result.scalar() or 0

    return AdminUserItem(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        is_verified=user.is_verified,
        credits=user.credits,
        scan_count=scan_count,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.post("/users/{user_id}/resend-verification", response_model=MessageResponse)
async def admin_resend_verification(
    request: Request,
    user_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User email is already verified",
        )

    token_str = secrets.token_urlsafe(32)

    existing = await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id))
    old_token = existing.scalar_one_or_none()
    if old_token is not None:
        await db.delete(old_token)
        await db.flush()

    verification_token = EmailVerificationToken(
        user_id=user.id,
        token=token_str,
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(verification_token)
    await db.commit()

    try:
        email_sent = await send_verification_email(email_to=user.email, token=token_str)
    except Exception:
        logger.exception(
            "Unexpected error sending verification email (admin-resend) to %s",
            user.email,
        )
        email_sent = False
    if not email_sent:
        logger.error("Verification email was not sent (admin-resend) to %s", user.email)
        return MessageResponse(
            message="Failed to send verification email. Please try again shortly.",
            email_sent=False,
        )
    return MessageResponse(message="Verification email has been sent.", email_sent=True)


@router.post("/users/{user_id}/force-verify", response_model=AdminUserItem)
async def admin_force_verify_user(
    request: Request,
    user_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not user.is_verified:
        user.is_verified = True
        user.verified_at = datetime.now(UTC)
        existing = await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id))
        old_token = existing.scalar_one_or_none()
        if old_token is not None:
            await db.delete(old_token)
        await db.commit()
        await db.refresh(user)
        logger.info(
            "Admin %s force-verified user_id=%s",
            current_admin.id,
            user.id,
        )
    else:
        await db.refresh(user)

    scan_count_result = await db.execute(select(func.count(ScanJob.id)).where(ScanJob.user_id == user.id))
    scan_count = scan_count_result.scalar() or 0

    return AdminUserItem(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        is_verified=user.is_verified,
        credits=user.credits,
        scan_count=scan_count,
        created_at=user.created_at,
    )


@router.get("/pricing", response_model=PricingListResponse)
async def get_pricing(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PricingListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    result = await db.execute(select(PricingConfig).order_by(PricingConfig.scan_type))
    items = result.scalars().all()
    return PricingListResponse(items=[PricingItem.model_validate(item) for item in items])


@router.put("/pricing/{scan_type}", response_model=PricingItem)
async def update_pricing(
    request: Request,
    scan_type: str,
    body: PricingUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PricingItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    if scan_type not in ("ip", "domain", "apk", "ipa", "statushost"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid scan type")

    result = await db.execute(select(PricingConfig).where(PricingConfig.scan_type == scan_type))
    pricing = result.scalar_one_or_none()

    if pricing:
        pricing.credit_cost = body.credit_cost
        pricing.updated_at = datetime.now(UTC)
    else:
        pricing = PricingConfig(
            scan_type=scan_type,
            credit_cost=body.credit_cost,
        )
        db.add(pricing)

    await db.commit()
    await db.refresh(pricing)

    return PricingItem.model_validate(pricing)


_SKU_LIST: tuple[tuple[str, int, int], ...] = (
    ("basic", 300_000, 10),
    ("pro", 650_000, 24),
    ("multi", 2_000_000, 60),
)


def _month_bounds_utc() -> tuple[datetime, datetime]:
    now = datetime.now(UTC)
    start = datetime(now.year, now.month, 1, tzinfo=UTC)
    if now.month == 12:
        end = datetime(now.year + 1, 1, 1, tzinfo=UTC) - timedelta(microseconds=1)
    else:
        end = datetime(now.year, now.month + 1, 1, tzinfo=UTC) - timedelta(microseconds=1)
    return start, end


def _parse_report_range(from_date: date | None, to_date: date | None) -> tuple[datetime, datetime]:
    default_from, default_to = _month_bounds_utc()
    start = datetime.combine(from_date, time.min, tzinfo=UTC) if from_date else default_from
    end = datetime.combine(to_date, time.max.replace(microsecond=999999), tzinfo=UTC) if to_date else default_to
    if start > end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="from must be on or before to")
    return start, end


@router.get("/hpp", response_model=HppRateListResponse)
async def get_hpp_rates(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> HppRateListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    result = await db.execute(select(HppRate).order_by(HppRate.key))
    items = result.scalars().all()
    return HppRateListResponse(items=[HppRateItem.model_validate(item) for item in items])


@router.get("/hpp/report", response_model=HppReportResponse)
async def get_hpp_report(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
) -> HppReportResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    start, end = _parse_report_range(from_date, to_date)
    rates_result = await db.execute(select(HppRate))
    rates = {r.key: r.amount_idr for r in rates_result.scalars().all()}
    for k in HPP_KEYS:
        rates.setdefault(k, 0)

    overhead_result = await db.execute(select(HppOverhead).where(HppOverhead.id == HPP_OVERHEAD_SINGLETON_ID))
    overhead_row = overhead_result.scalar_one_or_none()
    singleton_overhead = int(overhead_row.amount_idr) if overhead_row else 0

    journal_result = await db.execute(
        select(HppCostLine.category, func.coalesce(func.sum(HppCostLine.amount_idr), 0))
        .where(
            HppCostLine.incurred_on >= start,
            HppCostLine.incurred_on <= end,
        )
        .group_by(HppCostLine.category)
    )
    journal_sums = {row[0]: int(row[1]) for row in journal_result.all()}
    journal_opex = journal_sums.get("opex", 0)
    journal_variable = journal_sums.get("variable", 0)
    overhead_idr = singleton_overhead + journal_opex + journal_variable

    job_counts_result = await db.execute(
        select(ScanJob.scan_type, func.count(ScanJob.id))
        .where(ScanJob.status == "completed", ScanJob.completed_at >= start, ScanJob.completed_at <= end)
        .group_by(ScanJob.scan_type)
    )
    job_counts = {row[0]: int(row[1]) for row in job_counts_result.all()}

    host_count_result = await db.execute(
        select(func.count(CreditLog.id)).where(
            CreditLog.type == "deduct",
            CreditLog.created_at >= start,
            CreditLog.created_at <= end,
            CreditLog.description.like("Status hostname:%"),
        )
    )
    statushost_count = int(host_count_result.scalar() or 0)

    hostscan_result = await db.execute(
        select(func.count(HostScan.id)).where(
            HostScan.status == "completed",
            HostScan.finished_at >= start,
            HostScan.finished_at <= end,
        )
    )
    hostscan_count = int(hostscan_result.scalar() or 0)

    counts: dict[str, int] = {}
    total_count = 0
    total_hpp = 0
    for key in HPP_KEYS:
        if key == "statushost":
            count = statushost_count
        elif key == "hostscan":
            count = hostscan_count
        else:
            count = job_counts.get(key, 0)
        counts[key] = count
        total_count += count
        total_hpp += count * rates[key]

    allocated = 0
    remaining_keys = [k for k in HPP_KEYS if counts[k] > 0]
    last_key = remaining_keys[-1] if remaining_keys else None
    share_by_key: dict[str, int] = {k: 0 for k in HPP_KEYS}
    if total_count > 0 and overhead_idr > 0:
        for key in remaining_keys:
            if key == last_key:
                share_by_key[key] = overhead_idr - allocated
            else:
                share = (overhead_idr * counts[key]) // total_count
                share_by_key[key] = share
                allocated += share

    lines: list[HppReportLine] = []
    total_fully = 0
    for key in HPP_KEYS:
        count = counts[key]
        rate = rates[key]
        hpp = count * rate
        share = share_by_key[key]
        fully = hpp + share
        unit = (fully // count) if count else 0
        lines.append(
            HppReportLine(
                key=key,
                count=count,
                rate_idr=rate,
                hpp_idr=hpp,
                overhead_share_idr=share,
                fully_loaded_hpp_idr=fully,
                fully_loaded_unit_idr=unit,
            )
        )
        total_fully += fully

    unallocated = overhead_idr if total_count == 0 else 0

    pricing_result = await db.execute(select(PricingConfig))
    credit_cost = {p.scan_type: p.credit_cost for p in pricing_result.scalars().all()}
    ip_credits = max(int(credit_cost.get("ip") or 0), 0)
    domain_credits = max(int(credit_cost.get("domain") or 0), 0)
    ip_rate = rates["ip"]
    domain_rate = rates["domain"]

    sku_estimates: list[HppSkuEstimate] = []
    for sku, list_idr, credits in _SKU_LIST:
        ip_jobs = (credits // ip_credits) if ip_credits else None
        domain_jobs = (credits // domain_credits) if domain_credits else None
        hpp_ip = (ip_jobs * ip_rate) if ip_jobs is not None else None
        hpp_domain = (domain_jobs * domain_rate) if domain_jobs is not None else None
        margin_ip = (list_idr - hpp_ip) if hpp_ip is not None else None
        margin_domain = (list_idr - hpp_domain) if hpp_domain is not None else None
        sku_estimates.append(
            HppSkuEstimate(
                sku=sku,
                list_idr=list_idr,
                credits_per_month=credits,
                label="estimasi",
                hpp_if_all_ip_idr=hpp_ip,
                hpp_if_all_domain_idr=hpp_domain,
                margin_if_all_ip_idr=margin_ip,
                margin_if_all_domain_idr=margin_domain,
                margin_if_all_ip_pct=(
                    round(margin_ip * 100 / list_idr) if margin_ip is not None and list_idr else None
                ),
                margin_if_all_domain_pct=(
                    round(margin_domain * 100 / list_idr) if margin_domain is not None and list_idr else None
                ),
            )
        )

    return HppReportResponse(
        from_date=start,
        to_date=end,
        lines=lines,
        total_count=total_count,
        total_hpp_idr=total_hpp,
        overhead_idr=overhead_idr,
        journal_opex_idr=journal_opex,
        journal_variable_idr=journal_variable,
        total_fully_loaded_hpp_idr=total_fully,
        unallocated_overhead_idr=unallocated,
        sku_estimates=sku_estimates,
    )


@router.get("/hpp/overhead", response_model=HppOverheadItem)
async def get_hpp_overhead(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> HppOverheadItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    result = await db.execute(select(HppOverhead).where(HppOverhead.id == HPP_OVERHEAD_SINGLETON_ID))
    row = result.scalar_one_or_none()
    if row is None:
        now = datetime.now(UTC)
        row = HppOverhead(id=HPP_OVERHEAD_SINGLETON_ID, amount_idr=0, updated_at=now)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return HppOverheadItem.model_validate(row)


@router.put("/hpp/overhead", response_model=HppOverheadItem)
async def update_hpp_overhead(
    request: Request,
    body: HppOverheadUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> HppOverheadItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    result = await db.execute(select(HppOverhead).where(HppOverhead.id == HPP_OVERHEAD_SINGLETON_ID))
    row = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if row:
        row.amount_idr = body.amount_idr
        row.updated_at = now
        row.updated_by = current_admin.id
    else:
        row = HppOverhead(
            id=HPP_OVERHEAD_SINGLETON_ID,
            amount_idr=body.amount_idr,
            updated_at=now,
            updated_by=current_admin.id,
        )
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return HppOverheadItem.model_validate(row)


@router.get("/hpp/costs", response_model=HppCostLineListResponse)
async def list_hpp_costs(
    request: Request,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
) -> HppCostLineListResponse | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    start, end = _parse_report_range(from_date, to_date)
    result = await db.execute(
        select(HppCostLine)
        .where(HppCostLine.incurred_on >= start, HppCostLine.incurred_on <= end)
        .order_by(HppCostLine.incurred_on.desc(), HppCostLine.created_at.desc())
    )
    items = result.scalars().all()
    return HppCostLineListResponse(items=[HppCostLineItem.model_validate(item) for item in items])


@router.post("/hpp/costs", response_model=HppCostLineItem, status_code=status.HTTP_201_CREATED)
async def create_hpp_cost(
    request: Request,
    body: HppCostLineCreateRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> HppCostLineItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    if body.category not in HPP_COST_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid category")
    now = datetime.now(UTC)
    incurred = datetime.combine(body.incurred_on, time.min, tzinfo=UTC)
    row = HppCostLine(
        incurred_on=incurred,
        amount_idr=body.amount_idr,
        category=body.category,
        note=body.note.strip(),
        created_at=now,
        created_by=current_admin.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return HppCostLineItem.model_validate(row)


@router.delete("/hpp/costs/{line_id}", status_code=204)
async def delete_hpp_cost(
    request: Request,
    line_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    limit_response = await admin_limiter(request)
    if limit_response:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")
    result = await db.execute(select(HppCostLine).where(HppCostLine.id == line_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cost line not found")
    await db.delete(row)
    await db.commit()


@router.put("/hpp/{key}", response_model=HppRateItem)
async def update_hpp_rate(
    request: Request,
    key: str,
    body: HppRateUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> HppRateItem | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    if key not in HPP_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid HPP key")
    result = await db.execute(select(HppRate).where(HppRate.key == key))
    row = result.scalar_one_or_none()
    now = datetime.now(UTC)
    if row:
        row.amount_idr = body.amount_idr
        row.updated_at = now
        row.updated_by = current_admin.id
    else:
        row = HppRate(key=key, amount_idr=body.amount_idr, updated_at=now, updated_by=current_admin.id)
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return HppRateItem.model_validate(row)


@router.get("/email-logs", response_model=EmailSendLogList)
async def list_email_send_logs(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    kind: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailSendLogList | Response:
    limit_response = await admin_limiter(request)
    if limit_response:
        return limit_response
    filters = []
    if kind:
        if kind not in EMAIL_SEND_KINDS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid kind")
        filters.append(EmailSendLog.kind == kind)
    if status_filter:
        if status_filter not in EMAIL_SEND_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
        filters.append(EmailSendLog.status == status_filter)
    count_q = select(func.count(EmailSendLog.id))
    list_q = select(EmailSendLog)
    if filters:
        count_q = count_q.where(*filters)
        list_q = list_q.where(*filters)
    total = (await db.execute(count_q)).scalar() or 0
    list_q = list_q.order_by(EmailSendLog.created_at.desc())
    list_q = list_q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(list_q)).scalars().all()
    return EmailSendLogList(
        items=[EmailSendLogItem.model_validate(r) for r in rows],
        total=total,
    )
