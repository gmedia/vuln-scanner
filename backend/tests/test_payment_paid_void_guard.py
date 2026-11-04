from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.billing import PaymentAttempt
from app.models.invoice import OrgInvoice
from app.models.organization import Organization
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.organization import ensure_personal_org


async def _make_user(db: AsyncSession, email: str, *, is_admin: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        is_admin=is_admin,
        credits=100,
    )
    db.add(user)
    await db.flush()
    await ensure_personal_org(db, user)
    await db.commit()
    await db.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    token = create_access_token(
        user_id=str(user.id),
        email=user.email,
        is_admin=user.is_admin,
    )
    return {"Authorization": f"Bearer {token}", "X-E2E-Test": "1"}


def _bind(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture
async def ctx(db_session: AsyncSession):
    admin = await _make_user(db_session, "guard-admin@example.com", is_admin=True)
    owner = await _make_user(db_session, "guard-owner@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Guard Org",
        slug=f"guard-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.commit()
    return {"admin": admin, "owner": owner, "org": org}


async def _invoice(db: AsyncSession, org: Organization) -> OrgInvoice:
    now = datetime.now(UTC)
    inv = OrgInvoice(
        id=uuid.uuid4(),
        organization_id=org.id,
        number=f"SX-{uuid.uuid4().hex[:10]}",
        product="scan",
        sku="pro",
        amount_idr=500_000,
        dpp_idr=500_000,
        total_idr=500_000,
        period_start=now,
        period_end=now + timedelta(days=30),
        due_date=now + timedelta(days=7),
        status="sent",
        sent_at=now,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


async def _pending_attempt(db: AsyncSession, inv: OrgInvoice) -> PaymentAttempt:
    attempt = PaymentAttempt(
        provider="midtrans",
        provider_order_id=f"{inv.number}-A1",
        invoice_id=inv.id,
        organization_id=inv.organization_id,
        amount_idr=inv.total_idr,
        currency="IDR",
        status="pending",
        attempt_seq=1,
        checkout_url="https://app.sandbox.midtrans.com/snap/v2/vtweb/token",
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


@pytest.mark.asyncio
async def test_paid_blocked_while_pending(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    attempt = await _pending_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/paid",
                headers=_auth(ctx["admin"]),
                json={},
            )
            assert response.status_code == 409
            assert str(attempt.id) in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_void_blocked_while_pending(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    attempt = await _pending_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/void",
                headers=_auth(ctx["admin"]),
            )
            assert response.status_code == 409
            assert str(attempt.id) in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_force_without_reason_is_400(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    await _pending_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/paid?force=true",
                headers=_auth(ctx["admin"]),
                json={},
            )
            assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_force_with_reason_cancels_and_marks_paid(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    attempt = await _pending_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/paid?force=true&reason=bank%20transfer%20confirmed",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-GUARD-1"},
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "paid"
            await db_session.refresh(attempt)
            assert attempt.status == "expired"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_force_with_reason_cancels_and_voids(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    attempt = await _pending_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/void?force=true&reason=customer%20asked%20to%20cancel",
                headers=_auth(ctx["admin"]),
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "void"
            await db_session.refresh(attempt)
            assert attempt.status == "expired"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_paid_without_pending_attempt_is_unchanged(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-GUARD-2"},
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "paid"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_void_without_pending_attempt_is_unchanged(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/void",
                headers=_auth(ctx["admin"]),
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "void"
    finally:
        app.dependency_overrides.clear()
