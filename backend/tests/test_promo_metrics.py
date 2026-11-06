import logging
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import Engine, create_engine, text

import app.metrics as metrics_mod
from app.metrics import (
    PromoDiscount24hCollector,
    PromoDiscount30dCollector,
    PromoPendingApprovalsCollector,
    PromoRedemptions24hCollector,
    _read_promo_discount_idr_24h,
    _read_promo_discount_idr_30d,
    _read_promo_pending_approvals,
    _read_promo_redemptions_24h,
    register_custom_metrics,
)

PROMO_METRIC_READERS = (
    _read_promo_discount_idr_24h,
    _read_promo_discount_idr_30d,
    _read_promo_redemptions_24h,
    _read_promo_pending_approvals,
)

DATETIME_ADAPTER_WARNING = "ignore:The default datetime adapter is deprecated"


@pytest.fixture
def reset_registration_flag():
    previous = metrics_mod._collector_registered
    metrics_mod._collector_registered = False
    yield
    metrics_mod._collector_registered = previous


def _only_sample(collector):
    families = list(collector.collect())
    assert len(families) == 1
    family = families[0]
    samples = [s for s in family.samples if s.name == family.name]
    assert len(samples) == 1
    return family, samples[0]


def _engine_with_scalar(scalar: object) -> MagicMock:
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value.execute.return_value.scalar.return_value = scalar
    return engine


def _sqlite_engine(tmp_path, name: str) -> Engine:
    engine = create_engine(f"sqlite:///{tmp_path / name}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE promo_redemptions ("
                "id VARCHAR PRIMARY KEY, discount_idr INTEGER NOT NULL, "
                "status VARCHAR NOT NULL, created_at DATETIME NOT NULL)"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE promo_codes ("
                "id VARCHAR PRIMARY KEY, requires_approval BOOLEAN NOT NULL, "
                "approved_at DATETIME NULL)"
            )
        )
    return engine


def _insert_redemption(engine: Engine, *, row_id: str, discount_idr: int, status: str, created_at: datetime) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO promo_redemptions (id, discount_idr, status, created_at) "
                "VALUES (:id, :discount_idr, :status, :created_at)"
            ),
            {"id": row_id, "discount_idr": discount_idr, "status": status, "created_at": created_at},
        )


def _insert_promo_code(
    engine: Engine, *, row_id: str, requires_approval: bool, approved_at: datetime | None
) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO promo_codes (id, requires_approval, approved_at) "
                "VALUES (:id, :requires_approval, :approved_at)"
            ),
            {"id": row_id, "requires_approval": requires_approval, "approved_at": approved_at},
        )


class TestPromoDiscount24hReader:
    @pytest.mark.filterwarnings(DATETIME_ADAPTER_WARNING)
    def test_sums_applied_redemptions_inside_the_window(self, tmp_path):
        engine = _sqlite_engine(tmp_path, "discount24h.db")
        now = datetime.now(UTC)
        _insert_redemption(engine, row_id="a", discount_idr=1000, status="applied", created_at=now - timedelta(hours=1))
        _insert_redemption(engine, row_id="b", discount_idr=2500, status="applied", created_at=now - timedelta(hours=2))
        _insert_redemption(engine, row_id="c", discount_idr=900, status="applied", created_at=now - timedelta(hours=25))
        _insert_redemption(
            engine, row_id="d", discount_idr=5000, status="released", created_at=now - timedelta(hours=3)
        )

        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_promo_discount_idr_24h() == 3500.0
        engine.dispose()

    @pytest.mark.filterwarnings(DATETIME_ADAPTER_WARNING)
    def test_empty_table_returns_zero(self, tmp_path):
        engine = _sqlite_engine(tmp_path, "discount24h-empty.db")
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_promo_discount_idr_24h() == 0.0
        engine.dispose()


class TestPromoDiscount30dReader:
    @pytest.mark.filterwarnings(DATETIME_ADAPTER_WARNING)
    def test_includes_ten_days_and_excludes_forty_days(self, tmp_path):
        engine = _sqlite_engine(tmp_path, "discount30d.db")
        now = datetime.now(UTC)
        _insert_redemption(
            engine, row_id="old", discount_idr=400, status="applied", created_at=now - timedelta(days=10)
        )
        _insert_redemption(
            engine, row_id="ancient", discount_idr=700, status="applied", created_at=now - timedelta(days=40)
        )
        _insert_redemption(
            engine, row_id="released", discount_idr=900, status="released", created_at=now - timedelta(days=5)
        )

        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_promo_discount_idr_30d() == 400.0
        engine.dispose()

    @pytest.mark.filterwarnings(DATETIME_ADAPTER_WARNING)
    def test_empty_table_returns_zero(self, tmp_path):
        engine = _sqlite_engine(tmp_path, "discount30d-empty.db")
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_promo_discount_idr_30d() == 0.0
        engine.dispose()


class TestPromoRedemptions24hReader:
    @pytest.mark.filterwarnings(DATETIME_ADAPTER_WARNING)
    def test_counts_applied_only(self, tmp_path):
        engine = _sqlite_engine(tmp_path, "redemptions24h.db")
        now = datetime.now(UTC)
        _insert_redemption(engine, row_id="a", discount_idr=100, status="applied", created_at=now - timedelta(hours=1))
        _insert_redemption(engine, row_id="b", discount_idr=100, status="applied", created_at=now - timedelta(hours=4))
        _insert_redemption(engine, row_id="c", discount_idr=100, status="released", created_at=now - timedelta(hours=2))
        _insert_redemption(engine, row_id="d", discount_idr=100, status="applied", created_at=now - timedelta(hours=25))

        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_promo_redemptions_24h() == 2.0
        engine.dispose()

    @pytest.mark.filterwarnings(DATETIME_ADAPTER_WARNING)
    def test_empty_table_returns_zero(self, tmp_path):
        engine = _sqlite_engine(tmp_path, "redemptions24h-empty.db")
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_promo_redemptions_24h() == 0.0
        engine.dispose()


