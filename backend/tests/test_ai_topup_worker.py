"""AI top-up S6: expire worker behaviour."""

from __future__ import annotations

import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base
from app.models.ai_gateway import AiTopupOrder
from app.models.billing import PaymentAttempt

_WORKERS = Path(__file__).resolve().parents[2] / "workers"
if str(_WORKERS) not in sys.path:
    sys.path.insert(0, str(_WORKERS))

from tasks.ai_topup import expire_stale_orders, expire_stale_topup_orders  # noqa: E402


@pytest.fixture
def sync_session(tmp_path) -> Session:
    engine = create_engine(f"sqlite:///{tmp_path / 'topup-worker.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    session = factory()
    yield session
    session.close()
    engine.dispose()


def _seed_order(
    session: Session,
    *,
    status: str,
    expires_at: datetime,
    attempt_status: str | None = "pending",
) -> AiTopupOrder:
    org_id = uuid.uuid4()
    order = AiTopupOrder(
        id=uuid.uuid4(),
        organization_id=org_id,
        reference_code=f"261101-{uuid.uuid4().hex[:6].upper()}",
        amount_idr=100_000,
        credit_idr=100_000,
        bonus_idr=0,
        currency="IDR",
        payment_method="manual_transfer",
        status=status,
        proof_object_key="proof/seed" if status == "awaiting_verification" else None,
        expires_at=expires_at,
    )
    session.add(order)
    if attempt_status is not None:
        session.add(
            PaymentAttempt(
                id=uuid.uuid4(),
                organization_id=org_id,
                payable_kind="topup",
                topup_order_id=order.id,
                provider="midtrans",
                amount_idr=100_000,
                status=attempt_status,
            )
        )
    session.commit()
    return order


def test_overdue_pending_order_and_attempt_are_expired(sync_session: Session) -> None:
    now = datetime.now(UTC)
    order = _seed_order(sync_session, status="pending_payment", expires_at=now - timedelta(minutes=5))

    count = expire_stale_orders(sync_session, now=now)
    sync_session.commit()

    assert count == 1
    sync_session.refresh(order)
    assert order.status == "expired"
    attempt = sync_session.query(PaymentAttempt).filter_by(topup_order_id=order.id).one()
    assert attempt.status == "expired"
    assert attempt.provider_status == "expired"
    assert attempt.failed_at is not None


def test_awaiting_verification_and_paid_are_untouched(sync_session: Session) -> None:
    now = datetime.now(UTC)
    awaiting = _seed_order(
        sync_session,
        status="awaiting_verification",
        expires_at=now - timedelta(days=1),
        attempt_status=None,
    )
    paid = _seed_order(
        sync_session,
        status="paid",
        expires_at=now - timedelta(days=1),
        attempt_status="succeeded",
    )

    count = expire_stale_orders(sync_session, now=now)
    sync_session.commit()

    assert count == 0
    sync_session.refresh(awaiting)
    sync_session.refresh(paid)
    assert awaiting.status == "awaiting_verification"
    assert paid.status == "paid"
    attempt = sync_session.query(PaymentAttempt).filter_by(topup_order_id=paid.id).one()
    assert attempt.status == "succeeded"


def test_future_expiry_is_not_expired(sync_session: Session) -> None:
    now = datetime.now(UTC)
    order = _seed_order(sync_session, status="pending_payment", expires_at=now + timedelta(hours=1))

    assert expire_stale_orders(sync_session, now=now) == 0
    sync_session.refresh(order)
    assert order.status == "pending_payment"


def test_second_run_is_a_noop(sync_session: Session) -> None:
    now = datetime.now(UTC)
    _seed_order(sync_session, status="pending_payment", expires_at=now - timedelta(minutes=5))

    assert expire_stale_orders(sync_session, now=now) == 1
    sync_session.commit()
    assert expire_stale_orders(sync_session, now=now) == 0
    sync_session.commit()


def test_task_returns_expired_count_and_commits(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'topup-task.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    now = datetime.now(UTC)
    with factory() as seed:
        _seed_order(seed, status="pending_payment", expires_at=now - timedelta(minutes=1))

    with patch("tasks.ai_topup.get_sync_session", return_value=factory()):
        outcome = expire_stale_topup_orders()

    assert outcome == {"expired": 1}
    with factory() as check:
        order = check.query(AiTopupOrder).one()
        assert order.status == "expired"
    engine.dispose()
