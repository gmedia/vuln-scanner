import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from tasks.maintenance import (
    STALE_FAIL_SUMMARY,
    STALE_PENDING_FAIL_SUMMARY,
    STALE_PENDING_THRESHOLD_MINUTES,
    STALE_RUNNING_FAIL_SUMMARY,
    STALE_RUNNING_THRESHOLD_MINUTES,
    STALE_THRESHOLD_MINUTES,
    fail_stale_pending_jobs,
    fail_stale_running_jobs,
)


class TestFailStalePendingTaskMeta:
    def test_is_shared_task(self):
        assert hasattr(fail_stale_pending_jobs, "name")
        assert hasattr(fail_stale_pending_jobs, "max_retries")

    def test_has_correct_name(self):
        assert fail_stale_pending_jobs.name == "maintenance.fail_stale_pending"

    def test_has_acks_late_true(self):
        assert fail_stale_pending_jobs.acks_late is True

    def test_has_max_retries_1(self):
        assert fail_stale_pending_jobs.max_retries == 1

    def test_stale_threshold_is_30_minutes(self):
        assert STALE_THRESHOLD_MINUTES == 30
        assert STALE_PENDING_THRESHOLD_MINUTES == 30


class TestFailStalePendingSuccess:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.maintenance.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            mock_result = MagicMock()
            mock_result.one.return_value = SimpleNamespace(auto_failed_count=2, refunded_count=2)
            mock_session.execute.return_value = mock_result
            mock_get_session.return_value = mock_session
            self.mock_get_session = mock_get_session
            self.mock_session = mock_session
            self.mock_result = mock_result
            yield

    def _call_task(self):
        return fail_stale_pending_jobs()

    def test_returns_counts(self):
        result = self._call_task()
        assert result == {"auto_failed_count": 2, "refunded_count": 2}

    def test_commits_on_success(self):
        self._call_task()
        self.mock_session.commit.assert_called_once()
        self.mock_session.rollback.assert_not_called()

    def test_closes_session(self):
        self._call_task()
        self.mock_session.close.assert_called_once()

    def test_execute_called_with_cutoff_and_summary(self):
        before = datetime.now(UTC)
        self._call_task()
        after = datetime.now(UTC)

        assert self.mock_session.execute.call_count == 1
        params = self.mock_session.execute.call_args[0][1]
        assert params["summary"] == STALE_FAIL_SUMMARY == STALE_PENDING_FAIL_SUMMARY
        assert params["status"] == "pending"
        assert isinstance(params["cutoff"], datetime)

        expected_min = before - timedelta(minutes=STALE_PENDING_THRESHOLD_MINUTES)
        expected_max = after - timedelta(minutes=STALE_PENDING_THRESHOLD_MINUTES)
        assert expected_min <= params["cutoff"] <= expected_max

    def test_sql_marks_failed_and_refunds(self):
        self._call_task()
        stmt = self.mock_session.execute.call_args[0][0]
        sql = str(stmt)
        assert "UPDATE scan_jobs" in sql
        assert "status = 'failed'" in sql
        assert "UPDATE users" in sql
        assert "credit_logs" in sql
        assert "refund" in sql
        assert "created_at < :cutoff" in sql
        assert "stuck pending" in sql

    def test_logs_warning_when_jobs_failed(self):
        with patch("tasks.maintenance.logger") as mock_logger:
            self._call_task()
            mock_logger.warning.assert_called_once()
            assert "2" in str(mock_logger.warning.call_args) or mock_logger.warning.call_args.kwargs.get("count") == 2


class TestFailStalePendingNoJobs:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.maintenance.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            mock_result = MagicMock()
            mock_result.one.return_value = SimpleNamespace(auto_failed_count=0, refunded_count=0)
            mock_session.execute.return_value = mock_result
            mock_get_session.return_value = mock_session
            self.mock_session = mock_session
            yield

    def test_returns_zero_counts(self):
        result = fail_stale_pending_jobs()
        assert result == {"auto_failed_count": 0, "refunded_count": 0}

    def test_does_not_log_warning_when_empty(self):
        with patch("tasks.maintenance.logger") as mock_logger:
            fail_stale_pending_jobs()
            mock_logger.warning.assert_not_called()

    def test_still_commits(self):
        fail_stale_pending_jobs()
        self.mock_session.commit.assert_called_once()


