from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.billing import PaymentAttempt, PaymentEvent, Subscription
from app.models.invoice import OrgInvoice
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import hash_password
from app.services.organization import ensure_personal_org

SERVER_KEY = "SB-Mid-server-test-123"
ORDER_ID = "SX-202611-0001-A1"
TOTAL = 715_000


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


def _bind(db_session: AsyncSession) -> None:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db


def _sign(order_id: str, status_code: str, gross_amount: str, key: str = SERVER_KEY) -> str:
    return hashlib.sha512(f"{order_id}{status_code}{gross_amount}{key}".encode()).hexdigest()


def _payload(
    *,
    order_id: str = ORDER_ID,
    transaction_id: str = "trx-0001",
    transaction_status: str = "settlement",
    status_code: str = "200",
    fraud_status: str = "accept",
    gross_amount: str = "715000.00",
    refund_amount: str | None = None,
) -> dict[str, object]:
    body: dict[str, object] = {
        "order_id": order_id,
        "status_code": status_code,
        "gross_amount": gross_amount,
        "transaction_status": transaction_status,
        "fraud_status": fraud_status,
        "transaction_id": transaction_id,
        "payment_type": "bank_transfer",
        "customer_details": {"first_name": "Secret Buyer", "email": "buyer@example.com"},
        "signature_key": _sign(order_id, status_code, gross_amount),
    }
    if refund_amount is not None:
        body["refund_amount"] = refund_amount
    return body


