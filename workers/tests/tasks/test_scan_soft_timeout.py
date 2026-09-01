import sys
from unittest.mock import MagicMock, patch

from celery.exceptions import SoftTimeLimitExceeded, TimeLimitExceeded

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")
sys.path.insert(0, "/home/ubuntu/vuln-scanner/backend")

JOB_ID = "job-soft-timeout"


class TestMobileSoftTimeout:
    def test_soft_timeout_fails_job_without_retry(self):
        from tasks.mobile_scan import run_mobile_scan

        task_cls = type(run_mobile_scan._get_current_object())
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan._update_status", side_effect=SoftTimeLimitExceeded()),
            patch("tasks.mobile_scan.fail_job_no_retry") as mock_fail,
            patch("tasks.mobile_scan.publish_progress"),
            patch.object(task_cls, "retry") as mock_retry,
        ):
            mock_session.return_value = MagicMock()
            result = run_mobile_scan(JOB_ID, "/tmp/app.apk", "android")
        mock_fail.assert_called_once()
        assert mock_fail.call_args.args[0] == JOB_ID
        assert "timed out" in mock_fail.call_args.args[2]
        mock_retry.assert_not_called()
        assert result["error"] == "scan timed out (soft limit 600s)"

    def test_hard_timeout_fails_job_without_retry(self):
        from tasks.mobile_scan import run_mobile_scan

        task_cls = type(run_mobile_scan._get_current_object())
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan._update_status", side_effect=TimeLimitExceeded()),
            patch("tasks.mobile_scan.fail_job_no_retry") as mock_fail,
            patch("tasks.mobile_scan.publish_progress"),
            patch.object(task_cls, "retry") as mock_retry,
        ):
            mock_session.return_value = MagicMock()
            result = run_mobile_scan(JOB_ID, "/tmp/app.apk", "android")
        mock_fail.assert_called_once()
        assert mock_fail.call_args.args[0] == JOB_ID
        assert "hard limit" in mock_fail.call_args.args[2]
        mock_retry.assert_not_called()
        assert result["error"] == "scan timed out (hard limit)"


class TestIpSoftTimeout:
    def test_soft_timeout_fails_job_without_retry(self):
        from tasks.ip_scan import run_ip_scan

        task_cls = type(run_ip_scan._get_current_object())
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan._update_status", side_effect=SoftTimeLimitExceeded()),
            patch("tasks.ip_scan.fail_job_no_retry") as mock_fail,
            patch("tasks.ip_scan.publish_progress"),
            patch.object(task_cls, "retry") as mock_retry,
        ):
            mock_session.return_value = MagicMock()
            result = run_ip_scan(JOB_ID, "10.0.0.1")
        mock_fail.assert_called_once()
        mock_retry.assert_not_called()
        assert "timed out" in result["error"]


class TestDomainSoftTimeout:
    def test_soft_timeout_fails_job_without_retry(self):
        from tasks.domain_scan import run_domain_scan

        task_cls = type(run_domain_scan._get_current_object())
        with (
            patch("tasks.domain_scan.get_sync_session") as mock_session,
            patch("tasks.domain_scan._update_status", side_effect=SoftTimeLimitExceeded()),
            patch("tasks.domain_scan.fail_job_no_retry") as mock_fail,
            patch("tasks.domain_scan.publish_progress"),
            patch("tasks.domain_scan.resolve_dns"),
            patch.object(task_cls, "retry") as mock_retry,
        ):
            mock_session.return_value = MagicMock()
            result = run_domain_scan(JOB_ID, "example.com")
        mock_fail.assert_called_once()
        mock_retry.assert_not_called()
        assert "timed out" in result["error"]


class TestFailJobNoRetry:
    def test_writes_failed_status_and_refunds_once(self):
        from utils.scan_fail import fail_job_no_retry

        mock_session = MagicMock()
        job = MagicMock()
        job.user_id = "u1"
        job.credit_cost = 3
        job.id = JOB_ID
        user = MagicMock()
        user.credits = 0
        user.id = "u1"
        mock_session.query.return_value.where.return_value.one_or_none.side_effect = [job, user]
        mock_session.query.return_value.where.return_value.first.return_value = None
        with patch("utils.scan_fail.get_sync_session", return_value=mock_session):
            fail_job_no_retry(JOB_ID, "apk", "scan timed out (soft limit 600s)")
        mock_session.execute.assert_called()
        mock_session.commit.assert_called()
        assert user.credits == 3
        mock_session.add.assert_called()
