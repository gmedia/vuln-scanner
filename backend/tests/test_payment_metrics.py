import logging
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

import app.metrics as metrics_mod
from app.metrics import (
    AiTopupAwaitingVerificationCollector,
    AiTopupOrdersTotalCollector,
    AiTopupPendingAgeCollector,
    AiTopupPendingOverdueCollector,
    AiTopupRefundReviewCollector,
    AiTopupWebhookFailedCollector,
    PaymentAmountMismatchCollector,
    PaymentDuplicateSettlementCollector,
    PaymentFailedEventsCollector,
    PaymentPendingAgeCollector,
    PaymentPendingAttemptsCollector,
    PaymentRefundsCollector,
    _read_ai_topup_awaiting_verification_total,
    _read_ai_topup_orders_total,
    _read_ai_topup_pending_age_seconds,
    _read_ai_topup_pending_overdue_total,
    _read_ai_topup_refund_review_total,
    _read_ai_topup_webhook_failed_total,
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
        assert "payable_kind = 'invoice'" in sql


class TestPaymentDuplicateSettlementReader:
    def test_reader_counts_duplicate_settlements_in_window(self):
        engine = _engine_with_scalar(1)
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_duplicate_settlements_24h() == 1.0

        executed = engine.connect.return_value.__enter__.return_value.execute.call_args
        sql = str(executed.args[0])
        assert "provider_status = 'duplicate'" in sql
        assert "updated_at >= :cutoff" in sql
        assert "payable_kind = 'invoice'" in sql


class TestPaymentRefundsReader:
    def test_reader_counts_refunds_in_window(self):
        engine = _engine_with_scalar(3)
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_refunds_24h() == 3.0

        executed = engine.connect.return_value.__enter__.return_value.execute.call_args
        sql = str(executed.args[0])
        assert "status = 'refunded'" in sql
        assert "updated_at >= :cutoff" in sql
        assert "payable_kind = 'invoice'" in sql
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
                    "(id VARCHAR PRIMARY KEY, status VARCHAR NOT NULL, "
                    "updated_at DATETIME NOT NULL, payable_kind VARCHAR NOT NULL)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO payment_attempts (id, status, updated_at, payable_kind) "
                    "VALUES (:id, :status, :updated_at, :payable_kind)"
                ),
                [
                    {"id": "pending", "status": "pending", "updated_at": now, "payable_kind": "invoice"},
                    {"id": "refunded", "status": "refunded", "updated_at": now, "payable_kind": "invoice"},
                    {"id": "topup", "status": "refunded", "updated_at": now, "payable_kind": "topup"},
                ],
            )
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_refunds_24h() == 1.0
        engine.dispose()

    @pytest.mark.filterwarnings("ignore:The default datetime adapter is deprecated")
    def test_topup_attempts_are_excluded_from_every_attempt_reader(self, tmp_path):
        from sqlalchemy import create_engine, text

        engine = create_engine(f"sqlite:///{tmp_path / 'isolation.db'}")
        now = datetime.now(UTC)
        hour_ago = now - timedelta(hours=1)
        two_hours_ago = now - timedelta(hours=2)
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE payment_attempts ("
                    "id VARCHAR PRIMARY KEY, status VARCHAR NOT NULL, "
                    "updated_at DATETIME NOT NULL, created_at DATETIME NOT NULL, "
                    "failure_code VARCHAR, failed_at DATETIME, "
                    "provider_status VARCHAR, payable_kind VARCHAR NOT NULL)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO payment_attempts "
                    "(id, status, updated_at, created_at, failure_code, failed_at, "
                    "provider_status, payable_kind) VALUES "
                    "(:id, :status, :updated_at, :created_at, :failure_code, :failed_at, "
                    ":provider_status, :payable_kind)"
                ),
                [
                    {
                        "id": "invoice-pending",
                        "status": "pending",
                        "updated_at": now,
                        "created_at": hour_ago,
                        "failure_code": None,
                        "failed_at": None,
                        "provider_status": None,
                        "payable_kind": "invoice",
                    },
                    {
                        "id": "topup-pending",
                        "status": "pending",
                        "updated_at": now,
                        "created_at": two_hours_ago,
                        "failure_code": None,
                        "failed_at": None,
                        "provider_status": None,
                        "payable_kind": "topup",
                    },
                    {
                        "id": "invoice-mismatch",
                        "status": "failed",
                        "updated_at": now,
                        "created_at": two_hours_ago,
                        "failure_code": "amount_mismatch",
                        "failed_at": now,
                        "provider_status": None,
                        "payable_kind": "invoice",
                    },
                    {
                        "id": "topup-mismatch",
                        "status": "failed",
                        "updated_at": now,
                        "created_at": two_hours_ago,
                        "failure_code": "amount_mismatch",
                        "failed_at": now,
                        "provider_status": None,
                        "payable_kind": "topup",
                    },
                    {
                        "id": "invoice-dup",
                        "status": "succeeded",
                        "updated_at": now,
                        "created_at": two_hours_ago,
                        "failure_code": None,
                        "failed_at": None,
                        "provider_status": "duplicate",
                        "payable_kind": "invoice",
                    },
                    {
                        "id": "topup-dup",
                        "status": "succeeded",
                        "updated_at": now,
                        "created_at": two_hours_ago,
                        "failure_code": None,
                        "failed_at": None,
                        "provider_status": "duplicate",
                        "payable_kind": "topup",
                    },
                    {
                        "id": "invoice-refund",
                        "status": "refunded",
                        "updated_at": now,
                        "created_at": two_hours_ago,
                        "failure_code": None,
                        "failed_at": None,
                        "provider_status": "refunded",
                        "payable_kind": "invoice",
                    },
                    {
                        "id": "topup-refund",
                        "status": "refunded",
                        "updated_at": now,
                        "created_at": two_hours_ago,
                        "failure_code": None,
                        "failed_at": None,
                        "provider_status": "refunded",
                        "payable_kind": "topup",
                    },
                ],
            )
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_payment_pending_attempts() == 1.0
            age = _read_payment_pending_age_seconds()
            assert age is not None and 3595 <= age <= 3605
            assert _read_payment_amount_mismatches_24h() == 1.0
            assert _read_payment_duplicate_settlements_24h() == 1.0
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