class TestPromoPendingApprovalsReader:
    @pytest.mark.filterwarnings(DATETIME_ADAPTER_WARNING)
    def test_counts_unapproved_codes_only(self, tmp_path):
        engine = _sqlite_engine(tmp_path, "pending.db")
        now = datetime.now(UTC)
        # Two codes above the cap are still waiting for a second admin.
        _insert_promo_code(engine, row_id="pending-1", requires_approval=True, approved_at=None)
        _insert_promo_code(engine, row_id="pending-2", requires_approval=True, approved_at=None)
        # Already approved, or below the cap: neither belongs in the queue.
        _insert_promo_code(engine, row_id="approved", requires_approval=True, approved_at=now - timedelta(days=1))
        _insert_promo_code(engine, row_id="normal", requires_approval=False, approved_at=None)

        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_promo_pending_approvals() == 2.0
        engine.dispose()

    @pytest.mark.filterwarnings(DATETIME_ADAPTER_WARNING)
    def test_empty_table_returns_zero(self, tmp_path):
        engine = _sqlite_engine(tmp_path, "pending-empty.db")
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_promo_pending_approvals() == 0.0
        engine.dispose()


@pytest.mark.parametrize("reader", PROMO_METRIC_READERS)
def test_reader_returns_none_when_engine_raises(reader, caplog):
    with (
        caplog.at_level(logging.DEBUG, logger="app.metrics"),
        patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")),
    ):
        assert reader() is None
    assert any("promo" in record.message for record in caplog.records)


class TestPromoDiscount24hCollector:
    def test_emits_discount(self):
        with patch("app.metrics._read_promo_discount_idr_24h", return_value=3500.0):
            family, sample = _only_sample(PromoDiscount24hCollector())

        assert family.name == "vuln_promo_discount_idr_24h"
        assert family.type == "gauge"
        assert sample.value == 3500.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_promo_discount_idr_24h", return_value=None):
            assert list(PromoDiscount24hCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_promo_discount_idr_24h", side_effect=RuntimeError("db down")):
            assert list(PromoDiscount24hCollector().collect()) == []


class TestPromoDiscount30dCollector:
    def test_emits_discount(self):
        with patch("app.metrics._read_promo_discount_idr_30d", return_value=12000.0):
            family, sample = _only_sample(PromoDiscount30dCollector())

        assert family.name == "vuln_promo_discount_idr_30d"
        assert family.type == "gauge"
        assert sample.value == 12000.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_promo_discount_idr_30d", return_value=None):
            assert list(PromoDiscount30dCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_promo_discount_idr_30d", side_effect=RuntimeError("db down")):
            assert list(PromoDiscount30dCollector().collect()) == []


class TestPromoRedemptions24hCollector:
    def test_emits_count(self):
        with patch("app.metrics._read_promo_redemptions_24h", return_value=7.0):
            family, sample = _only_sample(PromoRedemptions24hCollector())

        assert family.name == "vuln_promo_redemptions_24h"
        assert family.type == "gauge"
        assert sample.value == 7.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_promo_redemptions_24h", return_value=None):
            assert list(PromoRedemptions24hCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_promo_redemptions_24h", side_effect=RuntimeError("db down")):
            assert list(PromoRedemptions24hCollector().collect()) == []


class TestPromoPendingApprovalsCollector:
    def test_emits_depth(self):
        with patch("app.metrics._read_promo_pending_approvals", return_value=2.0):
            family, sample = _only_sample(PromoPendingApprovalsCollector())

        assert family.name == "vuln_promo_pending_approvals"
        assert family.type == "gauge"
        assert sample.value == 2.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_promo_pending_approvals", return_value=None):
            assert list(PromoPendingApprovalsCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_promo_pending_approvals", side_effect=RuntimeError("db down")):
            assert list(PromoPendingApprovalsCollector().collect()) == []


class TestPromoMetricRegistration:
    def test_all_promo_collectors_are_registered(self, reset_registration_flag):
        with patch.object(metrics_mod.REGISTRY, "register") as mock_reg:
            register_custom_metrics()

        classes = {type(call.args[0]).__name__ for call in mock_reg.call_args_list}
        assert {
            "PromoDiscount24hCollector",
            "PromoDiscount30dCollector",
            "PromoRedemptions24hCollector",
            "PromoPendingApprovalsCollector",
        } <= classes

    def test_all_promo_metric_names_are_exported(self):
        assert {
            metrics_mod._PROMO_DISCOUNT_24H_NAME,
            metrics_mod._PROMO_DISCOUNT_30D_NAME,
            metrics_mod._PROMO_REDEMPTIONS_24H_NAME,
            metrics_mod._PROMO_PENDING_APPROVALS_NAME,
        } == {
            "vuln_promo_discount_idr_24h",
            "vuln_promo_discount_idr_30d",
            "vuln_promo_redemptions_24h",
            "vuln_promo_pending_approvals",
        }
