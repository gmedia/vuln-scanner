import sys
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

from tasks.schedules import run_due_schedules


def _row(
    *,
    schedule_id=None,
    user_id=None,
    scan_type="domain",
    target="example.com",
    cadence="weekly",
    timezone="UTC",
    next_run_at=None,
    last_job_id=None,
    organization_id=None,
):
    return (
        schedule_id or uuid4(),
        user_id or uuid4(),
        scan_type,
        target,
        cadence,
        timezone,
        next_run_at or datetime.now(UTC),
        last_job_id,
        organization_id,
    )


class TestRunDueInsufficientCredits:
    def test_disables_schedule_and_sets_last_error_without_job(self):
        schedule_id = uuid4()
        user_id = uuid4()
        due = _row(schedule_id=schedule_id, user_id=user_id)

        session = MagicMock()
        select_due = MagicMock()
        select_due.fetchall.return_value = [due]
        pricing = MagicMock()
        pricing.scalar.return_value = 5
        credits = MagicMock()
        credits.scalar.return_value = 2
        update_result = MagicMock()

        session.execute.side_effect = [select_due, pricing, credits, update_result]

        with (
            patch("tasks.schedules.get_sync_session", return_value=session),
            patch("tasks.schedules._dispatch_scan") as dispatch,
        ):
            result = run_due_schedules(limit=10)

        assert result["enqueued"] == 0
        assert result["errors"] == 1
        assert result["examined"] == 1
        dispatch.assert_not_called()
        session.commit.assert_called()
        session.close.assert_called_once()

        update_call = session.execute.call_args_list[3]
        params = update_call[0][1]
        assert params["sid"] == schedule_id
        assert "Insufficient credits" in params["err"]
        assert "Need 5" in params["err"]
        assert "have 2" in params["err"]


class TestRunDueSkipInFlight:
    def test_skips_when_last_job_pending(self):
        last_job_id = uuid4()
        due = _row(last_job_id=last_job_id)

        session = MagicMock()
        select_due = MagicMock()
        select_due.fetchall.return_value = [due]
        job_status = MagicMock()
        job_status.scalar.return_value = "pending"
        session.execute.side_effect = [select_due, job_status]

        with (
            patch("tasks.schedules.get_sync_session", return_value=session),
            patch("tasks.schedules._dispatch_scan") as dispatch,
        ):
            result = run_due_schedules()

        assert result["skipped"] == 1
        assert result["enqueued"] == 0
        dispatch.assert_not_called()