# --- AI top-up metrics (S6) -------------------------------------------------

AI_TOPUP_METRIC_READERS = (
    _read_ai_topup_orders_total,
    _read_ai_topup_pending_age_seconds,
    _read_ai_topup_pending_overdue_total,
    _read_ai_topup_awaiting_verification_total,
    _read_ai_topup_refund_review_total,
    _read_ai_topup_webhook_failed_total,
)


def _orders_engine(tmp_path):
    from sqlalchemy import create_engine, text

    engine = create_engine(f"sqlite:///{tmp_path / 'ai-topup-orders.db'}")
    now = datetime.now(UTC)
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE ai_topup_orders ("
                "id VARCHAR PRIMARY KEY, status VARCHAR NOT NULL, "
                "payment_method VARCHAR NOT NULL, created_at DATETIME NOT NULL, "
                "expires_at DATETIME NOT NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO ai_topup_orders "
                "(id, status, payment_method, created_at, expires_at) VALUES "
                "(:id, :status, :payment_method, :created_at, :expires_at)"
            ),
            [
                {
                    "id": "pending-manual",
                    "status": "pending_payment",
                    "payment_method": "manual_transfer",
                    "created_at": now - timedelta(minutes=10),
                    "expires_at": now + timedelta(hours=1),
                },
                {
                    "id": "overdue-manual",
                    "status": "pending_payment",
                    "payment_method": "manual_transfer",
                    "created_at": now - timedelta(hours=2),
                    "expires_at": now - timedelta(minutes=5),
                },
                {
                    "id": "pending-midtrans",
                    "status": "pending_payment",
                    "payment_method": "midtrans",
                    "created_at": now - timedelta(minutes=1),
                    "expires_at": now + timedelta(hours=1),
                },
                {
                    "id": "awaiting",
                    "status": "awaiting_verification",
                    "payment_method": "manual_transfer",
                    "created_at": now,
                    "expires_at": now + timedelta(days=3),
                },
                {
                    "id": "review",
                    "status": "refund_review",
                    "payment_method": "midtrans",
                    "created_at": now,
                    "expires_at": now + timedelta(days=3),
                },
                {
                    "id": "paid",
                    "status": "paid",
                    "payment_method": "manual_transfer",
                    "created_at": now,
                    "expires_at": now + timedelta(days=3),
                },
            ],
        )
    return engine