class TestFailStalePendingPartialRefund:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.maintenance.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            mock_result = MagicMock()
            mock_result.one.return_value = SimpleNamespace(auto_failed_count=3, refunded_count=1)
            mock_session.execute.return_value = mock_result
            mock_get_session.return_value = mock_session
            yield

    def test_returns_partial_refund_counts(self):
        result = fail_stale_pending_jobs()
        assert result["auto_failed_count"] == 3
        assert result["refunded_count"] == 1


class TestFailStalePendingError:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.maintenance.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            mock_session.execute.side_effect = RuntimeError("db down")
            mock_get_session.return_value = mock_session
            self.mock_session = mock_session
            yield

    def test_rolls_back_and_reraises(self):
        with pytest.raises(RuntimeError, match="db down"):
            fail_stale_pending_jobs()
        self.mock_session.rollback.assert_called_once()
        self.mock_session.commit.assert_not_called()

    def test_closes_session_on_error(self):
        with pytest.raises(RuntimeError):
            fail_stale_pending_jobs()
        self.mock_session.close.assert_called_once()


class TestFailStaleRunningTaskMeta:
    def test_has_correct_name(self):
        assert fail_stale_running_jobs.name == "maintenance.fail_stale_running"

    def test_has_acks_late_true(self):
        assert fail_stale_running_jobs.acks_late is True

    def test_has_max_retries_1(self):
        assert fail_stale_running_jobs.max_retries == 1

    def test_stale_running_threshold_is_20_minutes(self):
        assert STALE_RUNNING_THRESHOLD_MINUTES == 20


class TestFailStaleRunningSuccess:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.maintenance.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            mock_result = MagicMock()
            mock_result.one.return_value = SimpleNamespace(auto_failed_count=1, refunded_count=1)
            mock_session.execute.return_value = mock_result
            mock_get_session.return_value = mock_session
            self.mock_session = mock_session
            yield

    def test_returns_counts(self):
        result = fail_stale_running_jobs()
        assert result == {"auto_failed_count": 1, "refunded_count": 1}

    def test_execute_uses_running_status_and_started_at_cutoff(self):
        before = datetime.now(UTC)
        fail_stale_running_jobs()
        after = datetime.now(UTC)

        params = self.mock_session.execute.call_args[0][1]
        sql = str(self.mock_session.execute.call_args[0][0])
        assert params["status"] == "running"
        assert params["summary"] == STALE_RUNNING_FAIL_SUMMARY
        assert "COALESCE(started_at, created_at) < :cutoff" in sql
        assert "stuck running" in sql
        expected_min = before - timedelta(minutes=STALE_RUNNING_THRESHOLD_MINUTES)
        expected_max = after - timedelta(minutes=STALE_RUNNING_THRESHOLD_MINUTES)
        assert expected_min <= params["cutoff"] <= expected_max

    def test_commits_and_closes(self):
        fail_stale_running_jobs()
        self.mock_session.commit.assert_called_once()
        self.mock_session.close.assert_called_once()

    def test_logs_warning_when_jobs_failed(self):
        with patch("tasks.maintenance.logger") as mock_logger:
            fail_stale_running_jobs()
            mock_logger.warning.assert_called_once()
            assert mock_logger.warning.call_args.kwargs.get("count") == 1
            assert mock_logger.warning.call_args.kwargs.get("threshold") == STALE_RUNNING_THRESHOLD_MINUTES


class TestFailStaleRunningNoJobs:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.maintenance.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            mock_result = MagicMock()
            mock_result.one.return_value = SimpleNamespace(auto_failed_count=0, refunded_count=0)
            mock_session.execute.return_value = mock_result
            mock_get_session.return_value = mock_session
            yield

    def test_returns_zero_and_no_warning(self):
        with patch("tasks.maintenance.logger") as mock_logger:
            result = fail_stale_running_jobs()
            assert result == {"auto_failed_count": 0, "refunded_count": 0}
            mock_logger.warning.assert_not_called()


class TestFailStaleRunningError:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.maintenance.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            mock_session.execute.side_effect = RuntimeError("db down")
            mock_get_session.return_value = mock_session
            self.mock_session = mock_session
            yield

    def test_rolls_back_and_closes(self):
        with pytest.raises(RuntimeError, match="db down"):
            fail_stale_running_jobs()
        self.mock_session.rollback.assert_called_once()
        self.mock_session.commit.assert_not_called()
        self.mock_session.close.assert_called_once()
