from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.main import app
from app.models.billing import PaymentAttempt, PaymentEvent, Subscription
from app.models.invoice import OrgInvoice
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import create_access_token, hash_password
from app.services.billing import BillingService, BillingTransitionError
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
    admin = await _make_user(db_session, "bill-admin@example.com", is_admin=True)
    owner = await _make_user(db_session, "bill-owner@example.com")
    org = Organization(
        id=uuid.uuid4(),
        name="Billing Org",
        slug=f"bill-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    other_org = Organization(
        id=uuid.uuid4(),
        name="Other Org",
        slug=f"other-org-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=owner.id,
    )
    db_session.add_all([org, other_org])
    await db_session.flush()
    for organization in (org, other_org):
        db_session.add(
            OrganizationMembership(
                id=uuid.uuid4(),
                organization_id=organization.id,
                user_id=owner.id,
                role="owner",
            )
        )
    await db_session.commit()
    return {"admin": admin, "owner": owner, "org": org, "other_org": other_org}


async def _create_invoice(
    client: AsyncClient,
    admin: User,
    org: Organization,
    *,
    sku: str = "pro",
) -> dict[str, object]:
    response = await client.post(
        "/api/admin/invoices",
        headers=_auth(admin),
        json={"organization_id": str(org.id), "sku": sku},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_existing_mark_paid_creates_subscription_and_attempt(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            invoice = await _create_invoice(client, ctx["admin"], ctx["org"], sku="pro")
            paid = await client.post(
                f"/api/admin/invoices/{invoice['id']}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-BILL-1"},
            )
            assert paid.status_code == 200, paid.text
            assert paid.json()["status"] == "paid"

            sub = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            assert sub.status == "active"
            assert sub.sku == "pro"
            assert sub.cycle == "monthly"
            assert sub.current_period_start is not None
            assert sub.current_period_end is not None

            attempt = (
                await db_session.execute(
                    select(PaymentAttempt).where(
                        PaymentAttempt.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            assert attempt.status == "succeeded"
            assert attempt.provider == "manual"
            assert attempt.provider_ref == "TF-BILL-1"
            assert attempt.created_by_user_id == ctx["admin"].id
            assert attempt.invoice_id == uuid.UUID(str(invoice["id"]))

            org = await db_session.get(Organization, ctx["org"].id)
            assert org is not None
            assert org.sku == "pro"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_record_payment_endpoint_returns_billing_state(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            invoice = await _create_invoice(client, ctx["admin"], ctx["org"], sku="multi")
            response = await client.post(
                f"/api/admin/subscriptions/{ctx['org'].id}/record-payment",
                headers=_auth(ctx["admin"]),
                json={
                    "invoice_id": invoice["id"],
                    "method": "bank_transfer",
                    "reference": "TF-BILL-2",
                },
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["invoice_status"] == "paid"
            assert body["subscription"]["status"] == "active"
            assert body["subscription"]["sku"] == "multi"
            assert body["attempt"]["status"] == "succeeded"
            assert body["attempt"]["provider_ref"] == "TF-BILL-2"

            detail = await client.get(
                f"/api/admin/subscriptions/{ctx['org'].id}",
                headers=_auth(ctx["admin"]),
            )
            assert detail.status_code == 200
            assert detail.json()["attempts"][0]["provider_ref"] == "TF-BILL-2"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_host_invoice_does_not_overwrite_scan_subscription(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            scan = await _create_invoice(client, ctx["admin"], ctx["org"], sku="pro")
            paid = await client.post(
                f"/api/admin/invoices/{scan['id']}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-SCAN-1"},
            )
            assert paid.status_code == 200
            sub = (
                await db_session.execute(
                    select(Subscription).where(
                        Subscription.organization_id == ctx["org"].id
                    )
                )
            ).scalar_one()
            original_end = sub.current_period_end
            assert sub.sku == "pro"

            host = await client.post(
                "/api/admin/invoices",
                headers=_auth(ctx["admin"]),
                json={
                    "organization_id": str(ctx["org"].id),
                    "sku": "multi",
                    "product": "host",
                },
            )
            assert host.status_code == 201
            host_paid = await client.post(
                f"/api/admin/invoices/{host.json()['id']}/paid",
                headers=_auth(ctx["admin"]),
                json={"bank_ref": "TF-HOST-1"},
            )
            assert host_paid.status_code == 200

            await db_session.refresh(sub)
            org = await db_session.get(Organization, ctx["org"].id)
            assert sub.sku == "pro"
            assert sub.current_period_end == original_end
            assert org is not None
            assert org.sku == "pro"
            host_attempt = (
                await db_session.execute(
                    select(PaymentAttempt).where(
                        PaymentAttempt.provider_ref == "TF-HOST-1"
                    )
                )
            ).scalar_one()
            assert host_attempt.status == "succeeded"
            assert host_attempt.invoice_id == uuid.UUID(str(host.json()["id"]))
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_record_payment_rejects_invoice_from_another_org(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            invoice = await _create_invoice(
                client, ctx["admin"], ctx["other_org"], sku="basic"
            )
            response = await client.post(
                f"/api/admin/subscriptions/{ctx['org'].id}/record-payment",
                headers=_auth(ctx["admin"]),
                json={"invoice_id": invoice["id"]},
            )
            assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_webhook_disabled_without_secret(db_session, ctx, monkeypatch):
    monkeypatch.setattr(settings, "payment_webhook_secret", "")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/manual",
                json={"id": "evt-1", "type": "payment.succeeded", "data": {}},
            )
            assert response.status_code == 503
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_webhook_rejects_wrong_secret(db_session, ctx, monkeypatch):
    monkeypatch.setattr(settings, "payment_webhook_secret", "s3cret")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/manual",
                headers={"X-Payment-Webhook-Secret": "wrong"},
                json={"id": "evt-2", "type": "payment.succeeded", "data": {}},
            )
            assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_webhook_payment_succeeded_activates_and_is_idempotent(
    db_session, ctx, monkeypatch
):
    monkeypatch.setattr(settings, "payment_webhook_secret", "s3cret")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            invoice = await _create_invoice(client, ctx["admin"], ctx["org"], sku="pro")
            inv = await db_session.get(OrgInvoice, uuid.UUID(str(invoice["id"])))
            assert inv is not None
            sub = Subscription(
                organization_id=ctx["org"].id,
                sku="basic",
                status="incomplete",
                cycle="monthly",
                provider="manual",
            )
            db_session.add(sub)
            await db_session.flush()
            attempt = PaymentAttempt(
                organization_id=ctx["org"].id,
                subscription_id=sub.id,
                invoice_id=inv.id,
                provider="manual",
                provider_ref="pay-1",
                amount_idr=inv.amount_idr,
                status="pending",
            )
            db_session.add(attempt)
            await db_session.commit()

            payload = {
                "id": "evt-succeeded-1",
                "type": "payment.succeeded",
                "data": {
                    "payment_ref": "pay-1",
                    "invoice_id": str(inv.id),
                    "method": "va",
                },
            }
            first = await client.post(
                "/api/webhooks/payments/manual",
                headers={"X-Payment-Webhook-Secret": "s3cret"},
                json=payload,
            )
            assert first.status_code == 200, first.text
            assert first.json()["status"] == "processed"

            await db_session.refresh(sub)
            await db_session.refresh(attempt)
            await db_session.refresh(inv)
            assert sub.status == "active"
            assert sub.sku == "pro"
            assert attempt.status == "succeeded"
            assert inv.status == "paid"

            second = await client.post(
                "/api/webhooks/payments/manual",
                headers={"X-Payment-Webhook-Secret": "s3cret"},
                json=payload,
            )
            assert second.status_code == 200
            assert second.json()["status"] == "duplicate"
            events = (
                await db_session.execute(select(func.count()).select_from(PaymentEvent))
            ).scalar_one()
            assert events == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_webhook_failed_sets_past_due_and_retry(db_session, ctx, monkeypatch):
    monkeypatch.setattr(settings, "payment_webhook_secret", "s3cret")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            sub = Subscription(
                organization_id=ctx["org"].id,
                sku="pro",
                status="active",
                cycle="monthly",
                provider="manual",
            )
            db_session.add(sub)
            await db_session.flush()
            attempt = PaymentAttempt(
                organization_id=ctx["org"].id,
                subscription_id=sub.id,
                provider="manual",
                provider_ref="pay-2",
                amount_idr=650_000,
                status="pending",
            )
            db_session.add(attempt)
            await db_session.commit()

            retry_at = (datetime.now(UTC) + timedelta(days=1)).isoformat()
            response = await client.post(
                "/api/webhooks/payments/manual",
                headers={"X-Payment-Webhook-Secret": "s3cret"},
                json={
                    "id": "evt-failed-1",
                    "type": "payment.failed",
                    "data": {
                        "payment_ref": "pay-2",
                        "failure_code": "insufficient_funds",
                        "next_retry_at": retry_at,
                    },
                },
            )
            assert response.status_code == 200, response.text
            await db_session.refresh(sub)
            await db_session.refresh(attempt)
            assert sub.status == "past_due"
            assert attempt.status == "failed"
            assert attempt.failure_code == "insufficient_funds"
            assert attempt.next_retry_at is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_webhook_unknown_event_is_ignored(db_session, ctx, monkeypatch):
    monkeypatch.setattr(settings, "payment_webhook_secret", "s3cret")
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/webhooks/payments/manual",
                headers={"X-Payment-Webhook-Secret": "s3cret"},
                json={"id": "evt-unknown-1", "type": "payment.unknown", "data": {}},
            )
            assert response.status_code == 200
            assert response.json()["status"] == "ignored"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_cancel_at_period_end_then_immediate(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            sub = Subscription(
                organization_id=ctx["org"].id,
                sku="pro",
                status="active",
                cycle="monthly",
                provider="manual",
            )
            db_session.add(sub)
            await db_session.commit()

            scheduled = await client.post(
                f"/api/admin/subscriptions/{ctx['org'].id}/cancel",
                headers=_auth(ctx["admin"]),
                json={"at_period_end": True},
            )
            assert scheduled.status_code == 200
            assert scheduled.json()["cancel_at_period_end"] is True
            assert scheduled.json()["status"] == "active"

            immediate = await client.post(
                f"/api/admin/subscriptions/{ctx['org'].id}/cancel",
                headers=_auth(ctx["admin"]),
                json={"at_period_end": False},
            )
            assert immediate.status_code == 200
            assert immediate.json()["status"] == "canceled"
            assert immediate.json()["ended_at"] is not None

            again = await client.post(
                f"/api/admin/subscriptions/{ctx['org'].id}/cancel",
                headers=_auth(ctx["admin"]),
                json={"at_period_end": False},
            )
            assert again.status_code == 409
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_admin_list_subscriptions_and_role_gate(db_session, ctx):
    _bind(db_session)
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            sub = Subscription(
                organization_id=ctx["org"].id,
                sku="pro",
                status="active",
                cycle="monthly",
                provider="manual",
            )
            db_session.add(sub)
            await db_session.commit()

            listed = await client.get(
                "/api/admin/subscriptions",
                headers=_auth(ctx["admin"]),
            )
            assert listed.status_code == 200
            body = listed.json()
            assert body["total"] == 1
            assert body["items"][0]["organization_name"] == "Billing Org"

            forbidden = await client.get(
                "/api/admin/subscriptions",
                headers=_auth(ctx["owner"]),
            )
            assert forbidden.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_invalid_transition_raises(db_session, ctx):
    service = BillingService(db_session)
    sub = Subscription(
        organization_id=ctx["org"].id,
        sku="basic",
        status="incomplete",
        cycle="monthly",
        provider="manual",
    )
    with pytest.raises(BillingTransitionError):
        service._transition(sub, "past_due")
