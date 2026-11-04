"""InvoiceService x promo: exact math, 100% auto-settle, quota and rollback."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import OrgBillingProfile, PaymentAttempt, Subscription
from app.models.invoice import OrgInvoice
from app.models.organization import Organization, OrganizationMembership
from app.models.promo import PromoCode, PromoRedemption
from app.models.user import User
from app.schemas.promo import PromoCodeCreate
from app.services.auth import hash_password
from app.services.invoice import InvoiceService
from app.services.promo import PromoService


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=100,
    )
    db.add(user)
    await db.flush()
    return user

async def _make_org(db: AsyncSession, owner: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Invoice Promo Org",
        slug=f"inv-promo-{uuid.uuid4().hex[:8]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db.add(org)
    await db.flush()
    db.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=org.id,
            user_id=owner.id,
            role="owner",
        )
    )
    await db.commit()
    return org

def _body(code: str, **overrides: Any) -> PromoCodeCreate:
    values: dict[str, Any] = {
        "code": code,
        "description": "Invoice promo",
        "kind": "percent",
        "percent_off_bp": 1000,
        "min_amount_idr": 0,
        "max_redemptions_per_org": 1,
    }
    values.update(overrides)
    return PromoCodeCreate(**values)

@pytest.mark.asyncio
async def test_non_pkp_invoice_with_promo(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "inv-promo-1@example.com")
    org = await _make_org(db_session, admin)
    promo = await PromoService(db_session).create(_body("INVSCAN2026"), admin)

    invoice = await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code="invscan2026",
    )
    assert invoice.amount_idr == 300_000
    assert invoice.discount_idr == 30_000
    assert invoice.promo_code == "INVSCAN2026"
    assert invoice.dpp_idr == 270_000
    assert invoice.ppn_idr == 0
    assert invoice.pph23_idr == 0
    assert invoice.total_idr == 270_000
    redemption = await db_session.scalar(
        select(PromoRedemption).where(PromoRedemption.invoice_id == invoice.id)
    )
    assert redemption is not None
    assert redemption.promo_code_id == promo.id

@pytest.mark.asyncio
async def test_pkp_invoice_with_promo_exact_tax(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "inv-promo-pkp@example.com")
    org = await _make_org(db_session, admin)
    db_session.add(OrgBillingProfile(organization_id=org.id, pkp_status="pkp"))
    await db_session.commit()
    await PromoService(db_session).create(_body("INVPKP2026"), admin)

    invoice = await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code="INVPKP2026",
    )
    assert invoice.amount_idr == 300_000
    assert invoice.discount_idr == 30_000
    assert invoice.dpp_idr == 247_500
    assert invoice.ppn_idr == 29_700
    assert invoice.pph23_idr == 5_400
    assert invoice.total_idr == 299_700

@pytest.mark.asyncio
async def test_hundred_percent_promo_auto_settles(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "inv-promo-100@example.com")
    org = await _make_org(db_session, admin)
    await PromoService(db_session).create(
        _body(
            "FULLFREE2026",
            kind="fixed",
            percent_off_bp=None,
            amount_idr=300_000,
        ),
        admin,
    )

    invoice = await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code="FULLFREE2026",
    )
    assert invoice.total_idr == 0
    assert invoice.discount_idr == 300_000
    assert invoice.status == "paid"
    assert invoice.paid_at is not None

    subscription = await db_session.scalar(
        select(Subscription).where(Subscription.organization_id == org.id)
    )
    assert subscription is not None
    assert subscription.status == "active"
    assert subscription.provider == "promo"

    attempt = await db_session.scalar(
        select(PaymentAttempt).where(PaymentAttempt.invoice_id == invoice.id)
    )
    assert attempt is not None
    assert attempt.amount_idr == 0
    assert attempt.provider == "promo"
    assert attempt.method == "promo"
    assert attempt.status == "succeeded"

@pytest.mark.asyncio
async def test_duplicate_period_conflict_does_not_consume_quota(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "inv-promo-dup@example.com")
    org = await _make_org(db_session, admin)
    await PromoService(db_session).create(
        _body("DUPPERIOD2026", max_redemptions=2, max_redemptions_per_org=2), admin
    )
    invoices = InvoiceService(db_session)
    await invoices.create_invoice(
        organization_id=org.id, sku="basic", actor=admin, promo_code="DUPPERIOD2026"
    )
    with pytest.raises(HTTPException) as conflict:
        await invoices.create_invoice(
            organization_id=org.id,
            sku="basic",
            actor=admin,
            promo_code="DUPPERIOD2026",
        )
    assert conflict.value.status_code == 409
    applied = await db_session.scalar(
        select(func.count())
        .select_from(PromoRedemption)
        .where(PromoRedemption.status == "applied")
    )
    assert applied == 1

@pytest.mark.asyncio
async def test_void_releases_and_allows_reuse(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "inv-promo-void@example.com")
    org = await _make_org(db_session, admin)
    await PromoService(db_session).create(
        _body("VOIDREUSE2026", max_redemptions=1), admin
    )
    invoices = InvoiceService(db_session)
    first = await invoices.create_invoice(
        organization_id=org.id, sku="basic", actor=admin, promo_code="VOIDREUSE2026"
    )
    await invoices.void(first.id)
    released = await db_session.scalar(
        select(PromoRedemption).where(PromoRedemption.invoice_id == first.id)
    )
    assert released is not None
    assert released.status == "released"
    second = await invoices.create_invoice(
        organization_id=org.id, sku="basic", actor=admin, promo_code="VOIDREUSE2026"
    )
    assert second.id != first.id
    assert second.discount_idr == 30_000

@pytest.mark.asyncio
async def test_annual_with_promo_is_rejected(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "inv-promo-annual@example.com")
    org = await _make_org(db_session, admin)
    await PromoService(db_session).create(_body("ANNUALNO2026"), admin)
    with pytest.raises(HTTPException) as rejected:
        await InvoiceService(db_session).create_invoice(
            organization_id=org.id,
            sku="basic",
            actor=admin,
            cycle="annual",
            promo_code="ANNUALNO2026",
        )
    assert rejected.value.status_code == 400

@pytest.mark.asyncio
async def test_redemption_failure_rolls_back_invoice(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = await _make_user(db_session, "inv-promo-rollback@example.com")
    org = await _make_org(db_session, admin)
    org_id = org.id
    await PromoService(db_session).create(_body("ROLLBACK2026"), admin)

    async def boom(self: PromoService, *args: Any, **kwargs: Any) -> None:
        raise RuntimeError("redemption failed")

    monkeypatch.setattr(PromoService, "record_redemption", boom)
    with pytest.raises(RuntimeError):
        await InvoiceService(db_session).create_invoice(
            organization_id=org_id,
            sku="basic",
            actor=admin,
            promo_code="ROLLBACK2026",
        )
    invoices = await db_session.scalar(
        select(func.count())
        .select_from(OrgInvoice)
        .where(OrgInvoice.organization_id == org_id)
    )
    redemptions = await db_session.scalar(
        select(func.count()).select_from(PromoRedemption)
    )
    assert invoices == 0
    assert redemptions == 0
    assert await db_session.scalar(select(func.count()).select_from(PromoCode)) == 1
