from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingRecipient, OrgBillingProfile
from app.schemas.billing_profile import (
    BillingProfileResponse,
    BillingProfileUpdate,
    BillingRecipientCreate,
    BillingRecipientItem,
)


def _now() -> datetime:
    return datetime.now(UTC)


async def get_profile(db: AsyncSession, org_id: UUID) -> OrgBillingProfile | None:
    return await db.get(OrgBillingProfile, org_id)


async def list_recipients(db: AsyncSession, org_id: UUID) -> list[BillingRecipient]:
    rows = await db.execute(
        select(BillingRecipient)
        .where(
            BillingRecipient.organization_id == org_id,
            BillingRecipient.disabled_at.is_(None),
        )
        .order_by(BillingRecipient.is_primary.desc(), BillingRecipient.created_at)
    )
    return list(rows.scalars().all())


async def upsert_profile(
    db: AsyncSession,
    org_id: UUID,
    data: BillingProfileUpdate,
) -> OrgBillingProfile:
    profile = await get_profile(db, org_id)
    values = data.model_dump()
    if profile is None:
        profile = OrgBillingProfile(organization_id=org_id, **values)
        db.add(profile)
    else:
        for key, value in values.items():
            setattr(profile, key, value)
        profile.updated_at = _now()
    await db.commit()
    await db.refresh(profile)
    return profile


async def add_recipient(
    db: AsyncSession,
    org_id: UUID,
    data: BillingRecipientCreate,
) -> BillingRecipient:
    existing = (
        await db.execute(
            select(BillingRecipient).where(
                BillingRecipient.organization_id == org_id,
                BillingRecipient.email == data.email,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        if existing.disabled_at is None:
            raise HTTPException(status_code=409, detail="Recipient already exists")
        existing.disabled_at = None
        existing.kind = data.kind
        existing.updated_at = _now()
        recipient = existing
    else:
        current = await list_recipients(db, org_id)
        billing_count = sum(1 for row in current if row.kind == "billing")
        make_primary = data.is_primary or (data.kind == "billing" and billing_count == 0)
        if make_primary:
            for row in current:
                row.is_primary = False
        recipient = BillingRecipient(
            organization_id=org_id,
            email=data.email,
            kind=data.kind,
            is_primary=make_primary,
        )
        db.add(recipient)

    await db.commit()
    await db.refresh(recipient)
    return recipient


async def remove_recipient(db: AsyncSession, org_id: UUID, recipient_id: UUID) -> None:
    recipient = await db.get(BillingRecipient, recipient_id)
    if recipient is None or recipient.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Recipient not found")
    if recipient.disabled_at is not None:
        return
    recipient.disabled_at = _now()
    recipient.is_primary = False
    recipient.updated_at = _now()

    if recipient.kind == "billing":
        remaining = [row for row in await list_recipients(db, org_id) if row.id != recipient.id]
        if remaining and not any(row.is_primary for row in remaining):
            remaining[0].is_primary = True

    await db.commit()


def to_response(
    org_id: UUID,
    profile: OrgBillingProfile | None,
    recipients: list[BillingRecipient],
) -> BillingProfileResponse:
    if profile is None:
        return BillingProfileResponse(
            organization_id=org_id,
            legal_name="",
            tax_id="",
            nitku="",
            address_line1="",
            address_line2="",
            city="",
            province="",
            postal_code="",
            country="ID",
            billing_email="",
            po_required=False,
            po_number="",
            payment_terms_days=0,
            pkp_status="unknown",
            recipients=[BillingRecipientItem.model_validate(row) for row in recipients],
        )
    return BillingProfileResponse(
        organization_id=org_id,
        legal_name=profile.legal_name,
        tax_id=profile.tax_id,
        nitku=profile.nitku,
        address_line1=profile.address_line1,
        address_line2=profile.address_line2,
        city=profile.city,
        province=profile.province,
        postal_code=profile.postal_code,
        country=profile.country,
        billing_email=profile.billing_email,
        po_required=profile.po_required,
        po_number=profile.po_number,
        payment_terms_days=profile.payment_terms_days,
        pkp_status=profile.pkp_status,
        recipients=[BillingRecipientItem.model_validate(row) for row in recipients],
    )


__all__ = [
    "add_recipient",
    "get_profile",
    "list_recipients",
    "remove_recipient",
    "to_response",
    "upsert_profile",
]
