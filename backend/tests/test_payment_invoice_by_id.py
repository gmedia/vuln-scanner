from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.billing import PaymentAttempt
from app.models.invoice import OrgInvoice
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org


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
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


def _auth(user: User, org_id: uuid.UUID | None = None) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
        org_id=str(org_id) if org_id is not None else None,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


def _bind(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    owner = await _make_user(db_session, "inv-by-id-owner@example.com")
    org_admin = await _make_user(db_session, "inv-by-id-admin@example.com")
    viewer = await _make_user(db_session, "inv-by-id-viewer@example.com")
    outsider = await _make_user(db_session, "inv-by-id-outsider@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Invoice Read Org",
        slug=f"inv-read-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    other_org = Organization(
        id=uuid.uuid4(),
        name="Invoice Other Org",
        slug=f"inv-other-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=outsider.id,
    )
    db_session.add_all([org, other_org])
    await db_session.flush()
    for user, role in ((owner, "owner"), (org_admin, "admin"), (viewer, "viewer")):
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=org.id,
                user_id=user.id,
                role=role,
            )
        )
    db_session.add(
        OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=other_org.id,
            user_id=outsider.id,
            role="owner",
        )
    )
    await db_session.commit()
    return {
        "owner": owner,
        "org_admin": org_admin,
        "viewer": viewer,
        "outsider": outsider,
        "org": org,
        "other_org": other_org,
    }


async def _invoice(
    db: AsyncSession,
    org: Organization,
    *,
    status: str = "sent",
    total_idr: int = 500_000,
) -> OrgInvoice:
    now = datetime.now(UTC)
    inv = OrgInvoice(
        id=uuid.uuid4(),
        organization_id=org.id,
        number=f"SX-{uuid.uuid4().hex[:10]}",
        product="scan",
        sku="pro",
        amount_idr=total_idr,
        dpp_idr=total_idr,
        total_idr=total_idr,
        period_start=now,
        period_end=now + timedelta(days=30),
        due_date=now + timedelta(days=7),
        status=status,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


@pytest.mark.asyncio
async def test_invoice_by_id_member_allowed_other_org_404_viewer_403(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr(settings, "payment_providers_enabled", "midtrans")
    inv = await _invoice(db_session, ctx["org"])
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            owner = await client.get(f"/api/invoices/{inv.id}", headers=_auth(ctx["owner"], ctx["org"].id))
            assert owner.status_code == 200, owner.text
            admin = await client.get(f"/api/invoices/{inv.id}", headers=_auth(ctx["org_admin"], ctx["org"].id))
            assert admin.status_code == 200
            viewer = await client.get(f"/api/invoices/{inv.id}", headers=_auth(ctx["viewer"], ctx["org"].id))
            assert viewer.status_code == 403
            outsider = await client.get(f"/api/invoices/{inv.id}", headers=_auth(ctx["outsider"], ctx["other_org"].id))
            assert outsider.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_can_pay_true_for_sent_positive_total(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr(settings, "payment_providers_enabled", "midtrans")
    inv = await _invoice(db_session, ctx["org"])
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/invoices/{inv.id}", headers=_auth(ctx["owner"], ctx["org"].id))
            assert response.status_code == 200
            assert response.json()["can_pay"] is True
            assert response.json()["payment_status"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("invoice_status", "total_idr", "gateway_enabled"),
    [
        ("draft", 500_000, True),
        ("paid", 500_000, True),
        ("sent", 0, True),
        ("sent", 500_000, False),
    ],
)
async def test_can_pay_false_for_unpayable_invoice(
    db_session: AsyncSession,
    ctx,
    monkeypatch: pytest.MonkeyPatch,
    invoice_status: str,
    total_idr: int,
    gateway_enabled: bool,
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", gateway_enabled)
    monkeypatch.setattr(settings, "payment_providers_enabled", "midtrans")
    inv = await _invoice(db_session, ctx["org"], status=invoice_status, total_idr=total_idr)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/invoices/{inv.id}", headers=_auth(ctx["owner"], ctx["org"].id))
            assert response.status_code == 200, response.text
            assert response.json()["can_pay"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_payment_status_reflects_latest_attempt(
    db_session: AsyncSession, ctx, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr(settings, "payment_providers_enabled", "midtrans")
    inv = await _invoice(db_session, ctx["org"])
    now = datetime.now(UTC)
    db_session.add_all(
        [
            PaymentAttempt(
                provider="midtrans",
                provider_order_id=f"{inv.number}-A1",
                invoice_id=inv.id,
                organization_id=inv.organization_id,
                amount_idr=inv.total_idr,
                status="failed",
                attempt_seq=1,
                created_at=now - timedelta(hours=2),
            ),
            PaymentAttempt(
                provider="midtrans",
                provider_order_id=f"{inv.number}-A2",
                invoice_id=inv.id,
                organization_id=inv.organization_id,
                amount_idr=inv.total_idr,
                status="pending",
                attempt_seq=2,
                created_at=now,
            ),
        ]
    )
    await db_session.commit()
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/invoices/{inv.id}", headers=_auth(ctx["owner"], ctx["org"].id))
            assert response.status_code == 200
            assert response.json()["payment_status"] == "pending"
            assert response.json()["can_pay"] is False
    finally:
        app.dependency_overrides.clear()
