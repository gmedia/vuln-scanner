import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.credit_log import CreditLog
from app.models.pricing import PricingConfig
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob
from app.models.user import User
from app.schemas.admin import (
    AdminStats,
    AdminUserItem,
    AdminUserList,
    CreditUpdateRequest,
    PricingItem,
    PricingListResponse,
    PricingUpdateRequest,
)
from app.services.auth import get_current_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStats)
async def get_stats(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminStats:
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
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str = Query(default=""),
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserList:
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
            )
        )

    return AdminUserList(users=user_items, total=total)


@router.get("/users/{user_id}", response_model=AdminUserItem)
async def get_user_detail(
    user_id: uuid.UUID,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserItem:
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
    )


@router.post("/users/{user_id}/credits", response_model=AdminUserItem)
async def adjust_user_credits(
    user_id: uuid.UUID,
    body: CreditUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserItem:
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
    )


@router.get("/pricing", response_model=PricingListResponse)
async def get_pricing(
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PricingListResponse:
    result = await db.execute(select(PricingConfig).order_by(PricingConfig.scan_type))
    items = result.scalars().all()
    return PricingListResponse(items=[PricingItem.model_validate(item) for item in items])


@router.put("/pricing/{scan_type}", response_model=PricingItem)
async def update_pricing(
    scan_type: str,
    body: PricingUpdateRequest,
    current_admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> PricingItem:
    if scan_type not in ("ip", "domain", "apk", "ipa"):
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
