"""AI top-up S3: Midtrans webhook settlement for ``payable_kind='topup'``."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.ai_gateway import AiTopupOrder, AiWallet, AiWalletLedger
from app.models.billing import PaymentAttempt, PaymentEvent
from app.models.organization import Organization
from app.models.user import User
from app.services.ai_wallet import get_wallet
from app.services.billing import BillingService
from app.services.payments.base import NormalizedEvent

AMOUNT = 100_000


async def _seed(
    db: AsyncSession,
    *,
    order_status: str = "pending_payment",
    attempt_status: str = "pending",
    attempt_amount: int = AMOUNT,
) -> tuple[AiTopupOrder, PaymentAttempt]:
    now = datetime.now(UTC)
    user = User(
        id=uuid.uuid4(),
        email=f"topup-wh-{uuid.uuid4().hex[:6]}@example.com",
        password_hash="fake-hash",
        is_verified=True,
        credits=100,
    )
    db.add(user)
    await db.flush()
    org = Organization(
        id=uuid.uuid4(),
        name="Topup Webhook Org",
        slug=f"topup-wh-{uuid.uuid4().hex[:6]}",
        kind="company",
        sku="basic",
        created_by_user_id=user.id,
    )
    db.add(org)
    await db.flush()
    reference = f"261101-{uuid.uuid4().hex[:6].upper()}"
    order = AiTopupOrder(
        id=uuid.uuid4(),
        organization_id=org.id,
        created_by_user_id=user.id,
        reference_code=reference,
        amount_idr=AMOUNT,
        credit_idr=AMOUNT,
        bonus_idr=0,
        currency="IDR",
        payment_method="midtrans",
        status=order_status,
        expires_at=now + timedelta(hours=24),
        proof_object_key="proof/seed" if order_status == "awaiting_verification" else None,
    )
    db.add(order)
    await db.flush()
    attempt = PaymentAttempt(
        provider="midtrans",
        provider_order_id=f"{reference}-A1",
        payable_kind="topup",
        topup_order_id=order.id,
        organization_id=org.id,
        amount_idr=attempt_amount,
        currency="IDR",
        status=attempt_status,
        attempt_seq=1,
        expires_at=now + timedelta(hours=24),
    )
    db.add(attempt)
    await db.commit()
    await db.refresh(order)
    await db.refresh(attempt)
    return order, attempt


def _event(
    kind: str,
    attempt: PaymentAttempt,
    *,
    event_id: str | None = None,
    amount_idr: int = AMOUNT,
    refunded_amount_idr: int = 0,
    method: str = "qris",
    fee_idr: int = 0,
) -> NormalizedEvent:
    return NormalizedEvent(
        event_id=event_id or f"{attempt.id}:{kind}:{uuid.uuid4().hex[:6]}",
        kind=kind,
        provider_order_id=attempt.provider_order_id,
        provider_payment_id=f"pay-{uuid.uuid4().hex[:8]}",
        amount_idr=amount_idr,
        currency="IDR",
        fee_idr=fee_idr,
        refunded_amount_idr=refunded_amount_idr,
        method=method,
    )


async def _apply(db: AsyncSession, event: NormalizedEvent) -> str:
    result = await BillingService(db).apply_gateway_event("midtrans", event)
    return result.status


async def _ledger_rows(db: AsyncSession, order_id: uuid.UUID) -> list[AiWalletLedger]:
    return list(
        (await db.execute(select(AiWalletLedger).where(AiWalletLedger.topup_order_id == order_id))).scalars().all()
    )


@pytest.fixture(autouse=True)
def _verify_off(monkeypatch: pytest.MonkeyPatch) -> None:
    # Settlement behaviour under test, not the provider status round-trip.
    monkeypatch.setattr(settings, "midtrans_verify_status", False)


@pytest.mark.asyncio
async def test_succeeded_credits_once_and_marks_paid(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    status = await _apply(db_session, _event("succeeded", attempt, event_id="evt-ok", fee_idr=2_500))

    assert status == "processed"
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    assert order.status == "paid"
    assert order.paid_at is not None
    assert attempt.status == "succeeded"
    assert attempt.provider_status == "succeeded"
    assert attempt.method == "qris"
    assert attempt.fee_idr == 2_500

    ledger = await _ledger_rows(db_session, order.id)
    assert len(ledger) == 1
    assert ledger[0].kind == "topup"
    assert ledger[0].delta_idr == AMOUNT
    assert ledger[0].note == order.reference_code
    wallet = await get_wallet(db_session, order.organization_id)
    assert wallet is not None
    assert wallet.balance_idr == AMOUNT
    assert (await db_session.execute(select(func.sum(AiWalletLedger.delta_idr)))).scalar() == wallet.balance_idr


@pytest.mark.asyncio
async def test_amount_mismatch_fails_without_credit(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    status = await _apply(
        db_session,
        _event("succeeded", attempt, event_id="evt-mismatch", amount_idr=AMOUNT - 1),
    )

    assert status == "failed"
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    assert order.status == "pending_payment"
    assert attempt.status == "failed"
    assert attempt.failure_code == "amount_mismatch"
    assert await _ledger_rows(db_session, order.id) == []
    assert await get_wallet(db_session, order.organization_id) is None
    record = (
        await db_session.execute(select(PaymentEvent).where(PaymentEvent.event_id == "evt-mismatch"))
    ).scalar_one()
    assert record.status == "failed"
    assert "amount" in (record.error or "")


@pytest.mark.asyncio
async def test_duplicate_event_id_is_deduplicated(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)
    event = _event("succeeded", attempt, event_id="evt-same")

    first = await _apply(db_session, event)
    second = await _apply(db_session, event)

    assert first == "processed"
    assert second == "duplicate"
    assert len(await _ledger_rows(db_session, order.id)) == 1
    wallet = await get_wallet(db_session, order.organization_id)
    assert wallet is not None and wallet.balance_idr == AMOUNT


@pytest.mark.asyncio
async def test_two_event_ids_for_one_order_credit_once(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    first = await _apply(db_session, _event("succeeded", attempt, event_id="evt-a"))
    second = await _apply(db_session, _event("succeeded", attempt, event_id="evt-b"))

    assert first == "processed"
    assert second == "processed"
    await db_session.refresh(attempt)
    assert attempt.provider_status == "duplicate"
    assert len(await _ledger_rows(db_session, order.id)) == 1
    wallet = await get_wallet(db_session, order.organization_id)
    assert wallet is not None and wallet.balance_idr == AMOUNT


@pytest.mark.asyncio
async def test_succeeded_after_local_expiry_still_credits(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    expired = await _apply(db_session, _event("expired", attempt, event_id="evt-exp"))
    assert expired == "processed"
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    assert order.status == "expired"
    assert attempt.status == "expired"

    status = await _apply(db_session, _event("succeeded", attempt, event_id="evt-late"))
    assert status == "processed"
    await db_session.refresh(order)
    assert order.status == "paid"
    assert len(await _ledger_rows(db_session, order.id)) == 1
    wallet = await get_wallet(db_session, order.organization_id)
    assert wallet is not None and wallet.balance_idr == AMOUNT


@pytest.mark.asyncio
async def test_succeeded_after_cancel_still_credits(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session, order_status="canceled", attempt_status="expired")

    status = await _apply(db_session, _event("succeeded", attempt, event_id="evt-after-cancel"))

    assert status == "processed"
    await db_session.refresh(order)
    assert order.status == "paid"
    assert len(await _ledger_rows(db_session, order.id)) == 1


@pytest.mark.asyncio
async def test_refund_after_succeeded_needs_review_without_clawback(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)
    await _apply(db_session, _event("succeeded", attempt, event_id="evt-settle"))

    status = await _apply(
        db_session,
        _event("refunded", attempt, event_id="evt-refund", refunded_amount_idr=AMOUNT),
    )

    assert status == "processed"
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    assert order.status == "refund_review"
    assert attempt.status == "refunded"
    assert attempt.refunded_amount_idr == AMOUNT
    ledger = await _ledger_rows(db_session, order.id)
    assert len(ledger) == 1
    assert ledger[0].kind == "topup"
    wallet = await get_wallet(db_session, order.organization_id)
    assert wallet is not None and wallet.balance_idr == AMOUNT


@pytest.mark.asyncio
async def test_refund_before_settlement_is_ignored(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    status = await _apply(
        db_session,
        _event("refunded", attempt, event_id="evt-early-refund", refunded_amount_idr=AMOUNT),
    )

    assert status == "ignored"
    await db_session.refresh(order)
    assert order.status == "pending_payment"
    assert await _ledger_rows(db_session, order.id) == []


@pytest.mark.asyncio
async def test_succeeded_after_refund_review_is_refused(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session, order_status="refund_review", attempt_status="succeeded")

    status = await _apply(db_session, _event("succeeded", attempt, event_id="evt-refund-review"))

    assert status == "failed"
    assert await _ledger_rows(db_session, order.id) == []
    record = (
        await db_session.execute(select(PaymentEvent).where(PaymentEvent.event_id == "evt-refund-review"))
    ).scalar_one()
    assert record.status == "failed"
    assert "refund_review" in (record.error or "")


@pytest.mark.asyncio
async def test_failed_event_keeps_order_retryable(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    status = await _apply(db_session, _event("failed", attempt, event_id="evt-failed"))

    assert status == "processed"
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    assert order.status == "pending_payment"
    assert attempt.status == "failed"


@pytest.mark.asyncio
async def test_expired_event_expires_pending_order(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    status = await _apply(db_session, _event("expired", attempt, event_id="evt-expire"))

    assert status == "processed"
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    assert order.status == "expired"
    assert attempt.status == "expired"
    assert attempt.provider_status == "expired"


@pytest.mark.asyncio
async def test_canceled_event_cancels_pending_order(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    status = await _apply(db_session, _event("canceled", attempt, event_id="evt-cancel"))

    assert status == "processed"
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    assert order.status == "canceled"
    assert attempt.status == "expired"


@pytest.mark.asyncio
async def test_pending_event_keeps_order_pending(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)

    status = await _apply(db_session, _event("pending", attempt, event_id="evt-pending"))

    assert status == "processed"
    await db_session.refresh(order)
    await db_session.refresh(attempt)
    assert order.status == "pending_payment"
    assert attempt.status == "pending"
    assert attempt.provider_status == "pending"
    assert attempt.method == "qris"


@pytest.mark.asyncio
async def test_wallet_balance_matches_ledger_sum(db_session: AsyncSession) -> None:
    order, attempt = await _seed(db_session)
    await _apply(db_session, _event("succeeded", attempt, event_id="evt-sum"))

    wallet = (
        await db_session.execute(select(AiWallet).where(AiWallet.organization_id == order.organization_id))
    ).scalar_one()
    ledger_sum = (
        await db_session.execute(
            select(func.sum(AiWalletLedger.delta_idr)).where(AiWalletLedger.organization_id == order.organization_id)
        )
    ).scalar()
    assert wallet.balance_idr == ledger_sum == AMOUNT
