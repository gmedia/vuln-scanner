"""AI top-up expiry worker behaviour."""

import json
import sys
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

_WORKERS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_WORKERS))
sys.path.insert(0, str(_WORKERS.parent / "backend"))

import app.models  # noqa: E402,F401  # register every table before create_all
import pytest  # noqa: E402
from app.database import Base  # noqa: E402
from app.models.ai_gateway import AiTopupOrder  # noqa: E402
from app.models.billing import PaymentAttempt  # noqa: E402
from sqlalchemy import String, Text, TypeDecorator, create_engine  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB  # noqa: E402
from sqlalchemy.dialects.postgresql import UUID as PG_UUID  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from tasks.ai_topup import expire_stale_orders, expire_stale_topup_orders  # noqa: E402


class _UUIDType(TypeDecorator):
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class _JSONBType(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            return json.loads(value)
        return value


def _swap_sqlite_types() -> dict[tuple[str, str], object]:
    originals: dict[tuple[str, str], object] = {}
    for table in Base.metadata.tables.values():
        for column in table.columns:
            is_uuid = isinstance(column.type, PG_UUID)
            is_jsonb = isinstance(column.type, PG_JSONB)
            if not (is_uuid or is_jsonb):
                continue
            originals[(table.name, column.name)] = column.type
            column.type = _UUIDType() if is_uuid else _JSONBType()
    return originals


def _restore_sqlite_types(originals: dict[tuple[str, str], object]) -> None:
    for (table_name, column_name), column_type in originals.items():
        Base.metadata.tables[table_name].columns[column_name].type = column_type


@pytest.fixture
def session() -> Iterator[Session]:
    originals = _swap_sqlite_types()
    engine = create_engine("sqlite://")
    try:
        Base.metadata.create_all(engine)
        with sessionmaker(bind=engine, expire_on_commit=False)() as db:
            yield db
        Base.metadata.drop_all(engine)
    finally:
        _restore_sqlite_types(originals)
        engine.dispose()


def _seed_order(
    db: Session,
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
    db.add(order)
    if attempt_status is not None:
        db.add(
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
    db.commit()
    return order


def test_overdue_pending_order_and_attempt_are_expired(session: Session) -> None:
    now = datetime.now(UTC)
    order = _seed_order(session, status="pending_payment", expires_at=now - timedelta(minutes=5))

    count = expire_stale_orders(session, now=now)
    session.commit()

    assert count == 1
    session.refresh(order)
    assert order.status == "expired"
    attempt = session.query(PaymentAttempt).filter_by(topup_order_id=order.id).one()
    assert attempt.status == "expired"
    assert attempt.provider_status == "expired"
    assert attempt.failed_at is not None


def test_awaiting_verification_and_paid_are_untouched(session: Session) -> None:
    now = datetime.now(UTC)
    awaiting = _seed_order(
        session,
        status="awaiting_verification",
        expires_at=now - timedelta(days=1),
        attempt_status=None,
    )
    paid = _seed_order(
        session,
        status="paid",
        expires_at=now - timedelta(days=1),
        attempt_status="succeeded",
    )

    count = expire_stale_orders(session, now=now)
    session.commit()

    assert count == 0
    session.refresh(awaiting)
    session.refresh(paid)
    assert awaiting.status == "awaiting_verification"
    assert paid.status == "paid"
    attempt = session.query(PaymentAttempt).filter_by(topup_order_id=paid.id).one()
    assert attempt.status == "succeeded"


def test_future_expiry_is_not_expired(session: Session) -> None:
    now = datetime.now(UTC)
    order = _seed_order(session, status="pending_payment", expires_at=now + timedelta(hours=1))

    assert expire_stale_orders(session, now=now) == 0
    session.refresh(order)
    assert order.status == "pending_payment"


def test_second_run_is_a_noop(session: Session) -> None:
    now = datetime.now(UTC)
    _seed_order(session, status="pending_payment", expires_at=now - timedelta(minutes=5))

    assert expire_stale_orders(session, now=now) == 1
    session.commit()
    assert expire_stale_orders(session, now=now) == 0
    session.commit()


def test_task_returns_expired_count_and_commits(session: Session) -> None:
    now = datetime.now(UTC)
    _seed_order(session, status="pending_payment", expires_at=now - timedelta(minutes=1))
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False)

    with patch("tasks.ai_topup.get_sync_session", return_value=factory()):
        outcome = expire_stale_topup_orders()

    assert outcome == {"expired": 1}
    with factory() as check:
        order = check.query(AiTopupOrder).one()
        assert order.status == "expired"
