import sys
from pathlib import Path

_WORKERS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_WORKERS))
sys.path.insert(0, str(_WORKERS.parent / "backend"))

import json  # noqa: E402
import uuid  # noqa: E402
from collections.abc import Iterator  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402
from unittest.mock import MagicMock  # noqa: E402

import app.models  # noqa: E402,F401  # register every table before create_all
import pytest  # noqa: E402
from app.database import Base  # noqa: E402
from app.models.ai_gateway import AiReservation, AiWallet, AiWalletLedger  # noqa: E402
from sqlalchemy import String, Text, TypeDecorator, create_engine, select  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB  # noqa: E402
from sqlalchemy.dialects.postgresql import UUID as PG_UUID  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402

from tasks import ai_reservations  # noqa: E402
from tasks.ai_reservations import reap_stale_reservations  # noqa: E402


class _UUIDType(TypeDecorator):
    impl = String(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value.hex
        return str(value).replace("-", "")

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


for _table in Base.metadata.tables.values():
    for _column in _table.columns:
        if isinstance(_column.type, PG_UUID):
            _column.type = _UUIDType()
        elif isinstance(_column.type, PG_JSONB):
            _column.type = _JSONBType()


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        yield db
    Base.metadata.drop_all(engine)
    engine.dispose()


def _seed(
    db: Session,
    *,
    status: str = "open",
    minutes_old: int = 30,
    balance_idr: int = 1_000,
    hold_idr: int = 400,
    organization_id: uuid.UUID | None = None,
) -> tuple[uuid.UUID, uuid.UUID]:
    organization_id = organization_id or uuid.uuid4()
    reservation_id = uuid.uuid4()
    db.add(AiWallet(organization_id=organization_id, balance_idr=balance_idr))
    db.add(
        AiReservation(
            id=reservation_id,
            organization_id=organization_id,
            hold_idr=hold_idr,
            status=status,
            created_at=datetime.now(UTC) - timedelta(minutes=minutes_old),
        )
    )
    db.commit()
    return organization_id, reservation_id


def _release_ledger(db: Session) -> list[AiWalletLedger]:
    return list(db.execute(select(AiWalletLedger).where(AiWalletLedger.kind == "release")).scalars().all())


def test_releases_stale_open_reservation_and_refunds_hold(session: Session) -> None:
    organization_id, reservation_id = _seed(session)

    released, refunded = reap_stale_reservations(session)
    session.commit()

    reservation = session.get(AiReservation, reservation_id)
    wallet = session.execute(select(AiWallet).where(AiWallet.organization_id == organization_id)).scalar_one()
    ledger = _release_ledger(session)

    assert (released, refunded) == (1, 400)
    assert reservation is not None and reservation.status == "released"
    assert wallet.balance_idr == 1_400
    assert len(ledger) == 1
    assert ledger[0].reservation_id == reservation_id
    assert ledger[0].delta_idr == 400
    assert ledger[0].balance_after_idr == 1_400


def test_leaves_fresh_open_reservation_untouched(session: Session) -> None:
    organization_id, reservation_id = _seed(session, minutes_old=5)

    released, refunded = reap_stale_reservations(session)
    session.commit()

    reservation = session.get(AiReservation, reservation_id)
    wallet = session.execute(select(AiWallet).where(AiWallet.organization_id == organization_id)).scalar_one()

    assert (released, refunded) == (0, 0)
    assert reservation is not None and reservation.status == "open"
    assert wallet.balance_idr == 1_000
    assert _release_ledger(session) == []


@pytest.mark.parametrize("status", ["settled", "released"])
def test_leaves_closed_reservations_untouched(session: Session, status: str) -> None:
    organization_id, reservation_id = _seed(session, status=status, minutes_old=30)

    released, refunded = reap_stale_reservations(session)
    session.commit()

    reservation = session.get(AiReservation, reservation_id)
    wallet = session.execute(select(AiWallet).where(AiWallet.organization_id == organization_id)).scalar_one()

    assert (released, refunded) == (0, 0)
    assert reservation is not None and reservation.status == status
    assert wallet.balance_idr == 1_000
    assert _release_ledger(session) == []


def test_second_run_is_a_noop(session: Session) -> None:
    organization_id, _ = _seed(session)

    assert reap_stale_reservations(session) == (1, 400)
    session.commit()
    assert reap_stale_reservations(session) == (0, 0)
    session.commit()

    wallet = session.execute(select(AiWallet).where(AiWallet.organization_id == organization_id)).scalar_one()
    assert wallet.balance_idr == 1_400
    assert len(_release_ledger(session)) == 1


def test_task_wrapper_returns_error_when_core_raises(monkeypatch) -> None:
    session = MagicMock()
    monkeypatch.setattr(ai_reservations, "get_sync_session", MagicMock(return_value=session))
    monkeypatch.setattr(
        ai_reservations,
        "reap_stale_reservations",
        MagicMock(side_effect=RuntimeError("db down")),
    )

    assert ai_reservations.reap_ai_reservations() == {"error": "reap_failed"}
    session.rollback.assert_called_once()
    session.commit.assert_not_called()
    session.close.assert_called_once()
