import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from tasks.billing import PAST_DUE_GRACE_DAYS, finalize_periods


class TestFinalizePeriodsMeta:
    def test_is_shared_task(self):
        assert finalize_periods.name == "billing.finalize_periods"

    def test_has_acks_late(self):
        assert finalize_periods.acks_late is True

    def test_has_single_retry(self):
        assert finalize_periods.max_retries == 1

    def test_default_grace_is_seven_days(self):
        assert PAST_DUE_GRACE_DAYS == 7


class TestFinalizePeriodsRun:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with patch("tasks.billing.get_sync_session") as mock_get_session:
            mock_session = MagicMock()
            cancel_result = MagicMock()
            cancel_result.all.return_value = [SimpleNamespace(id="a"), SimpleNamespace(id="b")]
            past_due_result = MagicMock()
            past_due_result.all.return_value = [SimpleNamespace(id="c")]
            mock_session.execute.side_effect = [cancel_result, past_due_result]
            mock_get_session.return_value = mock_session
            self.mock_get_session = mock_get_session
            self.mock_session = mock_session
            yield

    def test_returns_counts(self):
        result = finalize_periods()
        assert result == {"canceled_count": 2, "past_due_count": 1}

    def test_runs_two_updates(self):
        finalize_periods()
        assert self.mock_session.execute.call_count == 2

    def test_passes_grace_days(self):
        finalize_periods()
        params = self.mock_session.execute.call_args_list[1][0][1]
        assert params["grace_days"] == PAST_DUE_GRACE_DAYS
        assert "now" in params

    def test_closes_canceled_before_marking_past_due(self):
        finalize_periods()
        first_sql = str(self.mock_session.execute.call_args_list[0][0][0])
        second_sql = str(self.mock_session.execute.call_args_list[1][0][0])
        assert "cancel_at_period_end = true" in first_sql
        assert "status = 'past_due'" in second_sql
        assert "status = 'active'" in second_sql

    def test_commits_and_closes(self):
        finalize_periods()
        self.mock_session.commit.assert_called_once()
        self.mock_session.rollback.assert_not_called()
        self.mock_session.close.assert_called_once()

    def test_rolls_back_on_error(self):
        self.mock_session.execute.side_effect = RuntimeError("db down")
        with pytest.raises(RuntimeError):
            finalize_periods()
        self.mock_session.rollback.assert_called_once()
        self.mock_session.commit.assert_not_called()
        self.mock_session.close.assert_called_once()
