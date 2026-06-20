"""Tests for workers.tasks.ip_scan — Celery task orchestration."""

import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

from unittest.mock import ANY, AsyncMock, MagicMock, PropertyMock, patch

import pytest
from celery.exceptions import Retry

JOB_ID = "test-job-uuid-1234"
TARGET = "192.168.1.1"
PORTS = "1-1000"


class TestIpScanSuccessfulFlow:
    @pytest.fixture(autouse=True)
    def _setup_patches(self, sample_nmap_result, sample_vulns):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan._save_findings") as mock_save_findings,
            patch("tasks.ip_scan.redis.Redis.from_url") as mock_redis,
        ):
            mock_nmap.return_value = sample_nmap_result
            mock_cve.return_value = sample_vulns
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_nmap = mock_nmap
            self.mock_cve = mock_cve
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_save_findings = mock_save_findings
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.ip_scan import run_ip_scan
        return run_ip_scan(JOB_ID, TARGET, PORTS)

    def test_successful_scan_completes(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result
        assert result["summary"]["total_findings"] > 0

    def test_successful_scan_updates_status_running(self):
        self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value, JOB_ID, "running", started_at=ANY,
        )

    def test_successful_scan_updates_status_completed(self):
        self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value, JOB_ID, "completed",
            progress=100, result_summary=ANY, completed_at=ANY,
        )

    def test_successful_scan_calls_nmap(self):
        self._call_task()
        self.mock_nmap.assert_called_once_with(TARGET, PORTS)

    def test_successful_scan_calls_cve_lookup(self):
        self._call_task()
        assert self.mock_cve.call_count >= 2

    def test_successful_scan_saves_findings(self):
        self._call_task()
        self.mock_save_findings.assert_called_once()
        args, _ = self.mock_save_findings.call_args
        assert args[1] == JOB_ID
        assert len(args[2]) > 0

    def test_progress_milestones(self):
        self._call_task()
        progress_messages = [
            c for c in self.mock_progress.call_args_list if c[0][0] == JOB_ID
        ]
        percentages = [call[0][2] for call in progress_messages]
        assert 5 in percentages
        assert 30 in percentages
        assert 100 in percentages
        for pct in percentages:
            assert 0 <= pct <= 100

    def test_health_last_task_completed_set(self):
        self._call_task()
        self.mock_redis.return_value.set.assert_called_once()
        call_args = self.mock_redis.return_value.set.call_args[0]
        assert "health:last_task_completed" in call_args

    def test_session_committed_and_closed(self):
        self._call_task()
        mock_session_instance = self.mock_session.return_value
        mock_session_instance.commit.assert_called()
        mock_session_instance.close.assert_called()

    def test_result_dict_shape(self):
        result = self._call_task()
        assert isinstance(result, dict)
        assert "job_id" in result
        assert "summary" in result
        assert "total_findings" in result["summary"]
        assert "critical" in result["summary"]
        assert "high" in result["summary"]
        assert "medium" in result["summary"]


class TestPublishProgress:
    def test_publish_progress_handles_redis_error_gracefully(self):
        from tasks.ip_scan import publish_progress
        with patch("tasks.ip_scan.redis.Redis.from_url") as mock_redis:
            mock_instance = MagicMock()
            mock_instance.publish.side_effect = Exception("Redis error")
            mock_redis.return_value = mock_instance
            publish_progress("test-job", "nmap_scan", 50, "test message")
        mock_instance.publish.assert_called_once()


class TestIpScanNmapFailure:
    _RETRIES = 0

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan.redis.Redis.from_url") as mock_redis,
        ):
            mock_nmap.side_effect = Exception("nmap binary not found")
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_nmap = mock_nmap
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.ip_scan import run_ip_scan
        task_cls = type(run_ip_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.ip_scan.dead_letter_handler") as mock_dead_letter,
        ):
            mock_req.return_value = MagicMock(retries=self._RETRIES)
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_ip_scan(JOB_ID, TARGET, PORTS)

    def test_nmap_failure_calls_retry(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once()

    def test_nmap_failure_sets_status_failed(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value, JOB_ID, "failed",
        )

    def test_nmap_failure_publishes_failure_progress(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_progress.assert_any_call(JOB_ID, "failed", 100, ANY)

    def test_nmap_failure_countdown_exponential(self):
        self._RETRIES = 0
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once_with(exc=ANY, countdown=60)

    def test_nmap_failure_not_dead_letter(self):
        self._RETRIES = 0
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_not_called()

    def test_nmap_failure_session_committed_and_closed(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_session.return_value.commit.assert_called()
        self.mock_session.return_value.close.assert_called()


class TestIpScanNmapMidRetry(TestIpScanNmapFailure):
    _RETRIES = 1

    def test_nmap_failure_mid_retry_countdown(self):
        self._RETRIES = 1
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once_with(exc=ANY, countdown=120)


class TestIpScanNmapFinalRetry(TestIpScanNmapFailure):
    _RETRIES = 3

    def test_nmap_failure_final_retry_calls_dead_letter(self):
        self._RETRIES = 3
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_called_once()
        args, kwargs = self.mock_dead_letter.delay.call_args
        assert kwargs["task_name"] == "ip_scan.run"
        assert kwargs["args"] == [JOB_ID, TARGET, PORTS]


class TestIpScanEmptyResults:
    @pytest.fixture(autouse=True)
    def _setup_patches(self, sample_nmap_result_no_hosts):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan._save_findings") as mock_save_findings,
            patch("tasks.ip_scan.redis.Redis.from_url") as mock_redis,
        ):
            mock_nmap.return_value = sample_nmap_result_no_hosts
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_nmap = mock_nmap
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_save_findings = mock_save_findings
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.ip_scan import run_ip_scan
        return run_ip_scan(JOB_ID, TARGET, PORTS)

    def test_empty_results_completes_gracefully(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert result["summary"]["total_findings"] == 0

    def test_empty_results_saves_zero_findings(self):
        self._call_task()
        self.mock_save_findings.assert_called_once()
        args, _ = self.mock_save_findings.call_args
        assert len(args[2]) == 0

    def test_empty_results_no_cve_lookup(self):
        with patch("tasks.ip_scan.lookup_service_cves") as mock_cve:
            self._call_task()
        mock_cve.assert_not_called()
