import logging
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

import app.metrics as metrics_mod
from app.metrics import (
    PaymentAmountMismatchCollector,
    PaymentDuplicateSettlementCollector,
    PaymentFailedEventsCollector,
    PaymentPendingAgeCollector,
    PaymentPendingAttemptsCollector,
    PaymentRefundsCollector,
    _read_payment_amount_mismatches_24h,
    _read_payment_duplicate_settlements_24h,
    _read_payment_failed_events_24h,
    _read_payment_pending_age_seconds,
    _read_payment_pending_attempts,
    _read_payment_refunds_24h,
    register_custom_metrics,
)

PAYMENT_METRIC_READERS = (
    _read_payment_pending_attempts,
    _read_payment_pending_age_seconds,
    _read_payment_failed_events_24h,
    _read_payment_amount_mismatches_24h,
    _read_payment_duplicate_settlements_24h,
    _read_payment_refunds_24h,
)


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


class TestPaymentPendingAttemptsReader:
    def test_reader_returns_count(self):
        engine = _engine_with_scalar(4)
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_pending_attempts() == 4.0

    def test_reader_returns_zero_when_scalar_is_null(self):
        with patch("app.metrics._ai_engine", return_value=_engine_with_scalar(None)):
            assert _read_payment_pending_attempts() == 0.0


class TestPaymentPendingAgeReader:
    def _reader_returning(self, scalar: object) -> tuple[float | None, MagicMock]:
        engine = _engine_with_scalar(scalar)
        with patch("app.metrics._ai_engine", return_value=engine):
            return _read_payment_pending_age_seconds(), engine

    def test_reader_returns_oldest_pending_age(self):
        oldest = datetime.now(UTC) - timedelta(seconds=900)
        value, _ = self._reader_returning(oldest)
        assert value is not None
        assert 895 <= value <= 905

    def test_reader_returns_zero_when_no_pending_rows(self):
        value, _ = self._reader_returning(None)
        assert value == 0.0

    def test_reader_never_returns_a_negative_age(self):
        future = datetime.now(UTC) + timedelta(minutes=5)
        value, _ = self._reader_returning(future)
        assert value == 0.0

    def test_reader_accepts_naive_timestamps(self):
        oldest = (datetime.now(UTC) - timedelta(seconds=60)).replace(tzinfo=None)
        value, _ = self._reader_returning(oldest)
        assert value is not None
        assert 55 <= value <= 65


class TestPaymentFailedEventsReader:
    def test_reader_counts_failed_events_in_window(self):
        engine = _engine_with_scalar(2)
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_failed_events_24h() == 2.0

        executed = engine.connect.return_value.__enter__.return_value.execute.call_args
        sql = str(executed.args[0])
        assert "status = 'failed'" in sql
        assert "received_at >= :cutoff" in sql
        assert "cutoff" in executed.args[1]


class TestPaymentAmountMismatchReader:
    def test_reader_counts_amount_mismatches_in_window(self):
        engine = _engine_with_scalar(1)
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_amount_mismatches_24h() == 1.0

        executed = engine.connect.return_value.__enter__.return_value.execute.call_args
        sql = str(executed.args[0])
        assert "failure_code = 'amount_mismatch'" in sql
        assert "failed_at >= :cutoff" in sql


class TestPaymentDuplicateSettlementReader:
    def test_reader_counts_duplicate_settlements_in_window(self):
        engine = _engine_with_scalar(1)
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_duplicate_settlements_24h() == 1.0

        executed = engine.connect.return_value.__enter__.return_value.execute.call_args
        sql = str(executed.args[0])
        assert "provider_status = 'duplicate'" in sql
        assert "updated_at >= :cutoff" in sql


class TestPaymentRefundsReader:
    def test_reader_counts_refunds_in_window(self):
        engine = _engine_with_scalar(3)
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_refunds_24h() == 3.0

        executed = engine.connect.return_value.__enter__.return_value.execute.call_args
        sql = str(executed.args[0])
        assert "status = 'refunded'" in sql
        assert "updated_at >= :cutoff" in sql
        assert "cutoff" in executed.args[1]

    def test_reader_returns_zero_when_scalar_is_null(self):
        with patch("app.metrics._ai_engine", return_value=_engine_with_scalar(None)):
            assert _read_payment_refunds_24h() == 0.0

    @pytest.mark.filterwarnings("ignore:The default datetime adapter is deprecated")
    def test_reader_counts_only_settled_refunds_not_pending_attempts(self, tmp_path):
        from sqlalchemy import create_engine, text

        engine = create_engine(f"sqlite:///{tmp_path / 'refunds.db'}")
        now = datetime.now(UTC)
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE payment_attempts "
                    "(id VARCHAR PRIMARY KEY, status VARCHAR NOT NULL, updated_at DATETIME NOT NULL)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO payment_attempts (id, status, updated_at) "
                    "VALUES (:id, :status, :updated_at)"
                ),
                [
                    {"id": "pending", "status": "pending", "updated_at": now},
                    {"id": "refunded", "status": "refunded", "updated_at": now},
                ],
            )
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_refunds_24h() == 1.0
        engine.dispose()


