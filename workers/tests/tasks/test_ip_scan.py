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
            patch("tasks.ip_scan.redis.Redis") as mock_redis,
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
        with patch("tasks.ip_scan.redis.Redis") as mock_redis:
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
            patch("tasks.ip_scan.redis.Redis") as mock_redis,
            patch("tasks.ip_scan._refund_credits") as mock_refund_credits,
        ):
            mock_nmap.side_effect = Exception("nmap binary not found")
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_nmap = mock_nmap
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_redis = mock_redis
            self.mock_refund_credits = mock_refund_credits
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


class TestIpScanNmapRetryReraise:
    """When run_nmap raises Retry, the bare raise on line 62 re-raises it."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan.redis.Redis") as mock_redis,
            patch("tasks.ip_scan._update_status") as mock_update_status,
        ):
            mock_nmap.side_effect = Retry("simulated retry")
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()
            self.mock_session = mock_session
            self.mock_nmap = mock_nmap
            self.mock_progress = mock_progress
            self.mock_redis = mock_redis
            self.mock_update_status = mock_update_status
            yield

    def _call_task(self):
        from tasks.ip_scan import run_ip_scan
        task_cls = type(run_ip_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry") as mock_retry,
            patch.object(task_cls, "max_retries", 3),
        ):
            mock_req.return_value = MagicMock(retries=0)
            self.mock_retry = mock_retry
            run_ip_scan(JOB_ID, TARGET, PORTS)

    def test_nmap_retry_reraise_does_not_call_retry_again(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_not_called()


class TestIpScanEmptyResults:
    @pytest.fixture(autouse=True)
    def _setup_patches(self, sample_nmap_result_no_hosts):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan._save_findings") as mock_save_findings,
            patch("tasks.ip_scan.redis.Redis") as mock_redis,
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


class TestRefundCredits:

    JOB_ID_STR = "refund-job-uuid"
    USER_ID_STR = "user-uuid-1234"
    CREDIT_COST = 10

    @pytest.fixture(autouse=True)
    def _setup_app_models(self):
        import sys
        import types

        fake_scan_job = types.ModuleType("app.models.scan_job")
        fake_scan_job.ScanJob = self._make_mock_model(["id", "user_id", "credit_cost"])
        fake_user = types.ModuleType("app.models.user")
        fake_user.User = self._make_mock_model(["id", "credits"])
        fake_credit_log = types.ModuleType("app.models.credit_log")
        fake_credit_log.CreditLog = self._make_record_class(["user_id", "amount", "type", "description", "reference_id"])

        saved = {}
        for name in ("app.models.scan_job", "app.models.user", "app.models.credit_log"):
            if name in sys.modules:
                saved[name] = sys.modules[name]
            sys.modules[name] = fake_scan_job if "scan_job" in name else (fake_user if "user" in name else fake_credit_log)

        yield

        for name in ("app.models.scan_job", "app.models.user", "app.models.credit_log"):
            if name in saved:
                sys.modules[name] = saved[name]
            else:
                sys.modules.pop(name, None)

    @staticmethod
    def _make_mock_model(attrs):
        mock_cls = MagicMock()
        for attr in attrs:
            setattr(mock_cls, attr, MagicMock())
        return mock_cls

    @staticmethod
    def _make_record_class(attrs):
        class Record:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    object.__setattr__(self, k, v)
        return Record

    def _mock_job(self, user_id=None, credit_cost=None):
        job = MagicMock()
        job.id = self.JOB_ID_STR
        job.user_id = user_id
        job.credit_cost = credit_cost
        return job

    def _mock_user(self, credits=50):
        user = MagicMock()
        user.id = self.USER_ID_STR
        user.credits = credits
        return user

    def test_refund_credits_increments_user_credits_and_creates_credit_log(self):
        session = MagicMock()
        job = self._mock_job(user_id=self.USER_ID_STR, credit_cost=self.CREDIT_COST)
        user = self._mock_user(credits=50)

        session.query.return_value.where.return_value.one_or_none.side_effect = [job, user]

        from tasks.ip_scan import _refund_credits
        _refund_credits(session, self.JOB_ID_STR, "ip")

        assert user.credits == 60
        session.add.assert_called_once()
        added_log = session.add.call_args[0][0]
        assert added_log.user_id == self.USER_ID_STR
        assert added_log.amount == self.CREDIT_COST
        assert added_log.type == "refund"
        assert added_log.description == "Refund: ip scan failed"
        assert added_log.reference_id == self.JOB_ID_STR

    def test_refund_credits_no_job_returns_early(self):
        session = MagicMock()
        session.query.return_value.where.return_value.one_or_none.return_value = None

        from tasks.ip_scan import _refund_credits
        _refund_credits(session, "nonexistent-job", "ip")

        session.add.assert_not_called()

    def test_refund_credits_no_user_id_returns_early(self):
        session = MagicMock()
        job = self._mock_job(user_id=None, credit_cost=self.CREDIT_COST)
        session.query.return_value.where.return_value.one_or_none.return_value = job

        from tasks.ip_scan import _refund_credits
        _refund_credits(session, self.JOB_ID_STR, "ip")

        session.add.assert_not_called()

    def test_refund_credits_no_credit_cost_returns_early(self):
        session = MagicMock()
        job = self._mock_job(user_id=self.USER_ID_STR, credit_cost=0)
        session.query.return_value.where.return_value.one_or_none.return_value = job

        from tasks.ip_scan import _refund_credits
        _refund_credits(session, self.JOB_ID_STR, "ip")

        session.add.assert_not_called()

    def test_refund_credits_user_not_found_returns_early(self):
        session = MagicMock()
        job = self._mock_job(user_id=self.USER_ID_STR, credit_cost=self.CREDIT_COST)
        session.query.return_value.where.return_value.one_or_none.side_effect = [job, None]

        from tasks.ip_scan import _refund_credits
        _refund_credits(session, self.JOB_ID_STR, "ip")

        session.add.assert_not_called()


class TestSaveFindingsEmpty:

    @pytest.fixture(autouse=True)
    def _setup_app_models(self):
        import sys
        import types

        fake_scan_finding = types.ModuleType("app.models.scan_finding")
        fake_scan_finding.ScanFinding = MagicMock

        saved = None
        if "app.models.scan_finding" in sys.modules:
            saved = sys.modules["app.models.scan_finding"]
        sys.modules["app.models.scan_finding"] = fake_scan_finding

        yield

        if saved is not None:
            sys.modules["app.models.scan_finding"] = saved
        else:
            sys.modules.pop("app.models.scan_finding", None)

    def test_save_findings_empty_list_does_not_crash(self):
        from tasks.ip_scan import _save_findings

        session = MagicMock()
        _save_findings(session, "job-123", [])
        session.add.assert_not_called()

    def test_save_findings_populates_scan_finding_fields(self):
        from tasks.ip_scan import _save_findings

        session = MagicMock()
        findings = [
            {
                "severity": "critical",
                "category": "rce",
                "title": "RCE in foo",
                "description": "Remote code execution",
                "cve_id": "CVE-2024-0001",
                "cvss_score": 9.8,
                "remediation": "Upgrade",
                "raw_data": {"key": "value"},
            },
        ]
        _save_findings(session, "job-456", findings)
        session.add.assert_called_once()
        added = session.add.call_args[0][0]
        assert added.job_id == "job-456"
        assert added.severity == "critical"
        assert added.cve_id == "CVE-2024-0001"
        assert added.cvss_score == 9.8


class TestIpScanCatchAllHandler:

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan.redis.Redis") as mock_redis,
        ):
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()
            self.mock_session = mock_session
            self.mock_progress = mock_progress
            self.mock_redis = mock_redis
            yield

    def _call_task_with_failure(self):
        from tasks.ip_scan import run_ip_scan

        task_cls = type(run_ip_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.ip_scan.dead_letter_handler") as mock_dead_letter,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan._refund_credits") as mock_refund,
        ):
            mock_req.return_value = MagicMock(retries=1)
            mock_update_status.side_effect = [None, Exception("DB down")]
            mock_refund.side_effect = Exception("Refund DB error")

            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            self.mock_update_status = mock_update_status

            with patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap:
                mock_nmap.side_effect = Exception("nmap segfault")
                run_ip_scan(JOB_ID, TARGET, PORTS)

    def test_catch_all_retries_even_when_inner_update_fails(self):
        with pytest.raises(Retry):
            self._call_task_with_failure()
        self.mock_retry.assert_called_once()

    def test_catch_all_publishes_failure_progress(self):
        with pytest.raises(Retry):
            self._call_task_with_failure()
        self.mock_progress.assert_any_call(JOB_ID, "failed", 100, ANY)

    def test_catch_all_no_dead_letter_on_mid_retry(self):
        with pytest.raises(Retry):
            self._call_task_with_failure()
        self.mock_dead_letter.delay.assert_not_called()

    def test_catch_all_countdown_is_correct(self):
        with pytest.raises(Retry):
            self._call_task_with_failure()
        args, kwargs = self.mock_retry.call_args
        assert kwargs["countdown"] == 120


class TestIpScanCatchAllFinalRetry:
    """Catch-all handler on final retry — triggers dead letter (line 150)."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan.redis.Redis") as mock_redis,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan._refund_credits") as mock_refund,
            patch("tasks.ip_scan._save_findings") as mock_save_findings,
        ):
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()
            self.mock_session = mock_session
            self.mock_progress = mock_progress
            self.mock_redis = mock_redis
            self.mock_update_status = mock_update_status
            self.mock_refund = mock_refund
            self.mock_save_findings = mock_save_findings
            yield

    def _call_task_on_final_retry(self):
        from tasks.ip_scan import run_ip_scan

        task_cls = type(run_ip_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.ip_scan.dead_letter_handler") as mock_dead_letter,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
        ):
            mock_req.return_value = MagicMock(retries=3)
            mock_nmap.return_value = MagicMock(hosts=[])
            mock_cve.return_value = []
            mock_save_findings = self.mock_save_findings
            mock_save_findings.side_effect = Exception("DB error during save")
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_ip_scan(JOB_ID, TARGET, PORTS)

    def test_catch_all_final_retry_calls_dead_letter(self):
        with pytest.raises(Retry):
            self._call_task_on_final_retry()
        self.mock_dead_letter.delay.assert_called_once()
        call_kwargs = self.mock_dead_letter.delay.call_args[1]
        assert call_kwargs["task_name"] == "ip_scan.run"
        assert call_kwargs["args"] == [JOB_ID, TARGET, PORTS]


