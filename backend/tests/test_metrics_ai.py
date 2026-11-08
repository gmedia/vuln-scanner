import inspect
import logging
import math
import sys
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

import app.metrics as metrics_mod
from app.config import settings
from app.metrics import (
    AiFxRateCollector,
    AiProvidersDegradedCollector,
    AiProvidersNeverProbedCollector,
    AiProvidersProbeAgeCollector,
    AiShortfallCollector,
    AiStaleReservationsCollector,
    AiUpstreamBreakersOpenCollector,
    AiWalletLedgerDriftCollector,
    _read_ai_fx_rate_age_days,
    _read_ai_providers_degraded,
    _read_ai_providers_never_probed,
    _read_ai_providers_probe_age_seconds,
    _read_ai_shortfall_idr_24h,
    _read_ai_stale_open_reservations,
    _read_ai_upstream_breakers_open,
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


class TestAiUpstreamBreakersReader:
    def test_counts_only_open_keys(self):
        redis_mod = MagicMock()
        client = redis_mod.Redis.from_url.return_value
        client.scan.return_value = (0, ["ai:cb:a:open", "ai:cb:b:open"])
        with patch.dict(sys.modules, {"redis": redis_mod}):
            assert _read_ai_upstream_breakers_open() == 2.0
        client.scan.assert_called_once_with(cursor=0, match="ai:cb:*:open", count=500)
        client.close.assert_called_once()

    def test_reader_returns_none_when_redis_raises(self):
        redis_mod = MagicMock()
        redis_mod.Redis.from_url.return_value.scan.side_effect = RuntimeError("redis down")
        with patch.dict(sys.modules, {"redis": redis_mod}):
            assert _read_ai_upstream_breakers_open() is None


class TestAiProvidersDegradedReader:
    def _reader_returning(self, scalar: object) -> tuple[float | None, MagicMock]:
        engine = MagicMock()
        engine.connect.return_value.__enter__.return_value.execute.return_value.scalar.return_value = scalar
        with patch("app.metrics._ai_engine", return_value=engine):
            return _read_ai_providers_degraded(), engine

    def test_reader_returns_sql_count(self):
        value, engine = self._reader_returning(4)
        assert value == 4.0
        executed = engine.connect.return_value.__enter__.return_value.execute.call_args.args[0]
        assert "status = 'degraded'" in str(executed)

    def test_reader_returns_none_when_engine_raises(self):
        with patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")):
            assert _read_ai_providers_degraded() is None


class TestAiProvidersProbeAgeReader:
    @pytest.fixture(autouse=True)
    def _probe_on(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "ai_gateway_enabled", True)
        monkeypatch.setattr(settings, "ai_provider_probe_enabled", True)

    def _reader_returning(self, row: tuple[object, int]) -> tuple[float | None, MagicMock]:
        engine = MagicMock()
        execute = engine.connect.return_value.__enter__.return_value.execute
        execute.return_value.one.return_value = row
        with patch("app.metrics._ai_engine", return_value=engine):
            return _read_ai_providers_probe_age_seconds(), execute

    def test_provider_probe_age_omitted_when_gateway_disabled(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "ai_gateway_enabled", False)
        engine = MagicMock()
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_ai_providers_probe_age_seconds() is None
        engine.connect.assert_not_called()

    def test_provider_probe_age_omitted_when_probe_disabled(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "ai_provider_probe_enabled", False)
        engine = MagicMock()
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_ai_providers_probe_age_seconds() is None
        engine.connect.assert_not_called()

    def test_provider_probe_age_returns_inf_when_never_probed(self):
        value, _ = self._reader_returning((None, 1))
        assert value is not None
        assert math.isinf(value)
        assert value > 0

    def test_provider_probe_age_reports_oldest_provider(self):
        oldest = datetime.now(UTC) - timedelta(seconds=600)
        value, _ = self._reader_returning((oldest, 2))
        assert value is not None
        assert 595 <= value <= 605

    def test_provider_probe_age_omitted_without_providers(self):
        value, _ = self._reader_returning((None, 0))
        assert value is None

    def test_provider_probe_age_accepts_naive_and_string_timestamps(self):
        oldest = (datetime.now(UTC) - timedelta(seconds=90)).replace(tzinfo=None)

        for timestamp in (oldest, oldest.isoformat()):
            value, _ = self._reader_returning((timestamp, 1))
            assert value is not None
            assert 85 <= value <= 95

    def test_provider_probe_age_ignores_disabled_providers(self):
        oldest = datetime.now(UTC) - timedelta(seconds=60)
        value, execute = self._reader_returning((oldest, 1))

        assert value is not None
        assert 55 <= value <= 65
        sql = str(execute.call_args.args[0])
        assert "enabled IS TRUE" in sql
        assert "status != 'disabled'" in sql

    def test_reader_returns_none_when_engine_raises(self):
        with patch("app.metrics._ai_engine", side_effect=RuntimeError("no db")):
            assert _read_ai_providers_probe_age_seconds() is None


class TestAiProvidersProbeAgeCollector:
    def test_emits_probe_age(self):
        with patch("app.metrics._read_ai_providers_probe_age_seconds", return_value=120.0):
            family, sample = _only_sample(AiProvidersProbeAgeCollector())

        assert family.name == "vuln_ai_providers_probe_age_seconds"
        assert family.type == "gauge"
        assert sample.value == 120.0

    def test_emits_positive_infinity_when_never_probed(self):
        with patch("app.metrics._read_ai_providers_probe_age_seconds", return_value=float("inf")):
            family, sample = _only_sample(AiProvidersProbeAgeCollector())

        assert family.name == "vuln_ai_providers_probe_age_seconds"
        assert math.isinf(sample.value)

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_providers_probe_age_seconds", return_value=None):
            assert list(AiProvidersProbeAgeCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_ai_providers_probe_age_seconds", side_effect=RuntimeError("db down")):
            assert list(AiProvidersProbeAgeCollector().collect()) == []


class TestAiUpstreamBreakersOpenCollector:
    def test_emits_open_count(self):
        with patch("app.metrics._read_ai_upstream_breakers_open", return_value=2.0):
            family, sample = _only_sample(AiUpstreamBreakersOpenCollector())

        assert family.name == "vuln_ai_upstream_breakers_open"
        assert sample.value == 2.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_upstream_breakers_open", return_value=None):
            assert list(AiUpstreamBreakersOpenCollector().collect()) == []


class TestAiProvidersDegradedCollector:
    def test_emits_degraded_count(self):
        with patch("app.metrics._read_ai_providers_degraded", return_value=4.0):
            family, sample = _only_sample(AiProvidersDegradedCollector())

        assert family.name == "vuln_ai_providers_degraded"
        assert sample.value == 4.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_providers_degraded", return_value=None):
            assert list(AiProvidersDegradedCollector().collect()) == []


class TestRegisterCustomMetrics:
    def test_registers_each_collector_once(self, reset_registration_flag):
        with patch.object(metrics_mod.REGISTRY, "register") as mock_reg:
            register_custom_metrics()
            register_custom_metrics()

        assert mock_reg.call_count == 25
        classes = [type(call.args[0]).__name__ for call in mock_reg.call_args_list]
        assert sorted(classes) == sorted(
            [
                "AutoFailCollector",
                "AiFxRateCollector",
                "AiProvidersDegradedCollector",
                "AiProvidersNeverProbedCollector",
                "AiProvidersProbeAgeCollector",
                "AiShortfallCollector",
                "AiStaleReservationsCollector",
                "AiTopupAwaitingVerificationCollector",
                "AiTopupOrdersTotalCollector",
                "AiTopupPendingAgeCollector",
                "AiTopupPendingOverdueCollector",
                "AiTopupRefundReviewCollector",
                "AiTopupWebhookFailedCollector",
                "AiUpstreamBreakersOpenCollector",
                "AiWalletLedgerDriftCollector",
                "PaymentAmountMismatchCollector",
                "PaymentDuplicateSettlementCollector",
                "PaymentFailedEventsCollector",
                "PaymentPendingAgeCollector",
                "PaymentPendingAttemptsCollector",
                "PaymentRefundsCollector",
                "PromoDiscount24hCollector",
                "PromoDiscount30dCollector",
                "PromoPendingApprovalsCollector",
                "PromoRedemptions24hCollector",
            ]
        )
        assert len(set(classes)) == 25


class TestAiProvidersNeverProbedReader:
    @pytest.fixture(autouse=True)
    def _probe_on(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(settings, "ai_gateway_enabled", True)
        monkeypatch.setattr(settings, "ai_provider_probe_enabled", True)

    def _reader_returning(self, count: int) -> float | None:
        engine = MagicMock()
        execute = engine.connect.return_value.__enter__.return_value.execute
        execute.return_value.scalar.return_value = count
        with patch("app.metrics._ai_engine", return_value=engine):
            return _read_ai_providers_never_probed()

    def test_reports_the_count(self):
        assert self._reader_returning(2) == 2.0
        assert self._reader_returning(0) == 0.0

    def test_null_count_is_zero(self):
        assert self._reader_returning(None) == 0.0

    def test_omitted_when_the_probe_is_off(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "ai_provider_probe_enabled", False)
        engine = MagicMock()
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_ai_providers_never_probed() is None
        engine.connect.assert_not_called()

    def test_omitted_when_the_gateway_is_off(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "ai_gateway_enabled", False)
        engine = MagicMock()
        with patch("app.metrics._ai_engine", return_value=engine):
            assert _read_ai_providers_never_probed() is None
        engine.connect.assert_not_called()

    def test_never_probed_metric_is_excluded_only_when_voluntarily_off(self):
        """A disabled provider is the admin's decision, not a probe failure."""
        source = inspect.getsource(metrics_mod._read_ai_providers_never_probed)
        assert "status != 'disabled'" in source
        assert "enabled IS TRUE" in source
        assert "last_probed_at IS NULL" in source


class TestAiProvidersNeverProbedCollector:
    def test_emits_the_count(self):
        with patch("app.metrics._read_ai_providers_never_probed", return_value=3.0):
            family, sample = _only_sample(AiProvidersNeverProbedCollector())

        assert family.name == "vuln_ai_providers_never_probed"
        assert family.type == "gauge"
        assert sample.value == 3.0

    def test_emits_zero_rather_than_nothing_when_every_provider_is_fine(self):
        with patch("app.metrics._read_ai_providers_never_probed", return_value=0.0):
            family, sample = _only_sample(AiProvidersNeverProbedCollector())

        assert sample.value == 0.0

    def test_emits_nothing_when_reader_returns_none(self):
        with patch("app.metrics._read_ai_providers_never_probed", return_value=None):
            assert list(AiProvidersNeverProbedCollector().collect()) == []

    def test_emits_nothing_when_reader_raises(self):
        with patch("app.metrics._read_ai_providers_never_probed", side_effect=RuntimeError("db down")):
            assert list(AiProvidersNeverProbedCollector().collect()) == []
