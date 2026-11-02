import logging
import math
from unittest.mock import MagicMock, patch

import pytest

import app.metrics as metrics_mod
from app.metrics import (
    AiFxRateCollector,
    AiShortfallCollector,
    AiStaleReservationsCollector,
    AiWalletLedgerDriftCollector,
    _read_ai_fx_rate_age_days,
    _read_ai_shortfall_idr_24h,
    _read_ai_stale_open_reservations,
    _read_ai_wallet_ledger_drift_idr,
    register_custom_metrics,
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


class TestAiFxRateCollector:
    def test_emits_age_when_reader_returns_days(self):
        with patch("app.metrics._read_ai_fx_rate_age_days", return_value=3.0):
            family, sample = _only_sample(AiFxRateCollector())

        assert family.name == "vuln_ai_fx_rate_age_days"
        assert sample.value == 3.0

    def test_emits_positive_infinity_when_no_rate_stored(self):
        with patch("app.metrics._read_ai_fx_rate_age_days", return_value=float("inf")):
            family, sample = _only_sample(AiFxRateCollector())

        assert family.name == "vuln_ai_fx_rate_age_days"
        assert math.isinf(sample.value)
        assert sample.value > 0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_fx_rate_age_days", return_value=None):
            assert list(AiFxRateCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_ai_fx_rate_age_days", side_effect=RuntimeError("db down")):
            assert list(AiFxRateCollector().collect()) == []

    def test_reader_returns_none_when_engine_raises(self):
        with patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")):
            assert _read_ai_fx_rate_age_days() is None


class TestAiShortfallCollector:
    def test_emits_sum_when_reader_returns_idr(self):
        with patch("app.metrics._read_ai_shortfall_idr_24h", return_value=12_500.0):
            family, sample = _only_sample(AiShortfallCollector())

        assert family.name == "vuln_ai_usage_shortfall_idr_24h"
        assert sample.value == 12_500.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_shortfall_idr_24h", return_value=None):
            assert list(AiShortfallCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_ai_shortfall_idr_24h", side_effect=RuntimeError("db down")):
            assert list(AiShortfallCollector().collect()) == []

    def test_reader_returns_none_when_engine_raises(self):
        with patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")):
            assert _read_ai_shortfall_idr_24h() is None


class TestAiWalletLedgerDrift:
    def _reader_returning(self, scalar: object) -> float | None:
        engine = MagicMock()
        engine.connect.return_value.__enter__.return_value.execute.return_value.scalar.return_value = scalar
        with patch("app.metrics._ai_engine", return_value=engine):
            return _read_ai_wallet_ledger_drift_idr()

    def test_reader_returns_largest_gap(self):
        assert self._reader_returning(250) == 250.0

    def test_reader_returns_zero_when_no_drift(self):
        assert self._reader_returning(0) == 0.0

    def test_reader_returns_none_when_engine_raises(self):
        with patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")):
            assert _read_ai_wallet_ledger_drift_idr() is None


class TestAiWalletLedgerDriftCollector:
    def test_emits_drift_when_reader_returns_idr(self):
        with patch("app.metrics._read_ai_wallet_ledger_drift_idr", return_value=250.0):
            family, sample = _only_sample(AiWalletLedgerDriftCollector())

        assert family.name == "vuln_ai_wallet_ledger_drift_idr"
        assert sample.value == 250.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_wallet_ledger_drift_idr", return_value=None):
            assert list(AiWalletLedgerDriftCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_ai_wallet_ledger_drift_idr", side_effect=RuntimeError("db down")):
            assert list(AiWalletLedgerDriftCollector().collect()) == []


class TestAiStaleReservationsReader:
    def _reader_returning(self, scalar: object) -> float | None:
        engine = MagicMock()
        engine.connect.return_value.__enter__.return_value.execute.return_value.scalar.return_value = scalar
        with patch("app.metrics._ai_engine", return_value=engine):
            return _read_ai_stale_open_reservations()

    def test_reader_returns_count(self):
        assert self._reader_returning(3) == 3.0

    @pytest.mark.parametrize("scalar", [0, None])
    def test_reader_returns_zero_when_no_stale_rows(self, scalar):
        assert self._reader_returning(scalar) == 0.0

    def test_reader_returns_none_when_engine_raises(self, caplog):
        with (
            caplog.at_level(logging.DEBUG, logger="app.metrics"),
            patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")),
        ):
            assert _read_ai_stale_open_reservations() is None
        assert any("stale reservations" in record.message for record in caplog.records)


class TestAiStaleReservationsCollector:
    def test_emits_count_when_reader_returns_stale_rows(self):
        with patch("app.metrics._read_ai_stale_open_reservations", return_value=3.0):
            family, sample = _only_sample(AiStaleReservationsCollector())

        assert family.name == "vuln_ai_stale_open_reservations"
        assert family.type == "gauge"
        assert sample.value == 3.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_stale_open_reservations", return_value=None):
            assert list(AiStaleReservationsCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_ai_stale_open_reservations", side_effect=RuntimeError("db down")):
            assert list(AiStaleReservationsCollector().collect()) == []


class TestRegisterCustomMetrics:
    def test_registers_each_collector_once(self, reset_registration_flag):
        with patch.object(metrics_mod.REGISTRY, "register") as mock_reg:
            register_custom_metrics()
            register_custom_metrics()

        assert mock_reg.call_count == 5
        classes = [type(call.args[0]).__name__ for call in mock_reg.call_args_list]
        assert sorted(classes) == sorted(
            [
                "AutoFailCollector",
                "AiFxRateCollector",
                "AiShortfallCollector",
                "AiStaleReservationsCollector",
                "AiWalletLedgerDriftCollector",
            ]
        )
        assert len(set(classes)) == 5
