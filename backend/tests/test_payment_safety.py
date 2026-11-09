from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models.billing import PaymentAttempt
from app.models.invoice import OrgInvoice
from app.models.organization import Organization
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.invoice import InvoiceService, next_invoice_number
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
    admin = await _make_user(db_session, "safety-admin@example.com", is_admin=True)
    owner = await _make_user(db_session, "safety-owner@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Safety Org",
        slug=f"safety-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db_session.add(org)
    await db_session.commit()
    return {"admin": admin, "owner": owner, "org": org}


async def _invoice(
    db: AsyncSession,
    org: Organization,
    *,
    number: str | None = None,
    status: str = "sent",
    sku: str = "pro",
    period_start: datetime | None = None,
) -> OrgInvoice:
    now = datetime.now(UTC)
    start = period_start or now
    inv = OrgInvoice(
        id=uuid.uuid4(),
        organization_id=org.id,
        number=number or f"SX-{uuid.uuid4().hex[:10]}",
        product="scan",
        sku=sku,
        amount_idr=500_000,
        dpp_idr=500_000,
        total_idr=500_000,
        period_start=start,
        period_end=start + timedelta(days=30),
        due_date=start + timedelta(days=7),
        status=status,
        sent_at=now if status == "sent" else None,
        paid_at=now if status == "paid" else None,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv


async def _succeeded_manual_attempt(db: AsyncSession, inv: OrgInvoice) -> PaymentAttempt:
    attempt = PaymentAttempt(
        provider="manual",
        invoice_id=inv.id,
        organization_id=inv.organization_id,
        amount_idr=inv.total_idr,
        currency="IDR",
        status="succeeded",
        method="bank_transfer",
        succeeded_at=datetime.now(UTC),
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)
    return attempt


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
async def test_force_void_paid_requires_force(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"], status="paid")
    await _succeeded_manual_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/void",
                headers=_auth(ctx["admin"]),
            )
            assert response.status_code == 409
            assert response.json()["detail"] == "Only draft or sent invoices can be voided"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_force_void_paid_requires_reason(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"], status="paid")
    await _succeeded_manual_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/void?force=true",
                headers=_auth(ctx["admin"]),
            )
            assert response.status_code == 400
            assert response.json()["detail"] == "reason is required when force=true"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_force_void_paid_keeps_attempts_and_sku(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"], status="paid")
    await _succeeded_manual_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/invoices/{inv.id}/void?force=true&reason=recorded%20in%20error",
                headers=_auth(ctx["admin"]),
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["status"] == "void"
            assert body["void_reason"] == "recorded in error"
            assert body["voided_by_user_id"] == str(ctx["admin"].id)
            assert body["voided_at"] is not None
    finally:
        app.dependency_overrides.clear()

    await db_session.refresh(inv)
    assert inv.status == "void"
    assert inv.voided_by_user_id == ctx["admin"].id
    assert inv.void_reason == "recorded in error"
    assert inv.voided_at is not None

    retained = await db_session.scalar(
        select(func.count()).select_from(PaymentAttempt).where(PaymentAttempt.invoice_id == inv.id)
    )
    assert retained == 1

    org = await db_session.get(Organization, ctx["org"].id)
    assert org is not None
    assert org.sku == "basic"


@pytest.mark.asyncio
async def test_void_paid_invoice_guards_survive_row_lock(
    db_session: AsyncSession, ctx
) -> None:
    """``_void`` locks the row before guarding; a paid invoice still 409/400s."""
    inv = await _invoice(db_session, ctx["org"], status="paid")
    service = InvoiceService(db_session)

    with pytest.raises(HTTPException) as no_force:
        await service._void(inv.id)
    assert no_force.value.status_code == 409
    assert no_force.value.detail == "Only draft or sent invoices can be voided"

    with pytest.raises(HTTPException) as no_reason:
        await service._void(inv.id, force=True)
    assert no_reason.value.status_code == 400
    assert no_reason.value.detail == "reason is required when force=true"


@pytest.mark.asyncio
async def test_second_manual_succeeded_attempt_violates_unique_index(
    db_session: AsyncSession, ctx
) -> None:
    inv = await _invoice(db_session, ctx["org"])
    await _succeeded_manual_attempt(db_session, inv)
    duplicate = PaymentAttempt(
        provider="manual",
        invoice_id=inv.id,
        organization_id=inv.organization_id,
        amount_idr=inv.total_idr,
        currency="IDR",
        status="succeeded",
        method="bank_transfer",
        succeeded_at=datetime.now(UTC),
    )
    db_session.add(duplicate)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_record_payment_blocked_by_pending_attempt(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    attempt = await _pending_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscriptions/{ctx['org'].id}/record-payment",
                headers=_auth(ctx["admin"]),
                json={"invoice_id": str(inv.id)},
            )
            assert response.status_code == 409
            assert response.json()["detail"] == f"pending gateway attempt {attempt.id}"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_record_payment_force_requires_reason(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    await _pending_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscriptions/{ctx['org'].id}/record-payment",
                headers=_auth(ctx["admin"]),
                json={"invoice_id": str(inv.id), "force": True},
            )
            assert response.status_code == 400
            assert response.json()["detail"] == "reason is required when force=true"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_record_payment_force_cancels_and_proceeds(db_session: AsyncSession, ctx) -> None:
    _bind(db_session)
    inv = await _invoice(db_session, ctx["org"])
    attempt = await _pending_attempt(db_session, inv)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/admin/subscriptions/{ctx['org'].id}/record-payment",
                headers=_auth(ctx["admin"]),
                json={
                    "invoice_id": str(inv.id),
                    "reference": "TF-SAFETY-1",
                    "force": True,
                    "reason": "bank transfer confirmed manually",
                },
            )
            assert response.status_code == 200, response.text
            assert response.json()["invoice_status"] == "paid"
    finally:
        app.dependency_overrides.clear()

    await db_session.refresh(attempt)
    assert attempt.status == "expired"


@pytest.mark.asyncio
async def test_next_invoice_number_uses_max_suffix(db_session: AsyncSession, ctx) -> None:
    period = datetime(2026, 1, 15, tzinfo=UTC)
    await _invoice(db_session, ctx["org"], number="SX-202601-0001", period_start=period)
    await _invoice(db_session, ctx["org"], number="SX-202601-0003", period_start=period)

    number = await next_invoice_number(db_session, period)
    assert number == "SX-202601-0004"


@pytest.mark.asyncio
async def test_mark_paid_records_actor(db_session: AsyncSession, ctx) -> None:
    inv = await _invoice(db_session, ctx["org"])
    paid = await InvoiceService(db_session).mark_paid(inv.id, None, actor_id=ctx["admin"].id)
    assert paid.status == "paid"
    await db_session.refresh(inv)
    assert inv.paid_by_user_id == ctx["admin"].id


@pytest.mark.asyncio
async def test_send_records_actor(db_session: AsyncSession, ctx) -> None:
    inv = await _invoice(db_session, ctx["org"], status="draft")
    sent = await InvoiceService(db_session).send(inv.id, actor_id=ctx["admin"].id)
    assert sent.status == "sent"
    await db_session.refresh(inv)
    assert inv.sent_by_user_id == ctx["admin"].id
