from unittest.mock import MagicMock, patch

from app.metrics import AutoFailCollector, _read_auto_fail_counts, register_custom_metrics


class TestReadAutoFailCounts:
    def test_reads_pending_and_running(self):
        mock_r = MagicMock()
        mock_r.get.side_effect = lambda k: {
            "metrics:maintenance:auto_failed:pending": "7",
            "metrics:maintenance:auto_failed:running": "2",
        }.get(k)

        with patch("redis.Redis.from_url", return_value=mock_r):
            counts = _read_auto_fail_counts()

        assert counts == {"pending": 7, "running": 2}
        mock_r.close.assert_called_once()

    def test_defaults_zero_on_missing_keys(self):
        mock_r = MagicMock()
        mock_r.get.return_value = None

        with patch("redis.Redis.from_url", return_value=mock_r):
            counts = _read_auto_fail_counts()

        assert counts == {"pending": 0, "running": 0}

    def test_defaults_zero_on_redis_error(self):
        with patch("redis.Redis.from_url", side_effect=ConnectionError("down")):
            counts = _read_auto_fail_counts()

        assert counts == {"pending": 0, "running": 0}


class TestAutoFailCollector:
    def test_collect_emits_gauge_samples(self):
        with patch(
            "app.metrics._read_auto_fail_counts",
            return_value={"pending": 3, "running": 5},
        ):
            metrics = list(AutoFailCollector().collect())

        assert len(metrics) == 1
        family = metrics[0]
        assert family.name == "vuln_maintenance_auto_failed_jobs"
        by_status = {s.labels["status"]: s.value for s in family.samples if s.name == family.name}
        assert by_status["pending"] == 3.0
        assert by_status["running"] == 5.0


class TestRegisterCustomMetrics:
    def test_register_is_idempotent(self):
        import app.metrics as metrics_mod

        metrics_mod._collector_registered = False
        with patch.object(metrics_mod.REGISTRY, "register") as mock_reg:
            register_custom_metrics()
            register_custom_metrics()
            mock_reg.assert_called_once()
        metrics_mod._collector_registered = True
