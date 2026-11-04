from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import PaymentAttempt, PaymentEvent
from app.models.invoice import OrgInvoice
from app.models.organization import Organization, OrganizationMembership
from app.models.user import User
from app.services.auth import hash_password
from app.services.billing import BillingService
from app.services.invoice import InvoiceService
from app.services.organization import ensure_personal_org
from app.services.payments.base import NormalizedEvent


async def _seed(
    db: AsyncSession,
    *,
    invoice_status: str = "sent",
    attempt_status: str = "pending",
) -> tuple[OrgInvoice, PaymentAttempt]:
    owner = User(
        id=uuid.uuid4(),
        email=f"svc-owner-{uuid.uuid4().hex[:6]}@example.com",
        password_hash=hash_password("Str0ng!Pass"),
        is_verified=True,
        credits=100,
    )
    db.add(owner)
    await db.flush()
    await ensure_personal_org(db, owner)
    org = Organization(
        id=uuid.uuid4(),
        name="Service Org",
        slug=f"svc-org-{uuid.uuid4().hex[:6]}",
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
        number=f"SX-{uuid.uuid4().hex[:10]}",
        product="scan",
        sku="pro",
        amount_idr=500_000,
        dpp_idr=500_000,
        total_idr=500_000,
        period_start=now - timedelta(days=1),
        period_end=now + timedelta(days=29),
        due_date=now + timedelta(days=7),
        status=invoice_status,
    )
    db.add(inv)
    await db.flush()
    attempt = PaymentAttempt(
        provider="midtrans",
        provider_order_id=f"{inv.number}-A1",
        invoice_id=inv.id,
        organization_id=org.id,
        amount_idr=inv.total_idr,
        currency="IDR",
        status=attempt_status,
        attempt_seq=1,
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(inv)
    await db.refresh(attempt)
    return inv, attempt


def _event(
    kind: str,
    *,
    order_id: str,
    event_id: str = "evt-1",
    amount_idr: int = 500_000,
    refunded_amount_idr: int = 0,
) -> NormalizedEvent:
    return NormalizedEvent(
        event_id=event_id,
        kind=kind,
        provider_order_id=order_id,
        provider_payment_id="trx-1",
        amount_idr=amount_idr,
        currency="IDR",
        refunded_amount_idr=refunded_amount_idr,
        method="bank_transfer",
        raw={
            "order_id": order_id,
            "transaction_id": "trx-1",
            "transaction_status": kind,
            "status_code": "200",
            "fraud_status": "accept",
            "gross_amount": "500000.00",
            "payment_type": "bank_transfer",
            "customer_details": {"email": "secret@example.com"},
            "signature_key": "should-not-be-stored",
        },
    )


@pytest.mark.asyncio
async def test_unknown_attempt_records_failed_event(db_session: AsyncSession) -> None:
    await _seed(db_session)
    event = _event("succeeded", order_id="missing-order")
    result = await BillingService(db_session).apply_gateway_event("midtrans", event)
    assert result.status == "failed"
    record = (await db_session.execute(select(PaymentEvent).where(PaymentEvent.event_id == "evt-1"))).scalar_one()
    assert record.status == "failed"
    assert record.error == "unknown attempt"


@pytest.mark.asyncio
async def test_lower_rank_event_is_ignored(db_session: AsyncSession) -> None:
    _inv, attempt = await _seed(db_session, invoice_status="paid", attempt_status="succeeded")
    event = _event("failed", order_id=attempt.provider_order_id or "")
    result = await BillingService(db_session).apply_gateway_event("midtrans", event)
    assert result.status == "ignored"
    await db_session.refresh(attempt)
    assert attempt.status == "succeeded"


@pytest.mark.asyncio
async def test_refund_records_amount_without_touching_subscription(db_session: AsyncSession) -> None:
    _inv, attempt = await _seed(db_session, invoice_status="paid", attempt_status="succeeded")
    event = _event(
        "refunded",
        order_id=attempt.provider_order_id or "",
        refunded_amount_idr=125_000,
    )
    result = await BillingService(db_session).apply_gateway_event("midtrans", event)
    assert result.status == "processed"
    await db_session.refresh(attempt)
    assert attempt.status == "refunded"
    assert attempt.provider_status == "refunded"
    assert attempt.refunded_amount_idr == 125_000


@pytest.mark.asyncio
async def test_pending_updates_provider_status(db_session: AsyncSession) -> None:
    _inv, attempt = await _seed(db_session)
    event = _event("pending", order_id=attempt.provider_order_id or "")
    result = await BillingService(db_session).apply_gateway_event("midtrans", event)
    assert result.status == "processed"
    await db_session.refresh(attempt)
    assert attempt.status == "pending"
    assert attempt.provider_status == "pending"


@pytest.mark.asyncio
async def test_unexpected_error_rolls_back_and_records_failed_event(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    inv, attempt = await _seed(db_session)

    async def boom(self, invoice_id, bank_ref):  # noqa: ANN001
        del self, invoice_id, bank_ref
        raise RuntimeError("boom")

    monkeypatch.setattr(InvoiceService, "_mark_paid", boom)
    event = _event("succeeded", order_id=attempt.provider_order_id or "")
    with pytest.raises(RuntimeError, match="boom"):
        await BillingService(db_session).apply_gateway_event("midtrans", event)

    await db_session.refresh(inv)
    await db_session.refresh(attempt)
    assert inv.status == "sent"
    assert attempt.status == "pending"
    record = (await db_session.execute(select(PaymentEvent).where(PaymentEvent.event_id == "evt-1"))).scalar_one()
    assert record.status == "failed"
    assert "boom" in (record.error or "")
