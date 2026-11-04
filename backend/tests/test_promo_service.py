"""PromoCodeService: validation rules, immutability, quota and request linkage."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization, OrganizationMembership
from app.models.promo import PromoCode, PromoCodeHistory, PromoRedemption
from app.models.subscription import SubscriptionRequest
from app.models.user import User
from app.schemas.promo import PromoCodeCreate, PromoCodeUpdate
from app.services.auth import hash_password
from app.services.invoice import InvoiceService
from app.services.promo import PromoService


async def _make_user(db: AsyncSession, email: str, *, admin: bool = True) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=admin,
        credits=100,
    )
    db.add(user)
    await db.flush()
    return user

async def _make_org(db: AsyncSession, owner: User, *, sku: str = "basic") -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name=f"Promo Org {uuid.uuid4().hex[:6]}",
        slug=f"promo-org-{uuid.uuid4().hex[:8]}",
        kind="company",
        sku=sku,
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

def _promo_body(code: str = "LAUNCH2026", **overrides: Any) -> PromoCodeCreate:
    values: dict[str, Any] = {
        "code": code,
        "description": "Launch discount",
        "kind": "percent",
        "percent_off_bp": 1000,
        "amount_idr": None,
        "min_amount_idr": 0,
        "max_discount_idr": None,
        "applies_to_sku": None,
        "applies_to_product": None,
        "starts_at": None,
        "ends_at": None,
        "max_redemptions": None,
        "max_redemptions_per_org": 1,
    }
    values.update(overrides)
    return PromoCodeCreate(**values)

def _validate(
    service: PromoService,
    promo: PromoCode,
    org: Organization,
    *,
    product: str = "scan",
    sku: str = "basic",
    cycle: str = "monthly",
    base: int = 300_000,
    now: datetime | None = None,
):
    return service.validate(
        promo.code,
        product=product,
        sku=sku,
        cycle=cycle,
        base_list_idr=base,
        org_id=org.id,
        now=now or datetime.now(UTC),
    )

@pytest.mark.asyncio
async def test_create_normalizes_code_and_writes_history(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "promo-create@example.com")
    promo = await PromoService(db_session).create(_promo_body("launch2026"), admin)
    assert promo.code == "LAUNCH2026"
    rows = (
        await db_session.execute(
            select(PromoCodeHistory).where(PromoCodeHistory.promo_code_id == promo.id)
        )
    ).scalars().all()
    assert [row.action for row in rows] == ["created"]

@pytest.mark.asyncio
async def test_invalid_pattern_is_rejected_at_schema_and_service(
    db_session: AsyncSession,
) -> None:
    with pytest.raises(ValidationError):
        _promo_body("BAD")
    admin = await _make_user(db_session, "promo-bad@example.com")
    org = await _make_org(db_session, admin)
    with pytest.raises(HTTPException) as bad:
        await PromoService(db_session).validate(
            "bad",
            product="scan",
            sku="basic",
            cycle="monthly",
            base_list_idr=300_000,
            org_id=org.id,
            now=datetime.now(UTC),
        )
    assert bad.value.status_code == 400

@pytest.mark.asyncio
async def test_window_works_with_naive_sqlite_datetimes(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "promo-window@example.com")
    org = await _make_org(db_session, admin)
    now = datetime.now(UTC)
    promo = await PromoService(db_session).create(
        _promo_body(
            "WINDOW2026",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=1),
        ),
        admin,
    )
    await db_session.refresh(promo)
    # SQLite returns naive datetimes; the service must normalize with as_utc.
    quote = await _validate(PromoService(db_session), promo, org, now=now)
    assert quote.discount_idr == 30_000

    with pytest.raises(HTTPException) as expired:
        await _validate(
            PromoService(db_session), promo, org, now=now + timedelta(days=3)
        )
    assert expired.value.status_code == 400

@pytest.mark.asyncio
async def test_product_sku_scope_min_amount_and_annual(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "promo-scope@example.com")
    org = await _make_org(db_session, admin)
    service = PromoService(db_session)
    host_only = await service.create(
        _promo_body("HOSTONLY2026", applies_to_product="host"), admin
    )
    with pytest.raises(HTTPException):
        await _validate(service, host_only, org, product="scan")
    assert (await _validate(service, host_only, org, product="host", base=150_000)).discount_idr == 15_000

    sku_only = await service.create(
        _promo_body("PROONLY2026", applies_to_sku="pro"), admin
    )
    with pytest.raises(HTTPException):
        await _validate(service, sku_only, org, sku="basic")
    assert (await _validate(service, sku_only, org, sku="pro", base=650_000)).discount_idr == 65_000

    high_min = await service.create(
        _promo_body("HIGHMIN2026", min_amount_idr=400_000), admin
    )
    with pytest.raises(HTTPException):
        await _validate(service, high_min, org, base=300_000)

    with pytest.raises(HTTPException):
        await _validate(service, host_only, org, product="host", cycle="annual", base=150_000)

@pytest.mark.asyncio
async def test_total_and_per_org_limits(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "promo-limits@example.com")
    org_one = await _make_org(db_session, admin)
    org_two = await _make_org(db_session, admin)
    service = PromoService(db_session)
    promo = await service.create(_promo_body("LIMITED2026", max_redemptions=1), admin)

    await InvoiceService(db_session).create_invoice(
        organization_id=org_one.id,
        sku="basic",
        actor=admin,
        promo_code=promo.code,
    )
    with pytest.raises(HTTPException):
        await _validate(service, promo, org_one)
    with pytest.raises(HTTPException):
        await _validate(service, promo, org_two)

@pytest.mark.asyncio
async def test_per_org_limit_blocks_second_purchase_for_same_org(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "promo-perorg@example.com")
    org = await _make_org(db_session, admin)
    service = PromoService(db_session)
    promo = await service.create(
        _promo_body("PERORG2026", max_redemptions=5, max_redemptions_per_org=1), admin
    )
    await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code=promo.code,
    )
    with pytest.raises(HTTPException) as blocked:
        await _validate(service, promo, org, product="host", base=150_000)
    assert blocked.value.status_code == 400

@pytest.mark.asyncio
async def test_code_and_terms_are_immutable_after_redemption(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "promo-immutable@example.com")
    org = await _make_org(db_session, admin)
    service = PromoService(db_session)
    promo = await service.create(_promo_body("LOCKED2026"), admin)

    with pytest.raises(HTTPException) as code_change:
        await service.update(
            promo.id, PromoCodeUpdate(code="OTHERCODE2026"), admin
        )
    assert code_change.value.status_code == 409

    await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code=promo.code,
    )
    with pytest.raises(HTTPException) as term_change:
        await service.update(promo.id, PromoCodeUpdate(percent_off_bp=2000), admin)
    assert term_change.value.status_code == 409
    assert "percent_off_bp" in term_change.value.detail

    updated = await service.update(
        promo.id, PromoCodeUpdate(description="Still editable"), admin
    )
    assert updated.description == "Still editable"

@pytest.mark.asyncio
async def test_delete_is_blocked_by_redemptions(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "promo-delete@example.com")
    org = await _make_org(db_session, admin)
    service = PromoService(db_session)
    promo = await service.create(_promo_body("DELETE2026"), admin)
    await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code=promo.code,
    )
    with pytest.raises(HTTPException) as blocked:
        await service.delete(promo.id, admin)
    assert blocked.value.status_code == 409

@pytest.mark.asyncio
async def test_release_returns_quota(db_session: AsyncSession) -> None:
    admin = await _make_user(db_session, "promo-release@example.com")
    org = await _make_org(db_session, admin)
    service = PromoService(db_session)
    promo = await service.create(_promo_body("RELEASE2026", max_redemptions=1), admin)
    invoices = InvoiceService(db_session)
    first = await invoices.create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code=promo.code,
    )
    with pytest.raises(HTTPException):
        await _validate(service, promo, org)
    await invoices.void(first.id)
    redemption = await db_session.scalar(
        select(PromoRedemption).where(PromoRedemption.invoice_id == first.id)
    )
    assert redemption is not None
    assert redemption.status == "released"
    assert redemption.released_at is not None
    assert (await _validate(service, promo, org)).discount_idr == 30_000
    await invoices.create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code=promo.code,
    )

@pytest.mark.asyncio
async def test_subscription_request_linkage_is_org_scoped_and_single_use(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "promo-request@example.com")
    org_one = await _make_org(db_session, admin)
    org_two = await _make_org(db_session, admin)
    promo = await PromoService(db_session).create(
        _promo_body("REQUEST2026", max_redemptions=5, max_redemptions_per_org=5), admin
    )

    foreign = SubscriptionRequest(
        id=uuid.uuid4(),
        organization_id=org_two.id,
        requested_by_user_id=admin.id,
        direction="upgrade",
        current_sku="basic",
        target_sku="pro",
        cycle="monthly",
        status="pending",
    )
    own = SubscriptionRequest(
        id=uuid.uuid4(),
        organization_id=org_one.id,
        requested_by_user_id=admin.id,
        direction="upgrade",
        current_sku="basic",
        target_sku="pro",
        cycle="monthly",
        status="approved",
    )
    db_session.add_all([foreign, own])
    await db_session.commit()

    invoices = InvoiceService(db_session)
    with pytest.raises(HTTPException) as wrong_org:
        await invoices.create_invoice(
            organization_id=org_one.id,
            sku="basic",
            actor=admin,
            promo_code=promo.code,
            subscription_request_id=foreign.id,
        )
    assert wrong_org.value.status_code == 404

    await invoices.create_invoice(
        organization_id=org_one.id,
        sku="basic",
        actor=admin,
        promo_code=promo.code,
        subscription_request_id=own.id,
    )
    with pytest.raises(HTTPException) as reused:
        await invoices.create_invoice(
            organization_id=org_one.id,
            product="host",
            sku="basic",
            actor=admin,
            promo_code=promo.code,
            subscription_request_id=own.id,
        )
    assert reused.value.status_code == 409, reused.value.detail
    assert await db_session.scalar(
        select(func.count()).select_from(PromoRedemption)
    ) == 1

@pytest.mark.asyncio
async def test_has_active_codes_honors_window_and_limits(
    db_session: AsyncSession,
) -> None:
    admin = await _make_user(db_session, "promo-active@example.com")
    org = await _make_org(db_session, admin)
    service = PromoService(db_session)
    now = datetime.now(UTC)
    assert await service.has_active_codes(org.id) is False

    promo = await service.create(
        _promo_body(
            "ACTIVE2026",
            starts_at=now - timedelta(days=1),
            ends_at=now + timedelta(days=1),
            max_redemptions=1,
        ),
        admin,
    )
    assert await service.has_active_codes(org.id) is True

    await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="basic",
        actor=admin,
        promo_code=promo.code,
    )
    assert await service.has_active_codes(org.id) is False

    fresh = await service.create(
        _promo_body("FUTURE2026", starts_at=now + timedelta(days=2)), admin
    )
    assert await service.has_active_codes(org.id) is False
    await service.deactivate(fresh.id, admin)
    assert await service.has_active_codes(org.id) is False
