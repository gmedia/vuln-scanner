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

from tasks.ai_topup import (  # noqa: E402
    TOPUP_PROOF_RETENTION_DAYS,
    expire_stale_orders,
    expire_stale_topup_orders,
    purge_expired_topup_proofs,
    purge_expired_topup_proofs_task,
)


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
    proof_object_key: str | None = None,
    proof_mime: str | None = None,
    proof_size_bytes: int | None = None,
    proof_uploaded_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> AiTopupOrder:
    org_id = uuid.uuid4()
    if status == "awaiting_verification" and proof_object_key is None:
        proof_object_key = "proof/seed"
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
        proof_object_key=proof_object_key,
        proof_mime=proof_mime,
        proof_size_bytes=proof_size_bytes,
        proof_uploaded_at=proof_uploaded_at,
        expires_at=expires_at,
    )
    if updated_at is not None:
        order.updated_at = updated_at
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


def _seed_proof_order(
    db: Session,
    *,
    status: str,
    updated_at: datetime,
    proof_object_key: str,
    attempt_status: str | None = None,
) -> AiTopupOrder:
    return _seed_order(
        db,
        status=status,
        expires_at=updated_at,
        attempt_status=attempt_status,
        proof_object_key=proof_object_key,
        proof_mime="image/png",
        proof_size_bytes=4096,
        proof_uploaded_at=updated_at,
        updated_at=updated_at,
    )


def test_purge_deletes_proof_after_retention(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(UTC)
    terminal_at = now - timedelta(days=TOPUP_PROOF_RETENTION_DAYS + 1)
    order = _seed_proof_order(session, status="expired", updated_at=terminal_at, proof_object_key="proof/old")
    calls: list[str] = []
    monkeypatch.setattr("tasks.ai_topup.delete_proof", calls.append)

    purged = purge_expired_topup_proofs(session, now=now)
    session.commit()

    assert purged == 1
    assert calls == ["proof/old"]
    stored = session.get(AiTopupOrder, order.id)
    assert stored is not None
    assert stored.proof_object_key is None
    assert stored.proof_mime is None
    assert stored.proof_size_bytes is None
    assert stored.proof_uploaded_at is None


def test_purge_keeps_proof_inside_retention(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(UTC)
    terminal_at = now - timedelta(days=TOPUP_PROOF_RETENTION_DAYS - 1)
    order = _seed_proof_order(session, status="expired", updated_at=terminal_at, proof_object_key="proof/recent")
    calls: list[str] = []
    monkeypatch.setattr("tasks.ai_topup.delete_proof", calls.append)

    assert purge_expired_topup_proofs(session, now=now) == 0
    session.refresh(order)

    assert calls == []
    assert order.proof_object_key == "proof/recent"


def test_purge_keeps_paid_proof_of_any_age(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(UTC)
    terminal_at = now - timedelta(days=400)
    order = _seed_proof_order(
        session,
        status="paid",
        updated_at=terminal_at,
        proof_object_key="proof/paid",
        attempt_status="succeeded",
    )
    calls: list[str] = []
    monkeypatch.setattr("tasks.ai_topup.delete_proof", calls.append)

    assert purge_expired_topup_proofs(session, now=now) == 0
    session.refresh(order)

    assert calls == []
    assert order.proof_object_key == "proof/paid"


def test_purge_keeps_awaiting_verification_proof(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(UTC)
    terminal_at = now - timedelta(days=400)
    order = _seed_proof_order(
        session,
        status="awaiting_verification",
        updated_at=terminal_at,
        proof_object_key="proof/awaiting",
    )
    calls: list[str] = []
    monkeypatch.setattr("tasks.ai_topup.delete_proof", calls.append)

    assert purge_expired_topup_proofs(session, now=now) == 0
    session.refresh(order)

    assert calls == []
    assert order.proof_object_key == "proof/awaiting"


@pytest.mark.parametrize("status", ["expired", "rejected", "canceled"])
def test_purge_covers_every_terminal_status(session: Session, monkeypatch: pytest.MonkeyPatch, status: str) -> None:
    now = datetime.now(UTC)
    terminal_at = now - timedelta(days=TOPUP_PROOF_RETENTION_DAYS + 1)
    _seed_proof_order(session, status=status, updated_at=terminal_at, proof_object_key=f"proof/{status}")
    calls: list[str] = []
    monkeypatch.setattr("tasks.ai_topup.delete_proof", calls.append)

    assert purge_expired_topup_proofs(session, now=now) == 1
    assert calls == [f"proof/{status}"]


def test_second_purge_run_is_a_noop(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(UTC)
    terminal_at = now - timedelta(days=TOPUP_PROOF_RETENTION_DAYS + 1)
    _seed_proof_order(session, status="expired", updated_at=terminal_at, proof_object_key="proof/only")
    calls: list[str] = []
    monkeypatch.setattr("tasks.ai_topup.delete_proof", calls.append)

    assert purge_expired_topup_proofs(session, now=now) == 1
    session.commit()
    assert purge_expired_topup_proofs(session, now=now) == 0
    session.commit()

    assert calls == ["proof/only"]


def test_purge_task_returns_count_and_commits(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(UTC)
    terminal_at = now - timedelta(days=TOPUP_PROOF_RETENTION_DAYS + 1)
    _seed_proof_order(session, status="expired", updated_at=terminal_at, proof_object_key="proof/task")
    factory = sessionmaker(bind=session.get_bind(), expire_on_commit=False)
    calls: list[str] = []
    monkeypatch.setattr("tasks.ai_topup.delete_proof", calls.append)

    with patch("tasks.ai_topup.get_sync_session", return_value=factory()):
        outcome = purge_expired_topup_proofs_task()

    assert outcome == {"purged": 1}
    assert calls == ["proof/task"]
    with factory() as check:
        order = check.query(AiTopupOrder).one()
        assert order.proof_object_key is None
