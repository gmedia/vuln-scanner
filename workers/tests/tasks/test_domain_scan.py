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
            patch("tasks.domain_scan.redis.ConnectionPool.from_url") as mock_pool,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_dns.return_value = (["93.184.216.34"], [])
            mock_sub.return_value = ["www.example.com", "mail.example.com"]
            mock_http.return_value = (True, True, 200, {"Server": "nginx/1.24.0"})
            mock_ssl.return_value = MagicMock(
                issues=[], cipher="TLS_AES_256_GCM_SHA384",
                subject="CN=example.com", issuer="CN=CA",
                not_after="2026-01-01", days_remaining=365,
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
            self.mock_session.return_value, JOB_ID, "completed",
            progress=100, result_summary=ANY, completed_at=ANY,
        )

    def test_health_last_task_completed_set(self):
        self._call_task()
        self.mock_redis.return_value.set.assert_called_once()
        call_args = self.mock_redis.return_value.set.call_args[0]
        assert "health:last_task_completed" in call_args

    def test_progress_published(self):
        self._call_task()
        progress_calls = [
            c for c in self.mock_progress.call_args_list if c[0][0] == JOB_ID
        ]
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
            patch("tasks.domain_scan.redis.ConnectionPool.from_url") as mock_pool,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_dns.side_effect = Exception("DNS resolution failed")
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_dns = mock_dns
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
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
            self.mock_session.return_value, JOB_ID, "failed",
        )

    def test_dns_failure_not_dead_letter_on_first_retry(self):
        self._RETRIES = 0
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_not_called()


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
            patch("tasks.domain_scan.resolve_dns", new_callable=AsyncMock) as mock_dns,
            patch("tasks.domain_scan.enumerate_subdomains", new_callable=AsyncMock) as mock_sub,
            patch("tasks.domain_scan.check_http", new_callable=AsyncMock) as mock_http,
            patch("tasks.domain_scan.check_security_headers") as mock_headers,
            patch("tasks.domain_scan.detect_tech_stack") as mock_tech,
            patch("tasks.domain_scan.run_nmap", new_callable=AsyncMock) as mock_nmap,
            patch("tasks.domain_scan.publish_progress") as mock_progress,
            patch("tasks.domain_scan._update_status") as mock_update_status,
            patch("tasks.domain_scan._save_findings") as mock_save_findings,
            patch("tasks.domain_scan.redis.ConnectionPool.from_url") as mock_pool,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_dns.return_value = (["93.184.216.34"], [])
            mock_sub.return_value = []
            mock_http.return_value = (True, True, 200, {"Server": "nginx/1.24.0"})
            mock_headers.return_value = []
            mock_tech.return_value = [
                TechInfo(name="nginx", category="web_server", version="1.24.0", confidence=100),
            ]
            mock_nmap.side_effect = Exception("nmap failed")
            mock_session.return_value = MagicMock()
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
            ANY, JOB_ID, "completed", progress=100,
            result_summary=ANY, completed_at=ANY,
        )

    @patch("tasks.domain_scan.lookup_service_cves", new_callable=AsyncMock)
    @patch("tasks.domain_scan.check_ssl", new_callable=AsyncMock)
    def test_cve_lookup_failure_does_not_crash(self, mock_ssl, mock_cve):
        mock_ssl.return_value = MagicMock(
            issues=[], cipher="TLS_AES_256_GCM_SHA384",
            subject="CN=example.com", issuer="CN=CA",
            not_after="2026-01-01", days_remaining=365,
        )
        mock_cve.side_effect = Exception("CVE lookup failed")
        result = self._call_task()
        self.mock_save_findings.assert_called_once()
        self.mock_update_status.assert_any_call(
            ANY, JOB_ID, "completed", progress=100,
            result_summary=ANY, completed_at=ANY,
        )
        assert result["job_id"] == JOB_ID

    @patch("tasks.domain_scan.check_ssl", new_callable=AsyncMock)
    def test_redis_health_failure_does_not_crash(self, mock_ssl):
        mock_ssl.return_value = MagicMock(
            issues=[], cipher="TLS_AES_256_GCM_SHA384",
            subject="CN=example.com", issuer="CN=CA",
            not_after="2026-01-01", days_remaining=365,
        )
        self.mock_redis.side_effect = Exception("Redis connection failed")
        result = self._call_task()
        self.mock_save_findings.assert_called_once()
        self.mock_update_status.assert_any_call(
            ANY, JOB_ID, "completed", progress=100,
            result_summary=ANY, completed_at=ANY,
        )
        assert result["job_id"] == JOB_ID

    @patch("tasks.domain_scan.check_ssl", new_callable=AsyncMock)
    def test_publish_progress_failure_does_not_crash(self, mock_ssl):
        mock_ssl.return_value = MagicMock(
            issues=[], cipher="TLS_AES_256_GCM_SHA384",
            subject="CN=example.com", issuer="CN=CA",
            not_after="2026-01-01", days_remaining=365,
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
            patch("tasks.domain_scan.redis.ConnectionPool.from_url") as mock_pool,
            patch("tasks.domain_scan.redis.Redis") as mock_redis,
        ):
            mock_dns.side_effect = Exception("DNS resolution failed")
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_dns = mock_dns
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
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