@pytest.mark.parametrize("reader", PAYMENT_METRIC_READERS)
def test_reader_returns_none_when_engine_raises(reader, caplog):
    with (
        caplog.at_level(logging.DEBUG, logger="app.metrics"),
        patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")),
    ):
        assert reader() is None
    assert any("payment" in record.message for record in caplog.records)


class TestPaymentPendingAttemptsCollector:
    def test_emits_count(self):
        with patch("app.metrics._read_payment_pending_attempts", return_value=4.0):
            family, sample = _only_sample(PaymentPendingAttemptsCollector())

        assert family.name == "vuln_payment_pending_attempts"
        assert family.type == "gauge"
        assert sample.value == 4.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_payment_pending_attempts", return_value=None):
            assert list(PaymentPendingAttemptsCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_payment_pending_attempts", side_effect=RuntimeError("db down")):
            assert list(PaymentPendingAttemptsCollector().collect()) == []


class TestPaymentPendingAgeCollector:
    def test_emits_age(self):
        with patch("app.metrics._read_payment_pending_age_seconds", return_value=1200.0):
            family, sample = _only_sample(PaymentPendingAgeCollector())

        assert family.name == "vuln_payment_pending_age_seconds"
        assert family.type == "gauge"
        assert sample.value == 1200.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_payment_pending_age_seconds", return_value=None):
            assert list(PaymentPendingAgeCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_payment_pending_age_seconds", side_effect=RuntimeError("db down")):
            assert list(PaymentPendingAgeCollector().collect()) == []


class TestPaymentFailedEventsCollector:
    def test_emits_count(self):
        with patch("app.metrics._read_payment_failed_events_24h", return_value=2.0):
            family, sample = _only_sample(PaymentFailedEventsCollector())

        assert family.name == "vuln_payment_failed_events_24h"
        assert family.type == "gauge"
        assert sample.value == 2.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_payment_failed_events_24h", return_value=None):
            assert list(PaymentFailedEventsCollector().collect()) == []


class TestPaymentAmountMismatchCollector:
    def test_emits_count(self):
        with patch("app.metrics._read_payment_amount_mismatches_24h", return_value=1.0):
            family, sample = _only_sample(PaymentAmountMismatchCollector())

        assert family.name == "vuln_payment_amount_mismatches_24h"
        assert family.type == "gauge"
        assert sample.value == 1.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_payment_amount_mismatches_24h", return_value=None):
            assert list(PaymentAmountMismatchCollector().collect()) == []


class TestPaymentDuplicateSettlementCollector:
    def test_emits_count(self):
        with patch("app.metrics._read_payment_duplicate_settlements_24h", return_value=1.0):
            family, sample = _only_sample(PaymentDuplicateSettlementCollector())

        assert family.name == "vuln_payment_duplicate_settlements_24h"
        assert family.type == "gauge"
        assert sample.value == 1.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_payment_duplicate_settlements_24h", return_value=None):
            assert list(PaymentDuplicateSettlementCollector().collect()) == []


class TestPaymentRefundsCollector:
    def test_emits_count(self):
        with patch("app.metrics._read_payment_refunds_24h", return_value=2.0):
            family, sample = _only_sample(PaymentRefundsCollector())

        assert family.name == "vuln_payment_refunds_24h"
        assert family.type == "gauge"
        assert sample.value == 2.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_payment_refunds_24h", return_value=None):
            assert list(PaymentRefundsCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_payment_refunds_24h", side_effect=RuntimeError("db down")):
            assert list(PaymentRefundsCollector().collect()) == []


class TestPaymentMetricRegistration:
    def test_all_payment_collectors_are_registered(self, reset_registration_flag):
        with patch.object(metrics_mod.REGISTRY, "register") as mock_reg:
            register_custom_metrics()

        classes = {type(call.args[0]).__name__ for call in mock_reg.call_args_list}
        assert {
            "PaymentPendingAttemptsCollector",
            "PaymentPendingAgeCollector",
            "PaymentFailedEventsCollector",
            "PaymentAmountMismatchCollector",
            "PaymentDuplicateSettlementCollector",
            "PaymentRefundsCollector",
        } <= classes

    def test_all_payment_metric_names_are_exported(self):
        assert {
            metrics_mod._PAYMENT_PENDING_ATTEMPTS_NAME,
            metrics_mod._PAYMENT_PENDING_AGE_NAME,
            metrics_mod._PAYMENT_FAILED_EVENTS_NAME,
            metrics_mod._PAYMENT_AMOUNT_MISMATCH_NAME,
            metrics_mod._PAYMENT_DUPLICATE_SETTLEMENT_NAME,
            metrics_mod._PAYMENT_REFUNDS_NAME,
        } == {
            "vuln_payment_pending_attempts",
            "vuln_payment_pending_age_seconds",
            "vuln_payment_failed_events_24h",
            "vuln_payment_amount_mismatches_24h",
            "vuln_payment_duplicate_settlements_24h",
            "vuln_payment_refunds_24h",
        }
