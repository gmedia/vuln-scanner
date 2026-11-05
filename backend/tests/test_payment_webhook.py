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
from app.services.payments.base import NormalizedEvent, StatusResult
from app.services.payments.midtrans import MidtransProvider

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
    # Existing cases predate provider verification; each verification test opts in.
    monkeypatch.setattr(settings, "midtrans_verify_status", False)


def _status_event(kind: str, *, amount_idr: int = TOTAL) -> NormalizedEvent:
    return NormalizedEvent(
        event_id=f"status:{kind}",
        kind=kind,
        provider_order_id=ORDER_ID,
        provider_payment_id="trx-status",
        amount_idr=amount_idr,
        currency="IDR",
    )


def _patch_fetch_status(
    monkeypatch: pytest.MonkeyPatch,
    result: StatusResult | Exception,
) -> list[PaymentAttempt]:
    calls: list[PaymentAttempt] = []

    async def fake_fetch_status(self: MidtransProvider, attempt: PaymentAttempt) -> StatusResult:
        calls.append(attempt)
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(MidtransProvider, "fetch_status", fake_fetch_status)
    return calls


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


@pytest.mark.asyncio
async def test_verification_confirms_success_before_activation(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    monkeypatch.setattr(settings, "midtrans_verify_status", True)
    calls = _patch_fetch_status(
        monkeypatch,
        StatusResult(found=True, event=_status_event("succeeded")),
    )
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
            sub = (
                await db_session.execute(select(Subscription).where(Subscription.organization_id == seeded["org"].id))
            ).scalar_one()
            assert sub.status == "active"
            assert len(calls) == 1
            events = (await db_session.execute(select(PaymentEvent))).scalars().all()
            assert len(events) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_verification_pending_status_fails_without_activation(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    monkeypatch.setattr(settings, "midtrans_verify_status", True)
    _patch_fetch_status(monkeypatch, StatusResult(found=True, event=_status_event("pending")))
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.json()["status"] == "failed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "sent"
            assert attempt is not None and attempt.status == "failed"
            assert attempt.failure_code == "provider_status_mismatch"
            assert attempt.failure_message == "provider reports pending"
            assert (
                await db_session.execute(select(Subscription).where(Subscription.organization_id == seeded["org"].id))
            ).scalar_one_or_none() is None
            event = (
                await db_session.execute(
                    select(PaymentEvent).where(PaymentEvent.event_id == "trx-0001:settlement:200:accept")
                )
            ).scalar_one()
            assert event.status == "failed"
            assert event.error == "provider status is pending, not settled"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_verification_not_found_fails_closed(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    monkeypatch.setattr(settings, "midtrans_verify_status", True)
    _patch_fetch_status(monkeypatch, StatusResult(found=False, event=None, error=None))
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.json()["status"] == "failed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "sent"
            assert attempt is not None and attempt.status == "failed"
            assert attempt.failure_code == "provider_status_unavailable"
            event = (
                await db_session.execute(
                    select(PaymentEvent).where(PaymentEvent.event_id == "trx-0001:settlement:200:accept")
                )
            ).scalar_one()
            assert event.status == "failed"
            assert event.error == "provider status unavailable"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_verification_transient_error_fails_closed(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    monkeypatch.setattr(settings, "midtrans_verify_status", True)
    _patch_fetch_status(monkeypatch, StatusResult(found=False, event=None, error="timeout"))
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.json()["status"] == "failed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "sent"
            assert attempt is not None and attempt.failure_code == "provider_status_unavailable"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_verification_exception_fails_closed(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    monkeypatch.setattr(settings, "midtrans_verify_status", True)
    _patch_fetch_status(monkeypatch, RuntimeError("provider unreachable"))
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.json()["status"] == "failed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "sent"
            assert attempt is not None and attempt.failure_code == "provider_status_unavailable"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_verification_disabled_skips_provider_call(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    monkeypatch.setattr(settings, "midtrans_verify_status", False)
    calls = _patch_fetch_status(
        monkeypatch,
        StatusResult(found=True, event=_status_event("succeeded")),
    )
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await _post(client, _payload())
            assert response.json()["status"] == "processed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            assert invoice is not None and invoice.status == "paid"
            assert calls == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_verification_on_already_paid_invoice_records_duplicate(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
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
    monkeypatch.setattr(settings, "midtrans_verify_status", True)
    _patch_fetch_status(monkeypatch, StatusResult(found=True, event=_status_event("succeeded")))
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
async def test_manual_provider_skips_verification(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    await db_session.delete(seeded["attempt"])
    await db_session.commit()
    monkeypatch.setattr(settings, "midtrans_verify_status", True)
    monkeypatch.setattr(settings, "payment_webhook_secret", "right-secret")
    calls = _patch_fetch_status(
        monkeypatch,
        StatusResult(found=True, event=_status_event("succeeded")),
    )
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/manual",
                content=json.dumps(
                    {
                        "id": "manual-e1",
                        "type": "payment.succeeded",
                        "data": {
                            "invoice_id": str(seeded["invoice"].id),
                            "payment_ref": "BANK-REF-1",
                        },
                    }
                ).encode(),
                headers={
                    "Content-Type": "application/json",
                    "X-Payment-Webhook-Secret": "right-secret",
                },
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "processed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            assert invoice is not None and invoice.status == "paid"
            assert calls == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_pending_and_expired_events_never_verify(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bind(db_session)
    await _seed(db_session)
    monkeypatch.setattr(settings, "midtrans_verify_status", True)
    calls = _patch_fetch_status(
        monkeypatch,
        StatusResult(found=True, event=_status_event("succeeded")),
    )
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            pending = await _post(
                client,
                _payload(
                    transaction_id="trx-pending",
                    transaction_status="pending",
                    status_code="201",
                    fraud_status="",
                ),
            )
            assert pending.json()["status"] == "processed"
            expired = await _post(
                client,
                _payload(
                    transaction_id="trx-expired",
                    transaction_status="expire",
                    status_code="200",
                    fraud_status="",
                ),
            )
            assert expired.json()["status"] == "processed"
            assert calls == []
    finally:
        app.dependency_overrides.clear()


async def _settle(db_session: AsyncSession, client: AsyncClient, *, transaction_id: str = "trx-settle-1") -> None:
    response = await _post(client, _payload(transaction_id=transaction_id))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "processed"


async def _subscription(db_session: AsyncSession, org_id: object) -> Subscription | None:
    return (
        await db_session.execute(select(Subscription).where(Subscription.organization_id == org_id))
    ).scalar_one_or_none()


@pytest.mark.asyncio
async def test_refund_after_settlement_marks_attempt_refunded_without_revoking(
    db_session: AsyncSession,
) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _settle(db_session, client)
            response = await _post(
                client,
                _payload(transaction_id="trx-refund-1", transaction_status="refund"),
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "processed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            sub = await _subscription(db_session, seeded["org"].id)
            assert invoice is not None and invoice.status == "paid"
            assert attempt is not None and attempt.status == "refunded"
            assert attempt.refunded_amount_idr == attempt.amount_idr == TOTAL
            assert attempt.provider_status == "refunded"
            assert sub is not None and sub.status == "active"
            event = (
                await db_session.execute(
                    select(PaymentEvent).where(PaymentEvent.event_id == "trx-refund-1:refund:200:accept")
                )
            ).scalar_one()
            assert event.status == "processed"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_partial_refund_stores_exact_amount_without_revoking(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _settle(db_session, client)
            response = await _post(
                client,
                _payload(
                    transaction_id="trx-partial-1",
                    transaction_status="partial_refund",
                    refund_amount="100000.00",
                ),
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "processed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            sub = await _subscription(db_session, seeded["org"].id)
            assert invoice is not None and invoice.status == "paid"
            assert attempt is not None and attempt.status == "refunded"
            assert attempt.refunded_amount_idr == 100_000
            assert attempt.provider_status == "partially_refunded"
            assert sub is not None and sub.status == "active"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_chargeback_keeps_invoice_and_subscription(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _settle(db_session, client)
            response = await _post(
                client,
                _payload(transaction_id="trx-chargeback-1", transaction_status="chargeback"),
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "processed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            sub = await _subscription(db_session, seeded["org"].id)
            assert invoice is not None and invoice.status == "paid"
            assert attempt is not None and attempt.status == "refunded"
            assert attempt.provider_status == "chargeback"
            assert attempt.refunded_amount_idr == TOTAL
            assert sub is not None and sub.status == "active"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_refund_on_pending_attempt_is_ignored_and_settlement_still_pays(
    db_session: AsyncSession,
) -> None:
    """Regression: a premature refund must not block the real settlement.

    Pre-fix the refund moved the pending attempt to rank 3 (``refunded``), so the
    later settlement (rank 2) was dropped and the invoice never became paid.
    """
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            premature = await _post(
                client,
                _payload(transaction_id="trx-refund-early", transaction_status="refund"),
            )
            assert premature.status_code == 200, premature.text
            assert premature.json()["status"] == "ignored"

            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            assert attempt is not None and attempt.status == "pending"
            assert attempt.refunded_amount_idr == 0
            assert invoice is not None and invoice.status == "sent"
            assert await _subscription(db_session, seeded["org"].id) is None
            early_event = (
                await db_session.execute(
                    select(PaymentEvent).where(
                        PaymentEvent.event_id == "trx-refund-early:refund:200:accept"
                    )
                )
            ).scalar_one()
            assert early_event.status == "ignored"
            assert early_event.error == "refund for a non-settled attempt (pending)"

            settlement = await _post(client, _payload(transaction_id="trx-settle-after-refund"))
            assert settlement.status_code == 200, settlement.text
            assert settlement.json()["status"] == "processed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            sub = await _subscription(db_session, seeded["org"].id)
            assert invoice is not None and invoice.status == "paid"
            assert attempt is not None and attempt.status == "succeeded"
            assert attempt.refunded_amount_idr == 0
            assert sub is not None and sub.status == "active"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_refund_over_paid_amount_fails_without_changing_attempt(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _settle(db_session, client)
            response = await _post(
                client,
                _payload(
                    transaction_id="trx-refund-over",
                    transaction_status="refund",
                    refund_amount="800000.00",
                ),
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "failed"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "paid"
            assert attempt is not None and attempt.status == "succeeded"
            assert attempt.refunded_amount_idr == 0
            event = (
                await db_session.execute(
                    select(PaymentEvent).where(
                        PaymentEvent.event_id == "trx-refund-over:refund:200:accept"
                    )
                )
            ).scalar_one()
            assert event.status == "failed"
            assert event.error == f"invalid refund amount 800000 for paid {TOTAL}"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_partial_refund_zero_or_missing_amount_fails_without_changing_attempt(
    db_session: AsyncSession,
) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _settle(db_session, client)
            zero = await _post(
                client,
                _payload(
                    transaction_id="trx-partial-zero",
                    transaction_status="partial_refund",
                    refund_amount="0.00",
                ),
            )
            assert zero.status_code == 200, zero.text
            assert zero.json()["status"] == "failed"

            missing = await _post(
                client,
                _payload(
                    transaction_id="trx-partial-missing",
                    transaction_status="partial_refund",
                ),
            )
            assert missing.status_code == 200, missing.text
            assert missing.json()["status"] == "failed"

            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert attempt is not None and attempt.status == "succeeded"
            assert attempt.refunded_amount_idr == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_duplicate_refund_event_is_deduplicated(db_session: AsyncSession) -> None:
    _bind(db_session)
    seeded = await _seed(db_session)
    payload = _payload(transaction_id="trx-refund-dup", transaction_status="refund")
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _settle(db_session, client)
            first = await _post(client, payload)
            second = await _post(client, payload)
            assert first.json()["status"] == "processed"
            assert second.json()["status"] == "duplicate"

            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert attempt is not None and attempt.status == "refunded"
            assert attempt.refunded_amount_idr == TOTAL
            events = (
                await db_session.execute(
                    select(PaymentEvent).where(
                        PaymentEvent.event_id == "trx-refund-dup:refund:200:accept"
                    )
                )
            ).scalars().all()
            assert len(events) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_second_refund_after_refunded_is_ignored_and_amount_stays_deterministic(
    db_session: AsyncSession,
) -> None:
    """Only a settled attempt may transition, so the first valid refund amount wins."""
    _bind(db_session)
    seeded = await _seed(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await _settle(db_session, client)
            first = await _post(
                client,
                _payload(transaction_id="trx-refund-first", transaction_status="refund"),
            )
            assert first.json()["status"] == "processed"

            second = await _post(
                client,
                _payload(
                    transaction_id="trx-refund-second",
                    transaction_status="refund",
                    refund_amount="300000.00",
                ),
            )
            assert second.status_code == 200, second.text
            assert second.json()["status"] == "ignored"

            invoice = await db_session.get(OrgInvoice, seeded["invoice"].id)
            attempt = await db_session.get(PaymentAttempt, seeded["attempt"].id)
            assert invoice is not None and invoice.status == "paid"
            assert attempt is not None and attempt.status == "refunded"
            assert attempt.refunded_amount_idr == TOTAL
            event = (
                await db_session.execute(
                    select(PaymentEvent).where(
                        PaymentEvent.event_id == "trx-refund-second:refund:200:accept"
                    )
                )
            ).scalar_one()
            assert event.status == "ignored"
            assert event.error == "refund for a non-settled attempt (refunded)"
    finally:
        app.dependency_overrides.clear()