@pytest.mark.filterwarnings("ignore:The default datetime adapter is deprecated")
def test_topup_orders_reader_groups_by_status_and_method(tmp_path):
    engine = _orders_engine(tmp_path)
    with patch("app.metrics._ai_engine", return_value=engine):
        rows = _read_ai_topup_orders_total()
    engine.dispose()

    assert rows is not None
    assert sorted(rows) == [
        ("awaiting_verification", "manual_transfer", 1.0),
        ("paid", "manual_transfer", 1.0),
        ("pending_payment", "manual_transfer", 2.0),
        ("pending_payment", "midtrans", 1.0),
        ("refund_review", "midtrans", 1.0),
    ]


@pytest.mark.filterwarnings("ignore:The default datetime adapter is deprecated")
def test_topup_pending_age_reader_reports_oldest_per_method(tmp_path):
    engine = _orders_engine(tmp_path)
    with patch("app.metrics._ai_engine", return_value=engine):
        ages = _read_ai_topup_pending_age_seconds()
    engine.dispose()

    assert ages is not None
    assert set(ages) == {"manual_transfer", "midtrans"}
    assert 7100 <= ages["manual_transfer"] <= 7300
    assert 50 <= ages["midtrans"] <= 70


@pytest.mark.filterwarnings("ignore:The default datetime adapter is deprecated")
def test_topup_queue_readers_count_expected_statuses(tmp_path):
    engine = _orders_engine(tmp_path)
    with patch("app.metrics._ai_engine", return_value=engine):
        assert _read_ai_topup_pending_overdue_total() == 1.0
        assert _read_ai_topup_awaiting_verification_total() == 1.0
        assert _read_ai_topup_refund_review_total() == 1.0
    engine.dispose()


@pytest.mark.filterwarnings("ignore:The default datetime adapter is deprecated")
def test_topup_webhook_failed_reader_scopes_to_topup_attempts(tmp_path):
    from sqlalchemy import create_engine, text

    engine = create_engine(f"sqlite:///{tmp_path / 'topup-events.db'}")
    now = datetime.now(UTC)
    old = now - timedelta(hours=25)
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE payment_events ("
                "id VARCHAR PRIMARY KEY, status VARCHAR NOT NULL, "
                "received_at DATETIME NOT NULL, payload TEXT NOT NULL)"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE payment_attempts ("
                "id VARCHAR PRIMARY KEY, provider_order_id VARCHAR, payable_kind VARCHAR NOT NULL)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO payment_attempts (id, provider_order_id, payable_kind) VALUES "
                "('topup-attempt', 'REF-A1', 'topup'), "
                "('invoice-attempt', 'INV-1', 'invoice')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO payment_events (id, status, received_at, payload) VALUES "
                "(:id, :status, :received_at, :payload)"
            ),
            [
                {
                    "id": "failed-topup",
                    "status": "failed",
                    "received_at": now,
                    "payload": '{"order_id": "REF-A1"}',
                },
                {
                    "id": "failed-invoice",
                    "status": "failed",
                    "received_at": now,
                    "payload": '{"order_id": "INV-1"}',
                },
                {
                    "id": "processed-topup",
                    "status": "processed",
                    "received_at": now,
                    "payload": '{"order_id": "REF-A1"}',
                },
                {
                    "id": "old-failed-topup",
                    "status": "failed",
                    "received_at": old,
                    "payload": '{"order_id": "REF-A1"}',
                },
            ],
        )
    with patch("app.metrics._ai_engine", return_value=engine):
        assert _read_ai_topup_webhook_failed_total() == 1.0
    engine.dispose()


@pytest.mark.parametrize("reader", AI_TOPUP_METRIC_READERS)
def test_topup_reader_returns_none_when_engine_raises(reader, caplog):
    with (
        caplog.at_level(logging.DEBUG, logger="app.metrics"),
        patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")),
    ):
        assert reader() is None
    assert any("top-up" in record.message for record in caplog.records)


class TestAiTopupOrdersTotalCollector:
    def test_emits_one_sample_per_status_and_method(self):
        rows = [("paid", "manual_transfer", 2.0), ("pending_payment", "midtrans", 1.0)]
        with patch("app.metrics._read_ai_topup_orders_total", return_value=rows):
            families = list(AiTopupOrdersTotalCollector().collect())

        assert len(families) == 1
        family = families[0]
        assert family.name == "vuln_ai_topup_orders_total"
        assert family.type == "gauge"
        assert {(s.labels["status"], s.labels["method"], s.value) for s in family.samples} == {
            ("paid", "manual_transfer", 2.0),
            ("pending_payment", "midtrans", 1.0),
        }

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_topup_orders_total", return_value=None):
            assert list(AiTopupOrdersTotalCollector().collect()) == []