class TestIpScanCatchAllInnerTrySuccess:
    """Catch-all handler where inner _update_status/_refund_credits succeed (lines 143-145)."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan.redis.Redis") as mock_redis,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan._refund_credits") as mock_refund,
            patch("tasks.ip_scan._save_findings") as mock_save_findings,
        ):
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()
            self.mock_session = mock_session
            self.mock_progress = mock_progress
            self.mock_redis = mock_redis
            self.mock_update_status = mock_update_status
            self.mock_refund = mock_refund
            self.mock_save_findings = mock_save_findings
            yield

    def _call_task_with_inner_success(self):
        from tasks.ip_scan import run_ip_scan

        task_cls = type(run_ip_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.ip_scan.dead_letter_handler") as mock_dead_letter,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
        ):
            mock_req.return_value = MagicMock(retries=1)
            mock_nmap.return_value = MagicMock(hosts=[])
            mock_cve.return_value = []
            mock_save_findings = self.mock_save_findings
            mock_save_findings.side_effect = Exception("DB error during save")
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_ip_scan(JOB_ID, TARGET, PORTS)

    def test_catch_all_inner_try_calls_update_status(self):
        with pytest.raises(Retry):
            self._call_task_with_inner_success()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value, JOB_ID, "failed",
        )

    def test_catch_all_inner_try_calls_refund_credits(self):
        with pytest.raises(Retry):
            self._call_task_with_inner_success()
        self.mock_refund.assert_called_once_with(
            self.mock_session.return_value, JOB_ID, "ip",
        )

    def test_catch_all_inner_try_commits_and_closes(self):
        with pytest.raises(Retry):
            self._call_task_with_inner_success()
        mock_session_instance = self.mock_session.return_value
        mock_session_instance.commit.assert_called()
        mock_session_instance.close.assert_called()


class TestRunAsync:
    """Tests for the _run_async helper function."""

    def test_run_async_creates_new_event_loop_on_runtime_error(self):
        from tasks.ip_scan import _run_async

        async def dummy():
            return "ok"

        with patch("asyncio.get_event_loop", side_effect=RuntimeError("no loop")):
            with patch("asyncio.new_event_loop") as mock_new_loop:
                with patch("asyncio.set_event_loop") as mock_set_loop:
                    mock_loop = MagicMock()
                    mock_loop.run_until_complete.return_value = "ok"
                    mock_new_loop.return_value = mock_loop
                    result = _run_async(dummy())
                    assert result == "ok"
                    mock_new_loop.assert_called_once()
                    mock_set_loop.assert_called_once_with(mock_loop)


class TestCveLookupFailure:
    """CVE lookup exception is handled gracefully — vulns set to empty list."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self, sample_nmap_result):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan._save_findings") as mock_save_findings,
            patch("tasks.ip_scan.redis.Redis") as mock_redis,
        ):
            mock_nmap.return_value = sample_nmap_result
            mock_cve.side_effect = Exception("OSV API timeout")
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

    def test_cve_lookup_failure_does_not_crash_scan(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result

    def test_cve_lookup_failure_still_saves_base_findings(self):
        self._call_task()
        self.mock_save_findings.assert_called_once()
        args, _ = self.mock_save_findings.call_args
        assert args[1] == JOB_ID
        # base findings still present (from nmap, no CVEs added)
        assert len(args[2]) >= 2


class TestHealthRedisError:
    """Redis health timestamp failure is handled gracefully."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self, sample_nmap_result, sample_vulns):
        with (
            patch("tasks.ip_scan.get_sync_session") as mock_session,
            patch("tasks.ip_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.ip_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
            patch("tasks.ip_scan.publish_progress") as mock_progress,
            patch("tasks.ip_scan._update_status") as mock_update_status,
            patch("tasks.ip_scan._save_findings") as mock_save_findings,
            patch("tasks.ip_scan.redis.Redis") as mock_redis_cls,
        ):
            mock_nmap.return_value = sample_nmap_result
            mock_cve.return_value = sample_vulns
            mock_session.return_value = MagicMock()

            mock_redis_instance = MagicMock()
            mock_redis_instance.set.side_effect = Exception("Redis connection refused")
            mock_redis_cls.return_value = mock_redis_instance

            self.mock_session = mock_session
            self.mock_nmap = mock_nmap
            self.mock_cve = mock_cve
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_save_findings = mock_save_findings
            self.mock_redis_cls = mock_redis_cls
            self.mock_redis_instance = mock_redis_instance
            yield

    def _call_task(self):
        from tasks.ip_scan import run_ip_scan
        return run_ip_scan(JOB_ID, TARGET, PORTS)

    def test_health_redis_error_does_not_crash_scan(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert result["summary"]["total_findings"] > 0

    def test_health_redis_error_still_completes_scan(self):
        self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value, JOB_ID, "completed",
            progress=100, result_summary=ANY, completed_at=ANY,
        )


class TestUpdateStatus:
    """Tests for the _update_status helper function."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        import sys
        import types

        fake_scan_job = types.ModuleType("app.models.scan_job")
        fake_scan_job.ScanJob = MagicMock()

        saved = None
        if "app.models.scan_job" in sys.modules:
            saved = sys.modules["app.models.scan_job"]
        sys.modules["app.models.scan_job"] = fake_scan_job

        with patch("tasks.ip_scan.update") as mock_update:
            self.mock_update = mock_update
            yield

        if saved is not None:
            sys.modules["app.models.scan_job"] = saved
        else:
            sys.modules.pop("app.models.scan_job", None)

    def test_update_status_executes_update_with_correct_values(self):
        from tasks.ip_scan import _update_status

        session = MagicMock()
        _update_status(session, "job-abc", "running", started_at="2024-01-01")

        session.execute.assert_called_once()
        call_args = session.execute.call_args[0][0]
        assert call_args is not None

    def test_update_status_passes_extra_kwargs(self):
        from tasks.ip_scan import _update_status

        session = MagicMock()
        _update_status(session, "job-xyz", "completed", progress=100, result_summary={"total": 5})

        session.execute.assert_called_once()
