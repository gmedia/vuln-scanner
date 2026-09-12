from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.credit_log import CreditLog
from app.models.user import User
from app.schemas.credit import (
    CreditHistoryResponse,
    CreditInfo,
    CreditLogItem,
    ScanEligibility,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/credits", tags=["credits"])


@router.get("/balance", response_model=CreditInfo)
async def get_balance(current_user: User = Depends(get_current_user)) -> CreditInfo:
    """Return current user's credit balance and admin status."""
    return CreditInfo(credits=current_user.credits, is_admin=current_user.is_admin)


@router.get("/history", response_model=CreditHistoryResponse)
async def get_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CreditHistoryResponse:
    """Return paginated credit transaction history for the current user."""
    count_query = select(func.count(CreditLog.id)).where(CreditLog.user_id == current_user.id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(CreditLog)
        .where(CreditLog.user_id == current_user.id)
        .order_by(CreditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    items = result.scalars().all()

    return CreditHistoryResponse(
        items=[CreditLogItem.model_validate(item) for item in items],
        total=total,
    )


@router.get("/eligibility/{scan_type}", response_model=ScanEligibility)
async def get_scan_eligibility(
    scan_type: str,
    current_user: User = Depends(get_current_user),
) -> ScanEligibility:
    """Check whether the current user has enough credits for a given scan type."""
    if scan_type not in settings.scan_type_pricing_map:
        raise HTTPException(status_code=400, detail=f"Invalid scan type: {scan_type}")

    return ScanEligibility(
        eligible=True,
        required_credits=0,
        current_credits=current_user.credits,
        scan_type=scan_type,
    )