class TestAiTopupPendingAgeCollector:
    def test_emits_one_sample_per_method(self):
        ages = {"manual_transfer": 600.0, "midtrans": 5.0}
        with patch("app.metrics._read_ai_topup_pending_age_seconds", return_value=ages):
            families = list(AiTopupPendingAgeCollector().collect())

        assert len(families) == 1
        family = families[0]
        assert family.name == "vuln_ai_topup_pending_age_seconds"
        assert family.type == "gauge"
        assert {(s.labels["method"], s.value) for s in family.samples} == {
            ("manual_transfer", 600.0),
            ("midtrans", 5.0),
        }

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_topup_pending_age_seconds", return_value=None):
            assert list(AiTopupPendingAgeCollector().collect()) == []


class TestAiTopupSingleValueCollectors:
    @pytest.mark.parametrize(
        ("collector_cls", "reader_name", "metric_name", "value"),
        [
            (
                AiTopupPendingOverdueCollector,
                "_read_ai_topup_pending_overdue_total",
                "vuln_ai_topup_pending_overdue_total",
                3.0,
            ),
            (
                AiTopupAwaitingVerificationCollector,
                "_read_ai_topup_awaiting_verification_total",
                "vuln_ai_topup_awaiting_verification_total",
                2.0,
            ),
            (
                AiTopupRefundReviewCollector,
                "_read_ai_topup_refund_review_total",
                "vuln_ai_topup_refund_review_total",
                1.0,
            ),
            (
                AiTopupWebhookFailedCollector,
                "_read_ai_topup_webhook_failed_total",
                "vuln_ai_topup_webhook_failed_total",
                4.0,
            ),
        ],
    )
    def test_emits_value(self, collector_cls, reader_name, metric_name, value):
        with patch(f"app.metrics.{reader_name}", return_value=value):
            family, sample = _only_sample(collector_cls())

        assert family.name == metric_name
        assert family.type == "gauge"
        assert sample.value == value

    @pytest.mark.parametrize(
        ("collector_cls", "reader_name"),
        [
            (AiTopupPendingOverdueCollector, "_read_ai_topup_pending_overdue_total"),
            (AiTopupAwaitingVerificationCollector, "_read_ai_topup_awaiting_verification_total"),
            (AiTopupRefundReviewCollector, "_read_ai_topup_refund_review_total"),
            (AiTopupWebhookFailedCollector, "_read_ai_topup_webhook_failed_total"),
        ],
    )
    def test_emits_nothing_when_reader_returns_none(self, collector_cls, reader_name):
        with patch(f"app.metrics.{reader_name}", return_value=None):
            assert list(collector_cls().collect()) == []


class TestAiTopupMetricRegistration:
    def test_all_topup_collectors_are_registered(self, reset_registration_flag):
        with patch.object(metrics_mod.REGISTRY, "register") as mock_reg:
            register_custom_metrics()

        classes = {type(call.args[0]).__name__ for call in mock_reg.call_args_list}
        assert {
            "AiTopupOrdersTotalCollector",
            "AiTopupPendingAgeCollector",
            "AiTopupPendingOverdueCollector",
            "AiTopupAwaitingVerificationCollector",
            "AiTopupRefundReviewCollector",
            "AiTopupWebhookFailedCollector",
        } <= classes

    def test_all_topup_metric_names_are_exported(self):
        assert {
            metrics_mod._AI_TOPUP_ORDERS_TOTAL_NAME,
            metrics_mod._AI_TOPUP_PENDING_AGE_NAME,
            metrics_mod._AI_TOPUP_PENDING_OVERDUE_NAME,
            metrics_mod._AI_TOPUP_AWAITING_VERIFICATION_NAME,
            metrics_mod._AI_TOPUP_REFUND_REVIEW_NAME,
            metrics_mod._AI_TOPUP_WEBHOOK_FAILED_NAME,
        } == {
            "vuln_ai_topup_orders_total",
            "vuln_ai_topup_pending_age_seconds",
            "vuln_ai_topup_pending_overdue_total",
            "vuln_ai_topup_awaiting_verification_total",
            "vuln_ai_topup_refund_review_total",
            "vuln_ai_topup_webhook_failed_total",
        }
