from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.schemas.subscription import (
    SubscriptionOverviewResponse,
    SubscriptionRequestCreate,
    SubscriptionRequestItem,
)
from app.services.auth import get_current_user
from app.services.organization import require_membership
from app.services.subscription import SubscriptionService

router = APIRouter(tags=["subscription"])


async def _org_for(db: AsyncSession, org_id: UUID) -> Organization:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("/orgs/{org_id}/subscription", response_model=SubscriptionOverviewResponse)
async def get_subscription(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionOverviewResponse:
    membership = await require_membership(db, org_id, current_user.id, min_role="viewer")
    org = await _org_for(db, org_id)
    return await SubscriptionService(db).overview(org, membership.role)


@router.post(
    "/orgs/{org_id}/subscription/requests",
    response_model=SubscriptionRequestItem,
    status_code=201,
)
async def create_subscription_request(
    org_id: UUID,
    body: SubscriptionRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubscriptionRequestItem:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    org = await _org_for(db, org_id)
    return await SubscriptionService(db).create_request(
        org,
        current_user,
        target_sku=body.target_sku,
        cycle=body.cycle,
        note=body.note,
    )


@router.delete("/orgs/{org_id}/subscription/requests/{request_id}", status_code=204)
async def cancel_subscription_request(
    org_id: UUID,
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    await SubscriptionService(db).cancel_request(org_id, request_id)
