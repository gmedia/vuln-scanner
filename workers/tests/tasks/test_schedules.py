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


class TestRunDueIncludedAttach:
    def test_enqueues_when_wallet_would_have_been_short(self):
        schedule_id = uuid4()
        user_id = uuid4()
        due = _row(schedule_id=schedule_id, user_id=user_id)
        job_id = uuid4()

        session = MagicMock()
        select_due = MagicMock()
        select_due.fetchall.return_value = [due]
        insert_job = MagicMock()
        update_task = MagicMock()
        update_schedule = MagicMock()
        session.execute.side_effect = [select_due, insert_job, update_task, update_schedule]

        with (
            patch("tasks.schedules.get_sync_session", return_value=session),
            patch("tasks.schedules._dispatch_scan", return_value="celery-task-1") as dispatch,
            patch("tasks.schedules.uuid.uuid4", return_value=job_id),
        ):
            result = run_due_schedules(limit=10)

        assert result["enqueued"] == 1
        assert result["errors"] == 0
        assert result["examined"] == 1
        dispatch.assert_called_once()
        session.commit.assert_called()
        session.close.assert_called_once()

        insert_params = session.execute.call_args_list[1][0][1]
        assert insert_params["credit_cost"] == 0
        assert insert_params["user_id"] == user_id
        sql_blobs = " ".join(str(c[0][0]) for c in session.execute.call_args_list).lower()
        assert "from users" not in sql_blobs
        assert "enabled = false" not in sql_blobs


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
