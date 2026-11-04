"""Customer promo plumbing: authorization, request storage, approval vs invoice."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.organization import Organization, OrganizationMembership
from app.models.promo import PromoRedemption
from app.models.subscription import SubscriptionRequest
from app.models.user import User
from app.schemas.promo import PromoCodeCreate
from app.services.auth import create_access_token, hash_password
from app.services.invoice import InvoiceService
from app.services.promo import PromoService
from app.services.subscription import SubscriptionService


def _auth(user: User, org_id: uuid.UUID | None = None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}

def _bind(db: AsyncSession) -> None:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db

async def _make_user(db: AsyncSession, email: str, *, admin: bool = False) -> User:
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

async def _make_org(
    db: AsyncSession, owner: User, *, role: str = "owner", sku: str = "basic"
) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Subscription Promo Org",
        slug=f"sub-promo-{uuid.uuid4().hex[:8]}",
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
            role=role,
        )
    )
    await db.commit()
    return org

def _body(code: str, **overrides: Any) -> PromoCodeCreate:
    values: dict[str, Any] = {
        "code": code,
        "description": "Subscription promo",
        "kind": "percent",
        "percent_off_bp": 1000,
        "min_amount_idr": 0,
        "max_redemptions_per_org": 5,
    }
    values.update(overrides)
    return PromoCodeCreate(**values)

@pytest.mark.asyncio
async def test_viewer_cannot_validate(db_session: AsyncSession) -> None:
    viewer = await _make_user(db_session, "sub-promo-viewer@example.com")
    org = await _make_org(db_session, viewer, role="viewer")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{org.id}/promo-codes/validate",
                headers=_auth(viewer, org.id),
                json={"code": "VIEWER2026", "target_sku": "pro", "cycle": "monthly"},
            )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_admin_validate_reports_discount(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "sub-promo-owner@example.com")
    org = await _make_org(db_session, owner)
    await PromoService(db_session).create(_body("CUSTOMER2026"), owner)
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/orgs/{org.id}/promo-codes/validate",
                headers=_auth(owner, org.id),
                json={
                    "code": "customer2026",
                    "target_sku": "pro",
                    "cycle": "monthly",
                },
            )
            assert response.status_code == 200, response.text
            assert response.json() == {
                "valid": True,
                "description": "Subscription promo",
                "discount_idr": 65_000,
                "total_idr": 585_000,
            }
            annual = await client.post(
                f"/api/orgs/{org.id}/promo-codes/validate",
                headers=_auth(owner, org.id),
                json={
                    "code": "CUSTOMER2026",
                    "target_sku": "pro",
                    "cycle": "annual",
                },
            )
            assert annual.status_code == 400
    finally:
        app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_request_stores_normalized_code(db_session: AsyncSession) -> None:
    owner = await _make_user(db_session, "sub-promo-store@example.com")
    org = await _make_org(db_session, owner)
    await PromoService(db_session).create(_body("STORECODE2026"), owner)

    item = await SubscriptionService(db_session).create_request(
        org,
        owner,
        target_sku="pro",
        cycle="monthly",
        note="",
        promo_code="storecode2026",
    )
    assert item.promo_code == "STORECODE2026"
    stored = await db_session.get(SubscriptionRequest, item.id)
    assert stored is not None
    assert stored.promo_code == "STORECODE2026"

@pytest.mark.asyncio
async def test_approval_does_not_consume_but_invoice_does(
    db_session: AsyncSession,
) -> None:
    owner = await _make_user(db_session, "sub-promo-approve@example.com")
    admin = await _make_user(db_session, "sub-promo-admin@example.com", admin=True)
    org = await _make_org(db_session, owner)
    await PromoService(db_session).create(_body("APPROVE2026"), owner)

    request = await SubscriptionService(db_session).create_request(
        org,
        owner,
        target_sku="pro",
        cycle="monthly",
        note="",
        promo_code="APPROVE2026",
    )
    await SubscriptionService(db_session).resolve(
        request.id, admin, new_status="approved", note="ok"
    )
    assert (
        await db_session.scalar(select(func.count()).select_from(PromoRedemption))
        == 0
    )

    invoice = await InvoiceService(db_session).create_invoice(
        organization_id=org.id,
        sku="pro",
        actor=admin,
        promo_code="APPROVE2026",
        subscription_request_id=request.id,
    )
    redemption = await db_session.scalar(
        select(PromoRedemption).where(PromoRedemption.invoice_id == invoice.id)
    )
    assert redemption is not None
    assert redemption.subscription_request_id == request.id
    assert redemption.organization_id == org.id
