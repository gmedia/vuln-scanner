from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.organization import Organization
from app.models.user import User
from app.schemas.billing_profile import (
    BillingProfileResponse,
    BillingProfileUpdate,
    BillingRecipientCreate,
    BillingRecipientItem,
)
from app.services.auth import get_current_user
from app.services.billing_profile import (
    add_recipient,
    get_profile,
    list_recipients,
    remove_recipient,
    to_response,
    upsert_profile,
)
from app.services.organization import require_membership

router = APIRouter(tags=["billing-profile"])


async def _assert_org(db: AsyncSession, org_id: UUID) -> None:
    if await db.get(Organization, org_id) is None:
        raise HTTPException(status_code=404, detail="Organization not found")


@router.get("/orgs/{org_id}/billing-profile", response_model=BillingProfileResponse)
async def read_billing_profile(
    org_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillingProfileResponse:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    await _assert_org(db, org_id)
    profile = await get_profile(db, org_id)
    recipients = await list_recipients(db, org_id)
    return to_response(org_id, profile, recipients)


@router.put("/orgs/{org_id}/billing-profile", response_model=BillingProfileResponse)
async def write_billing_profile(
    org_id: UUID,
    body: BillingProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillingProfileResponse:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    await _assert_org(db, org_id)
    profile = await upsert_profile(db, org_id, body)
    recipients = await list_recipients(db, org_id)
    return to_response(org_id, profile, recipients)


@router.post(
    "/orgs/{org_id}/billing-recipients",
    response_model=BillingRecipientItem,
    status_code=201,
)
async def create_billing_recipient(
    org_id: UUID,
    body: BillingRecipientCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillingRecipientItem:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    await _assert_org(db, org_id)
    recipient = await add_recipient(db, org_id, body)
    return BillingRecipientItem.model_validate(recipient)


@router.delete("/orgs/{org_id}/billing-recipients/{recipient_id}", status_code=204)
async def delete_billing_recipient(
    org_id: UUID,
    recipient_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await require_membership(db, org_id, current_user.id, min_role="admin")
    await remove_recipient(db, org_id, recipient_id)