async def _seed(
    db: AsyncSession,
    *,
    invoice_status: str = "sent",
    attempt_status: str = "pending",
    total_idr: int = TOTAL,
) -> dict[str, object]:
    owner = await _make_user(db, f"wh-owner-{uuid.uuid4().hex[:6]}@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Webhook Org",
        slug=f"wh-org-{uuid.uuid4().hex[:6]}",
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
    now = datetime.now(UTC)
    inv = OrgInvoice(
        id=uuid.uuid4(),
        organization_id=org.id,
        number="SX-202611-0001",
        product="scan",
        sku="pro",
        amount_idr=total_idr,
        dpp_idr=total_idr,
        ppn_idr=0,
        pph23_idr=0,
        total_idr=total_idr,
        period_start=now - timedelta(days=1),
        period_end=now + timedelta(days=29),
        due_date=now + timedelta(days=7),
        status=invoice_status,
        sent_at=now,
        paid_at=now if invoice_status == "paid" else None,
    )
    db.add(inv)
    await db.flush()
    attempt = PaymentAttempt(
        provider="midtrans",
        provider_order_id=ORDER_ID,
        provider_ref=ORDER_ID,
        invoice_id=inv.id,
        organization_id=org.id,
        amount_idr=total_idr,
        currency="IDR",
        status=attempt_status,
        attempt_seq=1,
        checkout_url="https://app.sandbox.midtrans.com/snap/v2/vtweb/token",
        expires_at=now + timedelta(hours=24),
        succeeded_at=now if attempt_status == "succeeded" else None,
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(inv)
    await db.refresh(attempt)
    return {"org": org, "invoice": inv, "attempt": attempt, "owner": owner}


async def _post(client: AsyncClient, payload: object) -> object:
    return await client.post(
        "/api/webhooks/payments/midtrans",
        content=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )


@pytest.fixture(autouse=True)
def _gateway_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr(settings, "payment_providers_enabled", "midtrans")
    monkeypatch.setattr(settings, "midtrans_server_key", SERVER_KEY)
    monkeypatch.setattr(settings, "midtrans_is_production", False)


@pytest.mark.asyncio
async def test_settlement_marks_invoice_paid_and_activates_subscription(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "processed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "paid"
            assert attempt is not None and attempt.status == "succeeded"
            assert attempt.provider_status == "succeeded"
            sub = (
                await db_session.execute(select(Subscription).where(Subscription.organization_id == seeded["org"].id))
            ).scalar_one()
            assert sub.status == "active"
            event = (
                await db_session.execute(
                    select(PaymentEvent).where(PaymentEvent.event_id == "trx-0001:settlement:200:accept")
                )
            ).scalar_one()
            assert event.status == "processed"
            assert "customer_details" not in event.payload
            assert "signature_key" not in event.payload
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_duplicate_event_is_deduplicated(db_session: AsyncSession) -> None:
    _bind(db_session)
    await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await _post(client, _payload())
            second = await _post(client, _payload())
            assert first.status_code == 200
            assert second.json()["status"] == "duplicate"
            count = (await db_session.execute(select(PaymentEvent))).scalars().all()
            assert len(count) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_second_settlement_is_duplicate_payment_without_reactivation(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await _post(client, _payload(transaction_id="trx-0001"))
            assert first.json()["status"] == "processed"
            sub = (
                await db_session.execute(select(Subscription).where(Subscription.organization_id == seeded["org"].id))
            ).scalar_one()
            activated_at = sub.updated_at
            second = await _post(client, _payload(transaction_id="trx-0002"))
            assert second.json()["status"] == "processed"
            await db_session.refresh(sub)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert sub.status == "active"
            assert sub.updated_at == activated_at
            assert attempt is not None and attempt.provider_status == "duplicate"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_forged_signature_is_401(db_session: AsyncSession) -> None:
    _bind(db_session)
    await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = _payload()
            body["signature_key"] = "forged"
            response = await _post(client, body)
            assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_unknown_provider_is_404(db_session: AsyncSession) -> None:
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/webhooks/payments/stripe", content=b"{}")
            assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_malformed_body_is_400(db_session: AsyncSession) -> None:
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/midtrans",
                content=b"not-json",
                headers={"Content-Type": "application/json"},
            )
            assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_oversize_body_is_413(db_session: AsyncSession) -> None:
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/midtrans",
                content=b"x" * 65_537,
                headers={"Content-Type": "application/json"},
            )
            assert response.status_code == 413
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_amount_mismatch_fails_without_activation(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload(gross_amount="1.00"))
            assert response.status_code == 200
            assert response.json()["status"] == "failed"
            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "sent"
            assert attempt is not None
            assert attempt.status == "failed"
            assert attempt.failure_code == "amount_mismatch"
            assert (
                await db_session.execute(select(Subscription).where(Subscription.organization_id == seeded["org"].id))
            ).scalar_one_or_none() is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_settlement_on_void_invoice_fails(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session, invoice_status="void")
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.json()["status"] == "failed"
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert attempt is not None and attempt.status == "failed"
            assert attempt.failure_code == "invoice_void"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_settlement_on_paid_invoice_is_duplicate_without_reactivation(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session, invoice_status="paid")
    sub = Subscription(
        organization_id=seeded["org"].id,
        sku="pro",
        status="active",
        cycle="monthly",
        provider="midtrans",
    )
    db_session.add(sub)
    await db_session.commit()
    await db_session.refresh(sub)
    before = sub.updated_at
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.json()["status"] == "processed"
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            await db_session.refresh(sub)
            assert attempt is not None and attempt.provider_status == "duplicate"
            assert sub.updated_at == before
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_late_pending_event_does_not_downgrade_succeeded(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await _post(client, _payload(transaction_id="trx-0001"))
            assert first.json()["status"] == "processed"
            late = await _post(
                client,
                _payload(
                    transaction_id="trx-0002",
                    transaction_status="pending",
                    status_code="201",
                    fraud_status="",
                ),
            )
            assert late.json()["status"] == "ignored"
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert attempt is not None and attempt.status == "succeeded"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_late_settlement_after_local_expiry_still_pays(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    seeded["attempt"].status = "expired"
    await db_session.commit()
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.json()["status"] == "processed"
            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "paid"
            assert attempt is not None and attempt.status == "succeeded"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_manual_webhook_secret_unset_is_503(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_webhook_secret", "")
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/manual",
                content=b'{"id":"e1","type":"ping","data":{}}',
                headers={"Content-Type": "application/json", "X-Payment-Webhook-Secret": "x"},
            )
            assert response.status_code == 503
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_manual_webhook_wrong_secret_is_401(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_webhook_secret", "right-secret")
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/manual",
                content=b'{"id":"e1","type":"ping","data":{}}',
                headers={"Content-Type": "application/json", "X-Payment-Webhook-Secret": "wrong"},
            )
            assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_manual_webhook_valid_secret_applies_event(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    monkeypatch.setattr(settings, "payment_webhook_secret", "right-secret")
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/manual",
                content=b'{"id":"e1","type":"ping","data":{}}',
                headers={"Content-Type": "application/json", "X-Payment-Webhook-Secret": "right-secret"},
            )
            assert response.status_code == 200
            assert response.json()["status"] == "ignored"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_unknown_attempt_records_failed_event(db_session: AsyncSession) -> None:
    _bind(db_session)
    await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            body = _payload(order_id="UNKNOWN-ORDER")
            response = await _post(client, body)
            assert response.json()["status"] == "failed"
            event = (
                await db_session.execute(
                    select(PaymentEvent).where(PaymentEvent.event_id == "trx-0001:settlement:200:accept")
                )
            ).scalar_one()
            assert event.status == "failed"
            assert event.error == "unknown attempt"
    finally:
        app.dependency_overrides.clear()
