from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import PaymentAttempt, PaymentEvent
from app.models.invoice import OrgInvoice
from app.models.organization import Organization
from app.services.billing import PAYMENT_EVENT_RETENTION_DAYS, BillingService


def _event(
    *,
    status: str,
    days_ago: int,
    event_id: str | None = None,
) -> PaymentEvent:
    now = datetime.now(UTC)
    received_at = now - timedelta(days=days_ago)
    return PaymentEvent(
        provider="midtrans",
        event_id=event_id or f"evt-{uuid.uuid4().hex[:12]}",
        event_type="payment.succeeded",
        payload={"order_id": "order-1"},
        status=status,
        received_at=received_at,
        processed_at=received_at,
    )

async def _remaining(db: AsyncSession) -> list[PaymentEvent]:
    return list((await db.execute(select(PaymentEvent))).scalars().all())

def test_retention_constant_is_one_year() -> None:
    assert PAYMENT_EVENT_RETENTION_DAYS == 365

@pytest.mark.asyncio
async def test_old_processed_event_is_deleted(db_session: AsyncSession) -> None:
    db_session.add(_event(status="processed", days_ago=400))
    await db_session.commit()

    deleted = await BillingService(db_session).prune_payment_events()

    assert deleted == 1
    assert await _remaining(db_session) == []

@pytest.mark.asyncio
async def test_old_received_and_failed_events_are_kept(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            _event(status="received", days_ago=400),
            _event(status="failed", days_ago=400),
        ]
    )
    await db_session.commit()

    deleted = await BillingService(db_session).prune_payment_events()

    assert deleted == 0
    assert {event.status for event in await _remaining(db_session)} == {"received", "failed"}

@pytest.mark.asyncio
async def test_recent_processed_event_is_kept(db_session: AsyncSession) -> None:
    db_session.add(_event(status="processed", days_ago=30))
    await db_session.commit()

    deleted = await BillingService(db_session).prune_payment_events()

    assert deleted == 0
    assert len(await _remaining(db_session)) == 1

@pytest.mark.asyncio
async def test_boundary_keeps_rows_inside_the_window(db_session: AsyncSession) -> None:
    old_id = "evt-old"
    young_id = "evt-young"
    db_session.add_all(
        [
            _event(status="processed", days_ago=400, event_id=old_id),
            _event(status="processed", days_ago=300, event_id=young_id),
        ]
    )
    await db_session.commit()

    deleted = await BillingService(db_session).prune_payment_events(retention_days=365)

    assert deleted == 1
    assert [event.event_id for event in await _remaining(db_session)] == [young_id]

@pytest.mark.asyncio
async def test_return_value_and_second_run_is_idempotent(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            _event(status="processed", days_ago=400),
            _event(status="ignored", days_ago=400),
            _event(status="processed", days_ago=10),
        ]
    )
    await db_session.commit()
    service = BillingService(db_session)

    assert await service.prune_payment_events() == 2
    assert await service.prune_payment_events() == 0
    assert len(await _remaining(db_session)) == 1

@pytest.mark.asyncio
async def test_pruning_leaves_attempts_and_invoices_untouched(db_session: AsyncSession) -> None:
    now = datetime.now(UTC)
    organization = Organization(
        id=uuid.uuid4(),
        name="Retention Org",
        slug=f"retention-{uuid.uuid4().hex[:8]}",
        kind="company",
        sku="basic",
    )
    db_session.add(organization)
    await db_session.flush()
    invoice = OrgInvoice(
        id=uuid.uuid4(),
        organization_id=organization.id,
        number=f"SX-{uuid.uuid4().hex[:10]}",
        product="scan",
        sku="basic",
        amount_idr=300_000,
        total_idr=300_000,
        period_start=now - timedelta(days=30),
        period_end=now,
        due_date=now,
        status="paid",
    )
    attempt = PaymentAttempt(
        id=uuid.uuid4(),
        organization_id=organization.id,
        invoice_id=invoice.id,
        provider="midtrans",
        provider_order_id=f"order-{uuid.uuid4().hex[:8]}",
        amount_idr=300_000,
        status="succeeded",
    )
    db_session.add_all([invoice, attempt, _event(status="processed", days_ago=400)])
    await db_session.commit()

    assert await BillingService(db_session).prune_payment_events() == 1

    assert (await db_session.execute(select(func.count()).select_from(PaymentAttempt))).scalar_one() == 1
    assert (await db_session.execute(select(func.count()).select_from(OrgInvoice))).scalar_one() == 1

@pytest.mark.asyncio
async def test_custom_retention_window_is_honoured(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            _event(status="processed", days_ago=20),
            _event(status="processed", days_ago=5),
        ]
    )
    await db_session.commit()

    deleted = await BillingService(db_session).prune_payment_events(retention_days=10)

    assert deleted == 1
    assert len(await _remaining(db_session)) == 1
