"""Tests for workers.tasks.domain_scan — Celery task orchestration."""

import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

from unittest.mock import ANY, AsyncMock, MagicMock, PropertyMock, patch

import pytest
from celery.exceptions import Retry

JOB_ID = "test-job-domain-5678"
DOMAIN = "example.com"


class TestDomainScanSuccessfulFlow:
    @pytest.fixture(autouse=True)
    def _setup_patches(self, sample_nmap_result, sample_vulns):
        from utils.domain_utils import TechInfo

        with (
            patch("tasks.domain_scan.get_sync_session") as mock_session,
            patch("tasks.domain_scan.resolve_dns", new_callable=AsyncMock) as mock_dns,
            patch("tasks.domain_scan.enumerate_subdomains", new_callable=AsyncMock) as mock_sub,
            patch("tasks.domain_scan.check_http", new_callable=AsyncMock) as mock_http,
            patch("tasks.domain_scan.check_ssl", new_callable=AsyncMock) as mock_ssl,
            patch("tasks.domain_scan.check_security_headers") as mock_headers,
            patch("tasks.domain_scan.detect_tech_stack") as mock_tech,
            patch("tasks.domain_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.domain_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
            patch("tasks.domain_scan.publish_progress") as mock_progress,
            patch("tasks.domain_scan._update_status") as mock_update_status,
            patch("tasks.domain_scan._save_findings") as mock_save_findings,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_dns.return_value = (["93.184.216.34"], [])
            mock_sub.return_value = ["www.example.com", "mail.example.com"]
            mock_http.return_value = (True, True, 200, {"Server": "nginx/1.24.0"})
            mock_ssl.return_value = MagicMock(
                issues=[],
                cipher="TLS_AES_256_GCM_SHA384",
                subject="CN=example.com",
                issuer="CN=CA",
                not_after="2026-01-01",
                days_remaining=365,
            )
            mock_headers.return_value = []
            mock_tech.return_value = [
                TechInfo(name="nginx", category="web_server", version="1.24.0", confidence=100),
                TechInfo(name="OpenResty", category="web_server", version="", confidence=80),
            ]
            mock_nmap.return_value = sample_nmap_result
            mock_cve.return_value = sample_vulns
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_dns = mock_dns
            self.mock_sub = mock_sub
            self.mock_http = mock_http
            self.mock_ssl = mock_ssl
            self.mock_headers = mock_headers
            self.mock_tech = mock_tech
            self.mock_nmap = mock_nmap
            self.mock_cve = mock_cve
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_save_findings = mock_save_findings
            self.mock_redis = mock_redis
            yield

    def _call_task(self, domain=DOMAIN):
        from tasks.domain_scan import run_domain_scan

        return run_domain_scan(JOB_ID, domain)

    def test_successful_domain_scan_completes(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result
        assert result["summary"]["total_findings"] > 0

    def test_domain_lowercased(self):
        self._call_task(domain="EXAMPLE.COM")
        assert self.mock_dns.call_args[0][0] == "example.com"

    def test_domain_url_stripped(self):
        self._call_task(domain="https://example.com/path")
        assert self.mock_dns.call_args[0][0] == "example.com"

    def test_dns_resolution_called(self):
        self._call_task()
        self.mock_dns.assert_called_once_with(DOMAIN)

    def test_subdomain_enumeration_called(self):
        self._call_task()
        self.mock_sub.assert_called_once()

    def test_http_check_called(self):
        self._call_task()
        self.mock_http.assert_called_once_with(DOMAIN)

    def test_ssl_check_called_when_https(self):
        self._call_task()
        self.mock_ssl.assert_called_once_with(DOMAIN)

    def test_security_headers_checked(self):
        self._call_task()
        self.mock_headers.assert_called_once()

    def test_tech_stack_detected(self):
        self._call_task()
        self.mock_tech.assert_called_once()

    def test_nmap_run_in_domain_scan(self):
        self._call_task()
        self.mock_nmap.assert_called_once()

    def test_cve_lookup_for_detected_tech(self):
        self._call_task()
        assert self.mock_cve.call_count >= 1

    def test_findings_saved(self):
        self._call_task()
        self.mock_save_findings.assert_called_once()

    def test_status_completed(self):
        self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )

    def test_health_last_task_completed_set(self):
        self._call_task()
        self.mock_redis.return_value.set.assert_called_once()
        call_args = self.mock_redis.return_value.set.call_args[0]
        assert "health:last_task_completed" in call_args

    def test_progress_published(self):
        self._call_task()
        progress_calls = [c for c in self.mock_progress.call_args_list if c[0][0] == JOB_ID]
        assert len(progress_calls) > 5

    def test_ssl_not_checked_when_no_https(self):
        self.mock_http.return_value = (True, False, 200, {})
        self._call_task()
        self.mock_ssl.assert_not_called()


class TestDomainScanFailure:
    _RETRIES = 0

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.domain_scan.get_sync_session") as mock_session,
            patch("tasks.domain_scan.resolve_dns", new_callable=AsyncMock) as mock_dns,
            patch("tasks.domain_scan.publish_progress") as mock_progress,
            patch("tasks.domain_scan._update_status") as mock_update_status,
            patch("tasks.domain_scan._refund_credits") as mock_refund,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_dns.side_effect = Exception("DNS resolution failed")
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_dns = mock_dns
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_refund = mock_refund
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.domain_scan import run_domain_scan

        task_cls = type(run_domain_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.domain_scan.dead_letter_handler") as mock_dead_letter,
        ):
            mock_req.return_value = MagicMock(retries=self._RETRIES)
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_domain_scan(JOB_ID, DOMAIN)

    def test_dns_failure_triggers_retry(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once()

    def test_dns_failure_sets_status_failed(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "failed",
        )

    def test_dns_failure_not_dead_letter_on_first_retry(self):
        self._RETRIES = 0
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_not_called()

    def test_dns_failure_calls_refund_credits(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_refund.assert_called_once_with(
            self.mock_session.return_value,
            JOB_ID,
            "domain",
        )

    def test_dns_failure_commits_and_closes_session(self):
        with pytest.raises(Retry):
            self._call_task()
        mock_sess = self.mock_session.return_value
        mock_sess.commit.assert_called()
        mock_sess.close.assert_called()


class TestDomainScanFinalRetry(TestDomainScanFailure):
    _RETRIES = 3

    def test_dns_failure_dead_letter_on_final_retry(self):
        self._RETRIES = 3
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_called_once()
        args, kwargs = self.mock_dead_letter.delay.call_args
        assert kwargs["task_name"] == "domain_scan.run"
        assert kwargs["args"] == [JOB_ID, DOMAIN]


class TestDomainScanNmapFailure:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        from utils.domain_utils import TechInfo

        with (
            patch("tasks.domain_scan.get_sync_session") as mock_session,
            patch("tasks.domain_scan.resolve_dns") as mock_dns,
            patch("tasks.domain_scan.enumerate_subdomains") as mock_sub,
            patch("tasks.domain_scan.check_http") as mock_http,
            patch("tasks.domain_scan.check_security_headers") as mock_headers,
            patch("tasks.domain_scan.detect_tech_stack") as mock_tech,
            patch("tasks.domain_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.domain_scan.lookup_service_cves", new_callable=AsyncMock) as _mock_cve,
            patch("tasks.domain_scan.publish_progress") as mock_progress,
            patch("tasks.domain_scan._update_status") as mock_update_status,
            patch("tasks.domain_scan._save_findings") as mock_save_findings,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_session.return_value = MagicMock()
            mock_dns.return_value = (["93.184.216.34"], [])
            mock_sub.return_value = []
            mock_http.return_value = (True, True, 200, {"Server": "nginx/1.24.0"})
            mock_headers.return_value = []
            mock_tech.return_value = [
                TechInfo(name="nginx", category="web_server", version="1.24.0", confidence=100),
            ]
            mock_nmap.side_effect = Exception("nmap failed")
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_save_findings = mock_save_findings
            self.mock_nmap = mock_nmap
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.domain_scan import run_domain_scan

        return run_domain_scan(JOB_ID, DOMAIN)

    def test_nmap_failure_does_not_crash_domain_scan(self):
        self._call_task()
        self.mock_save_findings.assert_called_once()
        self.mock_update_status.assert_any_call(
            ANY,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )

    @patch("tasks.domain_scan.lookup_service_cves", new_callable=AsyncMock)
    @patch("tasks.domain_scan.check_ssl", new_callable=AsyncMock)
    def test_cve_lookup_failure_does_not_crash(self, mock_ssl, mock_cve):
        mock_ssl.return_value = MagicMock(
            issues=[],
            cipher="TLS_AES_256_GCM_SHA384",
            subject="CN=example.com",
            issuer="CN=CA",
            not_after="2026-01-01",
            days_remaining=365,
        )
        mock_cve.side_effect = Exception("CVE lookup failed")
        result = self._call_task()
        self.mock_save_findings.assert_called_once()
        self.mock_update_status.assert_any_call(
            ANY,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )
        assert result["job_id"] == JOB_ID

    @patch("tasks.domain_scan.check_ssl", new_callable=AsyncMock)
    def test_redis_health_failure_does_not_crash(self, mock_ssl):
        mock_ssl.return_value = MagicMock(
            issues=[],
            cipher="TLS_AES_256_GCM_SHA384",
            subject="CN=example.com",
            issuer="CN=CA",
            not_after="2026-01-01",
            days_remaining=365,
        )
        self.mock_redis.side_effect = Exception("Redis connection failed")
        result = self._call_task()
        self.mock_save_findings.assert_called_once()
        self.mock_update_status.assert_any_call(
            ANY,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )
        assert result["job_id"] == JOB_ID

    @patch("tasks.domain_scan.check_ssl", new_callable=AsyncMock)
    def test_publish_progress_failure_does_not_crash(self, mock_ssl):
        mock_ssl.return_value = MagicMock(
            issues=[],
            cipher="TLS_AES_256_GCM_SHA384",
            subject="CN=example.com",
            issuer="CN=CA",
            not_after="2026-01-01",
            days_remaining=365,
        )

        def publish_side_effect(job_id, step, progress, message):
            if step == "completed":
                raise Exception("Publish failed")
            return None

        self.mock_progress.side_effect = publish_side_effect
        with pytest.raises(Exception, match="Publish failed"):
            self._call_task()
        self.mock_save_findings.assert_called_once()


class TestDomainScanNestedStatusUpdateFailure:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.domain_scan.get_sync_session") as mock_session,
            patch("tasks.domain_scan.resolve_dns", new_callable=AsyncMock) as mock_dns,
            patch("tasks.domain_scan.publish_progress") as mock_progress,
            patch("tasks.domain_scan._update_status") as mock_update_status,
            patch("tasks.domain_scan._refund_credits") as mock_refund,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_dns.side_effect = Exception("DNS resolution failed")
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_dns = mock_dns
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_refund = mock_refund
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.domain_scan import run_domain_scan

        task_cls = type(run_domain_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.domain_scan.dead_letter_handler") as mock_dead_letter,
        ):
            mock_req.return_value = MagicMock(retries=0)
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_domain_scan(JOB_ID, DOMAIN)

    def test_nested_update_status_failure_does_not_crash(self):
        call_count = 0

        def update_status_side_effect(session, job_id, status, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise Exception("DB update failed in except handler")
            return None

        self.mock_update_status.side_effect = update_status_side_effect

        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once()


class TestPublishProgress:
    """Test the module-level publish_progress function (covers lines 34-36, 40-41)."""

    def test_publish_progress_handles_redis_error_gracefully(self):
        """When redis.Redis() returns an instance whose publish raises, logs warning."""
        from tasks.domain_scan import publish_progress

        with patch("tasks.domain_scan.redis.Redis") as mock_redis:
            mock_instance = MagicMock()
            mock_instance.publish.side_effect = Exception("Redis connection lost")
            mock_redis.return_value = mock_instance
            publish_progress("test-job", "nmap_scan", 50, "scanning")
        mock_instance.publish.assert_called_once()

    def test_publish_progress_handles_redis_constructor_error(self):
        """When redis.Redis() constructor itself raises, publish_progress logs warning."""
        from tasks.domain_scan import publish_progress

        with patch("tasks.domain_scan.redis.Redis") as mock_redis:
            mock_redis.side_effect = Exception("Cannot connect to Redis")
            publish_progress("test-job", "nmap_scan", 50, "scanning")
        # Should not raise — just log warning


class TestRunAsync:
    """Test the module-level _run_async helper (covers lines 48-50)."""

    def test_run_async_creates_new_event_loop_on_runtime_error(self):
        """When get_event_loop raises RuntimeError, _run_async creates new loop."""
        from tasks.domain_scan import _run_async

        async def dummy():
            return "ok"

        with (
            patch("asyncio.get_event_loop", side_effect=RuntimeError("No event loop")),
            patch("asyncio.new_event_loop") as mock_new,
            patch("asyncio.set_event_loop") as mock_set,
        ):
            mock_loop = MagicMock()
            mock_loop.run_until_complete.return_value = "ok"
            mock_new.return_value = mock_loop
            result = _run_async(dummy())
            assert result == "ok"
            mock_new.assert_called_once()
            mock_set.assert_called_once_with(mock_loop)
            mock_loop.run_until_complete.assert_called_once()


class TestUpdateStatus:
    """Test _update_status helper (covers lines 186-188)."""

    @pytest.fixture(autouse=True)
    def _setup_app_models(self):
        import sys
        import types

        fake_scan_job = types.ModuleType("app.models.scan_job")
        fake_scan_job.ScanJob = MagicMock()

        saved = {}
        if "app.models.scan_job" in sys.modules:
            saved["app.models.scan_job"] = sys.modules["app.models.scan_job"]
        sys.modules["app.models.scan_job"] = fake_scan_job

        with patch("tasks.domain_scan.update") as mock_update:
            self.mock_update = mock_update
            yield

        if "app.models.scan_job" in saved:
            sys.modules["app.models.scan_job"] = saved["app.models.scan_job"]
        else:
            sys.modules.pop("app.models.scan_job", None)

    def test_update_status_executes_update_with_status(self):
        from tasks.domain_scan import _update_status

        session = MagicMock()
        _update_status(session, "job-123", "completed")
        session.execute.assert_called()
        session.commit.assert_not_called()  # commit handled by caller

    def test_update_status_passes_extra_kwargs(self):
        from tasks.domain_scan import _update_status

        session = MagicMock()
        _update_status(session, "job-xyz", "running", started_at="2024-01-01T00:00:00Z")
        session.execute.assert_called_once()


class TestSaveFindings:
    """Test _save_findings helper (covers lines 192-194, 206)."""

    @pytest.fixture(autouse=True)
    def _setup_app_models(self):
        import sys
        import types

        fake_scan_finding = types.ModuleType("app.models.scan_finding")
        fake_scan_finding.ScanFinding = MagicMock

        saved = {}
        if "app.models.scan_finding" in sys.modules:
            saved["app.models.scan_finding"] = sys.modules["app.models.scan_finding"]
        sys.modules["app.models.scan_finding"] = fake_scan_finding

        yield

        if "app.models.scan_finding" in saved:
            sys.modules["app.models.scan_finding"] = saved["app.models.scan_finding"]
        else:
            sys.modules.pop("app.models.scan_finding", None)

    def test_save_findings_empty_list_does_not_crash(self):
        from tasks.domain_scan import _save_findings

        session = MagicMock()
        _save_findings(session, "job-123", [])
        session.add.assert_not_called()

    def test_save_findings_populates_scan_finding_fields(self):
        from tasks.domain_scan import _save_findings

        session = MagicMock()
        findings = [
            {
                "severity": "critical",
                "category": "rce",
                "title": "RCE in foo",
                "description": "Remote code execution vulnerability",
                "cve_id": "CVE-2024-0001",
                "cvss_score": 9.8,
                "remediation": "Upgrade to patched version",
                "raw_data": {"key": "value"},
            },
            {
                "severity": "info",
                "category": "ssl",
                "title": "SSL Info",
                "description": "TLS 1.3",
                "cve_id": None,
                "cvss_score": None,
                "remediation": None,
                "raw_data": None,
            },
        ]
        _save_findings(session, "job-456", findings)
        assert session.add.call_count == 2
        first_added = session.add.call_args_list[0][0][0]
        assert first_added.job_id == "job-456"
        assert first_added.severity == "critical"
        assert first_added.cve_id == "CVE-2024-0001"
        assert first_added.cvss_score == 9.8
        second_added = session.add.call_args_list[1][0][0]
        assert second_added.cve_id is None


class TestRefundCredits:
    """Test _refund_credits helper (covers lines 211-230)."""

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
        credit_cols = ["user_id", "amount", "type", "description", "reference_id"]
        fake_credit_log.CreditLog = self._make_record_class(credit_cols)

        saved = {}
        for name in ("app.models.scan_job", "app.models.user", "app.models.credit_log"):
            if name in sys.modules:
                saved[name] = sys.modules[name]
            sys.modules[name] = (
                fake_scan_job if "scan_job" in name else (fake_user if "user" in name else fake_credit_log)
            )

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

        from tasks.domain_scan import _refund_credits

        _refund_credits(session, self.JOB_ID_STR, "domain")

        assert user.credits == 60
        session.add.assert_called_once()
        added_log = session.add.call_args[0][0]
        assert added_log.user_id == self.USER_ID_STR
        assert added_log.amount == self.CREDIT_COST
        assert added_log.type == "refund"
        assert added_log.description == "Refund: domain scan failed"
        assert added_log.reference_id == self.JOB_ID_STR

    def test_refund_credits_no_job_returns_early(self):
        session = MagicMock()
        session.query.return_value.where.return_value.one_or_none.return_value = None

        from tasks.domain_scan import _refund_credits

        _refund_credits(session, "nonexistent-job", "domain")

        session.add.assert_not_called()

    def test_refund_credits_no_user_id_returns_early(self):
        session = MagicMock()
        job = self._mock_job(user_id=None, credit_cost=self.CREDIT_COST)
        session.query.return_value.where.return_value.one_or_none.return_value = job

        from tasks.domain_scan import _refund_credits

        _refund_credits(session, self.JOB_ID_STR, "domain")

        session.add.assert_not_called()

    def test_refund_credits_no_credit_cost_returns_early(self):
        session = MagicMock()
        job = self._mock_job(user_id=self.USER_ID_STR, credit_cost=0)
        session.query.return_value.where.return_value.one_or_none.return_value = job

        from tasks.domain_scan import _refund_credits

        _refund_credits(session, self.JOB_ID_STR, "domain")

        session.add.assert_not_called()

    def test_refund_credits_user_not_found_returns_early(self):
        session = MagicMock()
        job = self._mock_job(user_id=self.USER_ID_STR, credit_cost=self.CREDIT_COST)
        session.query.return_value.where.return_value.one_or_none.side_effect = [job, None]

        from tasks.domain_scan import _refund_credits

        _refund_credits(session, self.JOB_ID_STR, "domain")

        session.add.assert_not_called()


class TestDomainScanEmptyTechStack:
    """Coverage for empty tech.name or tech.category branch (line 139)."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        from utils.domain_utils import TechInfo

        with (
            patch("tasks.domain_scan.get_sync_session") as mock_session,
            patch("tasks.domain_scan.resolve_dns", new_callable=AsyncMock) as mock_dns,
            patch("tasks.domain_scan.enumerate_subdomains", new_callable=AsyncMock) as mock_sub,
            patch("tasks.domain_scan.check_http", new_callable=AsyncMock) as mock_http,
            patch("tasks.domain_scan.check_ssl", new_callable=AsyncMock) as mock_ssl,
            patch("tasks.domain_scan.check_security_headers") as mock_headers,
            patch("tasks.domain_scan.detect_tech_stack") as mock_tech,
            patch("tasks.domain_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.domain_scan.lookup_service_cves", new_callable=AsyncMock) as mock_cve,
            patch("tasks.domain_scan.publish_progress") as _mock_progress,
            patch("tasks.domain_scan._update_status") as _mock_update_status,
            patch("tasks.domain_scan._save_findings") as mock_save_findings,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            mock_dns.return_value = (["1.2.3.4"], ["A"])
            mock_sub.return_value = []
            mock_http.return_value = (True, True, 200, {"strict-transport-security": "max-age=31536000"})
            mock_ssl.return_value = MagicMock()
            mock_nmap.return_value = MagicMock()
            mock_cve.return_value = []
            mock_headers.return_value = []
            mock_tech.return_value = [
                TechInfo(name="", category="web-server"),
                TechInfo(name="nginx", category=""),
                TechInfo(name="", category=""),
            ]

            self.mock_session = mock_session
            self.mock_cve = mock_cve
            self.mock_save_findings = mock_save_findings
            yield

    def _call_task(self):
        from tasks.domain_scan import run_domain_scan

        return run_domain_scan(JOB_ID, DOMAIN)

    def test_empty_tech_name_skips_cve_lookup(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        self.mock_cve.assert_not_called()

    def test_empty_tech_category_skips_cve_lookup(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        self.mock_cve.assert_not_called()

    def test_scan_completes_with_empty_tech_stack(self):
        result = self._call_task()
        assert "summary" in result
