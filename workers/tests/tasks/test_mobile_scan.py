import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")
sys.path.insert(0, "/home/ubuntu/vuln-scanner/backend")

from unittest.mock import ANY, MagicMock, PropertyMock, mock_open, patch

import pytest
from celery.exceptions import Retry

JOB_ID = "test-job-mobile-9012"
FILE_PATH = "/tmp/test-app.apk"
PLATFORM = "android"


class TestPublishProgressRedisFailure:
    """Test publish_progress catches Redis exceptions (lines 25-32)."""

    def test_publish_progress_catches_redis_exception(self):
        from tasks.mobile_scan import publish_progress

        with patch("tasks.mobile_scan.redis.Redis") as mock_redis:
            mock_redis.return_value.publish.side_effect = Exception("Redis connection refused")
            # Should not raise
            publish_progress(JOB_ID, "test_step", 50, "test message")
            mock_redis.return_value.publish.assert_called_once()


class TestMobileAndroidSuccessfulFlow:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        from utils.mobile_utils import AndroidManifestInfo

        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.analyze_ipa") as mock_ipa,
            patch("utils.mobile_utils._scan_secrets") as mock_secrets,
            patch("tasks.mobile_scan.lookup_service_cves") as mock_cve,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan._save_findings") as mock_save_findings,
            patch("tasks.mobile_scan.redis.Redis") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
            patch("tasks.mobile_scan.os.remove") as mock_remove,
            patch("builtins.open", mock_open(read_data=b"test data")),
        ):
            manifest_info = AndroidManifestInfo(
                package_name="com.example.app",
                version_name="2.1.0",
                version_code="42",
                min_sdk="29",
                target_sdk="34",
                permissions=["CAMERA", "INTERNET", "ACCESS_FINE_LOCATION"],
                exported_components=[".MainActivity", ".MyReceiver"],
                debuggable=True,
                allow_backup=False,
                uses_cleartext_traffic=True,
            )
            sample_findings = [
                {
                    "severity": "medium",
                    "category": "manifest",
                    "title": "Debuggable app",
                    "description": "App is debuggable",
                },
            ]
            mock_apk.return_value = (manifest_info, sample_findings, ["libssl.so", "libcurl.so"])
            mock_ipa.return_value = (MagicMock(), [], [])
            mock_secrets.return_value = [
                {
                    "severity": "high",
                    "category": "secret",
                    "title": "Hardcoded API key",
                    "description": "API key found",
                },
            ]
            mock_cve.return_value = []
            mock_session.return_value = MagicMock()
            mock_exists.return_value = True
            mock_size.return_value = 5 * 1024 * 1024
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_apk = mock_apk
            self.mock_ipa = mock_ipa
            self.mock_secrets = mock_secrets
            self.mock_cve = mock_cve
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_save_findings = mock_save_findings
            self.mock_redis = mock_redis
            self.mock_remove = mock_remove
            yield

    def _call_task(self, file_path=FILE_PATH, platform=PLATFORM):
        from tasks.mobile_scan import run_mobile_scan

        return run_mobile_scan(JOB_ID, file_path, platform)

    def test_successful_android_scan_completes(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result
        assert result["summary"]["total_findings"] > 0

    def test_android_scan_calls_apk_analysis(self):
        self._call_task()
        self.mock_apk.assert_called_once_with(FILE_PATH)
        self.mock_ipa.assert_not_called()

    def test_android_scan_calls_secret_scan(self):
        self._call_task()
        self.mock_secrets.assert_called_once()

    def test_android_scan_saves_findings(self):
        self._call_task()
        self.mock_save_findings.assert_called_once()

    def test_android_scan_status_completed(self):
        self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )

    def test_android_scan_removes_file(self):
        self._call_task()
        self.mock_remove.assert_called_once_with(FILE_PATH)

    def test_android_scan_health_last_task(self):
        self._call_task()
        self.mock_redis.return_value.set.assert_called_once()
        call_args = self.mock_redis.return_value.set.call_args[0]
        assert "health:last_task_completed" in call_args

    def test_android_scan_calls_cve_lookup(self):
        self._call_task()
        assert self.mock_cve.call_count > 0

    def test_secret_scan_failure_does_not_crash(self):
        self.mock_secrets.side_effect = Exception("secret scan failed")
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )
        self.mock_save_findings.assert_called_once()

    def test_cve_lookup_failure_does_not_crash(self):
        self.mock_cve.side_effect = Exception("CVE failed")
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )
        self.mock_save_findings.assert_called_once()

    def test_os_remove_failure_does_not_crash(self):
        self.mock_remove.side_effect = Exception("remove failed")
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )

    def test_redis_health_failure_does_not_crash(self):
        self.mock_redis.side_effect = Exception("redis health failed")
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )

    def test_duplicate_library_skipped_in_cve_lookup(self):
        from utils.mobile_utils import AndroidManifestInfo

        manifest_info = AndroidManifestInfo(
            package_name="com.example.app",
            version_name="1.0",
            version_code="1",
            min_sdk="26",
            target_sdk="33",
            permissions=[],
            exported_components=[],
            debuggable=False,
            allow_backup=True,
            uses_cleartext_traffic=False,
        )
        self.mock_apk.return_value = (manifest_info, [], ["libssl.so", "libssl.so", "libcurl.so"])
        self._call_task()
        # Only 2 unique libs after dedup (libssl.so seen once, libcurl.so once)
        assert self.mock_cve.call_count == 2


class TestMobileScanFileNotFound:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan._refund_credits") as mock_refund_credits,
        ):
            mock_exists.return_value = False
            mock_session.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_refund_credits = mock_refund_credits
            yield

    def _call_task(self, file_path="/nonexistent/file.apk", platform="android"):
        from tasks.mobile_scan import run_mobile_scan

        return run_mobile_scan(JOB_ID, file_path, platform)

    def test_file_not_found_returns_early(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert result["error"] == "file not found"

    def test_file_not_found_sets_status_failed(self):
        self._call_task()
        self.mock_update_status.assert_called_with(
            self.mock_session.return_value,
            JOB_ID,
            "failed",
        )

    def test_file_not_found_publishes_failure(self):
        self._call_task()
        self.mock_progress.assert_called_with(
            JOB_ID,
            "failed",
            100,
            ANY,
        )


class TestMobileScanFailureAndRetry:
    _RETRIES = 0

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan.redis.Redis") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
        ):
            mock_exists.return_value = True
            mock_size.return_value = 5 * 1024 * 1024
            mock_apk.side_effect = Exception("APK parsing failed")
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_apk = mock_apk
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.mobile_scan import run_mobile_scan

        task_cls = type(run_mobile_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.mobile_scan.dead_letter_handler") as mock_dead_letter,
        ):
            mock_req.return_value = MagicMock(retries=self._RETRIES)
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_mobile_scan(JOB_ID, FILE_PATH, PLATFORM)

    def test_apk_failure_triggers_retry(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once()

    def test_apk_failure_sets_status_failed(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "failed",
        )

    def test_apk_failure_not_dead_letter_first_retry(self):
        self._RETRIES = 0
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_not_called()


class TestMobileScanFinalRetry(TestMobileScanFailureAndRetry):
    _RETRIES = 3

    def test_apk_failure_dead_letter_final_retry(self):
        self._RETRIES = 3
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_called_once()
        args, kwargs = self.mock_dead_letter.delay.call_args
        assert kwargs["task_name"] == "mobile_scan.run"
        assert kwargs["args"] == [JOB_ID, FILE_PATH, PLATFORM]


class TestMobileScanNestedStatusUpdateFailure:
    """Verify the catch-all handler (lines 153-168) does not crash when
    _update_status itself fails inside the except block."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan.redis.Redis") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
        ):
            mock_exists.return_value = True
            mock_size.return_value = 5 * 1024 * 1024
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()
            # First call: "running" (line 48) — succeeds
            # Second call: "failed" inside except (line 155) — raises
            mock_update_status.side_effect = [None, Exception("nested status update failed")]
            mock_apk.side_effect = Exception("APK parsing failed")

            self.mock_session = mock_session
            self.mock_apk = mock_apk
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.mobile_scan import run_mobile_scan

        task_cls = type(run_mobile_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.mobile_scan.dead_letter_handler") as mock_dead_letter,
        ):
            mock_req.return_value = MagicMock(retries=0)
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_mobile_scan(JOB_ID, FILE_PATH, PLATFORM)

    def test_nested_status_update_failure_triggers_retry(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once()

    def test_nested_status_update_failure_publishes_progress(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_progress.assert_called_with(
            JOB_ID,
            "failed",
            100,
            ANY,
        )


class TestMobileScanIos:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.analyze_ipa") as mock_ipa,
            patch("tasks.mobile_scan.publish_progress"),
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan._save_findings") as mock_save_findings,
            patch("tasks.mobile_scan.redis.Redis") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
            patch("tasks.mobile_scan.os.remove") as mock_remove,
            patch("builtins.open", mock_open(read_data=b"test data")),
        ):
            mock_ipa.return_value = (MagicMock(), [], [])
            mock_apk.return_value = (MagicMock(), [], [])
            mock_exists.return_value = True
            mock_size.return_value = 3 * 1024 * 1024
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_ipa = mock_ipa
            self.mock_apk = mock_apk
            self.mock_update_status = mock_update_status
            self.mock_save_findings = mock_save_findings
            self.mock_remove = mock_remove
            yield

    def _call_task(self):
        from tasks.mobile_scan import run_mobile_scan

        return run_mobile_scan(JOB_ID, "/tmp/test.ipa", "ios")

    def test_ios_scan_calls_ipa_analyzer(self):
        self._call_task()
        self.mock_ipa.assert_called_once_with("/tmp/test.ipa")
        self.mock_apk.assert_not_called()

    def test_ios_scan_completes_successfully(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        self.mock_update_status.assert_any_call(
            ANY,
            JOB_ID,
            "completed",
            progress=100,
            result_summary=ANY,
            completed_at=ANY,
        )
        self.mock_save_findings.assert_called_once()


class TestMobileScanIosFailureAndRetry:
    """iOS IPA analysis failure: exception in analyze_ipa is caught internally,
    but 'libraries' variable is never assigned, so the CVE lookup loop at line 107
    raises NameError, which falls through to the outer catch-all → retry."""

    _RETRIES = 0

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.analyze_ipa") as mock_ipa,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan.redis.Redis") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
            patch("builtins.open", mock_open(read_data=b"test data")),
        ):
            mock_exists.return_value = True
            mock_size.return_value = 5 * 1024 * 1024
            mock_ipa.side_effect = Exception("IPA parse failed")
            mock_apk.return_value = (MagicMock(), [], [])
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_ipa = mock_ipa
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.mobile_scan import run_mobile_scan

        task_cls = type(run_mobile_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.mobile_scan.dead_letter_handler") as mock_dead_letter,
        ):
            mock_req.return_value = MagicMock(retries=self._RETRIES)
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_mobile_scan(JOB_ID, "/tmp/test.ipa", "ios")

    def test_ios_analysis_failure_triggers_retry(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once()

    def test_ios_analysis_failure_sets_status_failed(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_update_status.assert_any_call(
            self.mock_session.return_value,
            JOB_ID,
            "failed",
        )

    def test_ios_analysis_failure_not_dead_letter_first_retry(self):
        self._RETRIES = 0
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_not_called()


class TestMobileScanIosFinalRetry(TestMobileScanIosFailureAndRetry):
    _RETRIES = 3

    def test_ios_failure_dead_letter_final_retry(self):
        self._RETRIES = 3
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_called_once()
        _, kwargs = self.mock_dead_letter.delay.call_args
        assert kwargs["task_name"] == "mobile_scan.run"
        assert kwargs["args"] == [JOB_ID, "/tmp/test.ipa", "ios"]


class TestMobileScanIosCveLookup:
    """iOS scan where analyze_ipa returns libraries; verify CVE lookup is called
    and findings include CVE data."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        from utils.mobile_utils import IpaInfo

        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.analyze_ipa") as mock_ipa,
            patch("utils.mobile_utils._scan_secrets") as mock_secrets,
            patch("tasks.mobile_scan.lookup_service_cves") as mock_cve,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan._save_findings") as mock_save_findings,
            patch("tasks.mobile_scan.redis.Redis") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
            patch("tasks.mobile_scan.os.remove") as mock_remove,
            patch("builtins.open", mock_open(read_data=b"test data")),
        ):
            ipa_info = IpaInfo(
                bundle_id="com.example.iosapp",
                version="1.0.0",
                build="100",
                min_ios="15.0",
                platform="ios",
                ats_exceptions=["api.example.com"],
                custom_url_schemes=["myapp"],
            )
            mock_ipa.return_value = (ipa_info, [], ["libssl.so", "libcurl.so"])
            mock_apk.return_value = (MagicMock(), [], [])
            mock_secrets.return_value = []

            sample_vulns = [
                {
                    "id": "GHSA-xxxx-xxxx-xxxx",
                    "aliases": ["CVE-2024-9999"],
                    "summary": "Critical RCE in libssl",
                    "details": "Remote code execution via crafted TLS handshake",
                    "severity": [{"type": "CVSS_V3", "score": 9.8}],
                    "database_specific": {},
                    "references": [],
                },
            ]
            mock_cve.return_value = sample_vulns

            mock_session.return_value = MagicMock()
            mock_exists.return_value = True
            mock_size.return_value = 5 * 1024 * 1024
            mock_redis.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_ipa = mock_ipa
            self.mock_cve = mock_cve
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_save_findings = mock_save_findings
            self.mock_remove = mock_remove
            yield

    def _call_task(self):
        from tasks.mobile_scan import run_mobile_scan

        return run_mobile_scan(JOB_ID, "/tmp/test.ipa", "ios")

    def test_ios_cve_lookup_called_for_libraries(self):
        self._call_task()
        assert self.mock_cve.call_count >= 1

    def test_ios_cve_findings_added_to_results(self):
        result = self._call_task()
        assert result["job_id"] == JOB_ID
        assert "summary" in result
        assert result["summary"]["total_findings"] > 0
        self.mock_save_findings.assert_called_once()

    def test_ios_cve_findings_have_cve_ids(self):
        self._call_task()
        call_args = self.mock_save_findings.call_args[0]
        saved_findings = call_args[2]
        cve_ids = [f.get("cve_id") for f in saved_findings if f.get("cve_id")]
        assert len(cve_ids) > 0
        assert "CVE-2024-9999" in cve_ids


class TestMobileScanFileSizeProgress:
    """Verify that the progress message at line 65 includes the file size."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.analyze_ipa") as mock_ipa,
            patch("utils.mobile_utils._scan_secrets") as mock_secrets,
            patch("tasks.mobile_scan.lookup_service_cves") as mock_cve,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as _mock_update_status,
            patch("tasks.mobile_scan._save_findings") as _mock_save_findings,
            patch("tasks.mobile_scan.redis.Redis") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
            patch("builtins.open", mock_open(read_data=b"test data")),
        ):
            from utils.mobile_utils import AndroidManifestInfo

            manifest_info = AndroidManifestInfo(
                package_name="com.example.app",
                version_name="1.0",
                version_code="1",
                min_sdk="26",
                target_sdk="33",
                permissions=[],
                exported_components=[],
                debuggable=False,
                allow_backup=True,
                uses_cleartext_traffic=False,
            )
            mock_apk.return_value = (manifest_info, [], [])
            mock_ipa.return_value = (MagicMock(), [], [])
            mock_secrets.return_value = []
            mock_cve.return_value = []

            mock_session.return_value = MagicMock()
            mock_exists.return_value = True
            # 15.5 MB file
            mock_size.return_value = int(15.5 * 1024 * 1024)
            mock_redis.return_value = MagicMock()

            self.mock_progress = mock_progress
            self.mock_size = mock_size
            yield

    def _call_task(self):
        from tasks.mobile_scan import run_mobile_scan

        return run_mobile_scan(JOB_ID, FILE_PATH, PLATFORM)

    def test_progress_message_includes_file_size(self):
        self._call_task()
        # The first progress call should be the "Analyzing file" message
        progress_calls = self.mock_progress.call_args_list
        extracting_calls = [c for c in progress_calls if c[0][1] == "extracting"]
        assert len(extracting_calls) >= 1
        msg = extracting_calls[0][0][3]
        assert "15.5MB" in msg
        assert "Analyzing file" in msg

    def test_file_size_matches_os_getsize(self):
        self._call_task()
        expected_mb = self.mock_size.return_value / (1024 * 1024)
        progress_calls = self.mock_progress.call_args_list
        extracting_calls = [c for c in progress_calls if c[0][1] == "extracting"]
        assert len(extracting_calls) >= 1
        msg = extracting_calls[0][0][3]
        assert f"{expected_mb:.1f}MB" in msg


class TestMobileScanOuterCatchAll:
    """Test the outer catch-all handler at lines 158-174: when _update_status
    succeeds on first call (line 52, 'running') but fails on the second call
    (line 160, 'failed' inside the outer except), the handler logs a warning
    and still triggers a retry."""

    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan._refund_credits") as mock_refund_credits,
            patch("tasks.mobile_scan.redis.Redis") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
            patch("builtins.open", mock_open(read_data=b"test data")),
        ):
            mock_exists.return_value = True
            mock_size.return_value = 5 * 1024 * 1024
            mock_session.return_value = MagicMock()
            mock_redis.return_value = MagicMock()

            # First _update_status call (line 52, "running") succeeds
            # Second _update_status call (line 160, "failed" in outer except) raises
            mock_update_status.side_effect = [None, Exception("status update failed in outer catch")]

            # analyze_apk raises to trigger the outer except block
            mock_apk.side_effect = Exception("APK parsing failed")

            self.mock_session = mock_session
            self.mock_apk = mock_apk
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
            self.mock_refund_credits = mock_refund_credits
            self.mock_redis = mock_redis
            yield

    def _call_task(self):
        from tasks.mobile_scan import run_mobile_scan

        task_cls = type(run_mobile_scan._get_current_object())
        with (
            patch.object(task_cls, "request", new_callable=PropertyMock) as mock_req,
            patch.object(task_cls, "retry", side_effect=Retry()) as mock_retry,
            patch.object(task_cls, "max_retries", 3),
            patch("tasks.mobile_scan.dead_letter_handler") as mock_dead_letter,
        ):
            mock_req.return_value = MagicMock(retries=0)
            self.mock_retry = mock_retry
            self.mock_dead_letter = mock_dead_letter
            run_mobile_scan(JOB_ID, FILE_PATH, PLATFORM)

    def test_outer_catch_all_triggers_retry(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_retry.assert_called_once()

    def test_outer_catch_all_publishes_failed_progress(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_progress.assert_called_with(
            JOB_ID,
            "failed",
            100,
            ANY,
        )

    def test_outer_catch_all_not_dead_letter_first_retry(self):
        with pytest.raises(Retry):
            self._call_task()
        self.mock_dead_letter.delay.assert_not_called()

    def test_outer_catch_all_commits_and_closes_session(self):
        self.mock_update_status.side_effect = [None, None]
        with pytest.raises(Retry):
            self._call_task()
        self.mock_session.return_value.commit.assert_called()
        self.mock_session.return_value.close.assert_called()

    def test_outer_catch_all_calls_refund_credits(self):
        self.mock_update_status.side_effect = [None, None]
        with pytest.raises(Retry):
            self._call_task()
        self.mock_refund_credits.assert_called_once_with(
            self.mock_session.return_value,
            JOB_ID,
            PLATFORM,
        )


class TestMobileScanHelpers:
    """Tests for module-level helper functions: _run_async, _update_status, _save_findings, _refund_credits."""

    def test_run_async_with_existing_event_loop(self):
        import asyncio

        from tasks.mobile_scan import _run_async

        async def dummy():
            return "ok"

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = _run_async(dummy())
            assert result == "ok"
        finally:
            loop.close()

    def test_run_async_creates_new_loop_when_none_exists(self):
        from tasks.mobile_scan import _run_async

        async def dummy():
            return "new_loop_result"

        with (
            patch("asyncio.get_event_loop", side_effect=RuntimeError("no event loop")),
            patch("asyncio.new_event_loop") as mock_new_loop,
            patch("asyncio.set_event_loop") as mock_set_loop,
        ):
            mock_loop = MagicMock()
            mock_loop.run_until_complete.return_value = "new_loop_result"
            mock_new_loop.return_value = mock_loop
            result = _run_async(dummy())
            assert result == "new_loop_result"
            mock_new_loop.assert_called_once()
            mock_set_loop.assert_called_once_with(mock_loop)
            mock_loop.run_until_complete.assert_called_once()

    def test_update_status_executes_sql(self):
        from tasks.mobile_scan import _update_status

        with patch("tasks.mobile_scan.update") as mock_update:
            mock_stmt = MagicMock()
            mock_update.return_value.where.return_value.values.return_value = mock_stmt
            mock_scan_job = MagicMock()
            with patch.dict("sys.modules", {"app.models.scan_job": MagicMock(ScanJob=mock_scan_job)}):
                mock_session = MagicMock()
                _update_status(mock_session, JOB_ID, "running", progress=50)
                mock_session.execute.assert_called_once_with(mock_stmt)

    def test_save_findings_adds_to_session(self):
        from tasks.mobile_scan import _save_findings

        mock_finding_cls = MagicMock()
        mock_finding_cls.side_effect = lambda **kwargs: MagicMock(**kwargs)
        with patch.dict("sys.modules", {"app.models.scan_finding": MagicMock(ScanFinding=mock_finding_cls)}):
            mock_session = MagicMock()
            findings = [
                {
                    "severity": "high",
                    "category": "cve",
                    "title": "Test CVE",
                    "description": "Test description",
                    "cve_id": "CVE-2024-0001",
                    "cvss_score": 9.8,
                    "remediation": "Update library",
                    "raw_data": {"key": "value"},
                },
            ]
            _save_findings(mock_session, JOB_ID, findings)
            mock_session.add.assert_called_once()
            finding = mock_session.add.call_args[0][0]
            assert finding.job_id == JOB_ID
            assert finding.severity == "high"
            assert finding.cve_id == "CVE-2024-0001"

    def test_save_findings_handles_missing_optional_fields(self):
        from tasks.mobile_scan import _save_findings

        mock_finding_cls = MagicMock()
        mock_finding_cls.side_effect = lambda **kwargs: MagicMock(**kwargs)
        with patch.dict("sys.modules", {"app.models.scan_finding": MagicMock(ScanFinding=mock_finding_cls)}):
            mock_session = MagicMock()
            findings = [{"severity": "info", "category": "", "title": "Minimal finding"}]
            _save_findings(mock_session, JOB_ID, findings)
            mock_session.add.assert_called_once()
            finding = mock_session.add.call_args[0][0]
            assert finding.cve_id is None
            assert finding.cvss_score is None

    def test_refund_credits_increments_user_credits(self):
        import uuid as uuid_mod

        from tasks.mobile_scan import _refund_credits

        user_id = uuid_mod.uuid4()
        job_id = uuid_mod.uuid4()
        mock_job = MagicMock()
        mock_job.user_id = user_id
        mock_job.credit_cost = 10
        mock_job.id = job_id
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.credits = 5

        mock_scan_job = MagicMock()
        mock_user_cls = MagicMock()
        mock_credit_log = MagicMock()
        mock_credit_log.return_value = MagicMock()
        with patch.dict(
            "sys.modules",
            {
                "app.models.scan_job": MagicMock(ScanJob=mock_scan_job),
                "app.models.user": MagicMock(User=mock_user_cls),
                "app.models.credit_log": MagicMock(CreditLog=mock_credit_log),
            },
        ):
            mock_session = MagicMock()

            def query_side_effect(model):
                query_mock = MagicMock()
                if "ScanJob" in str(model):
                    query_mock.where.return_value.one_or_none.return_value = mock_job
                elif "User" in str(model):
                    query_mock.where.return_value.one_or_none.return_value = mock_user
                return query_mock

            mock_session.query.side_effect = query_side_effect
            _refund_credits(mock_session, str(job_id), "android")
            assert mock_user.credits == 15
            assert mock_session.add.call_count >= 1

    def test_refund_credits_skips_when_job_not_found(self):
        from tasks.mobile_scan import _refund_credits

        mock_scan_job = MagicMock()
        mock_user_cls = MagicMock()
        mock_credit_log = MagicMock()
        with patch.dict(
            "sys.modules",
            {
                "app.models.scan_job": MagicMock(ScanJob=mock_scan_job),
                "app.models.user": MagicMock(User=mock_user_cls),
                "app.models.credit_log": MagicMock(CreditLog=mock_credit_log),
            },
        ):
            mock_session = MagicMock()
            mock_session.query.return_value.where.return_value.one_or_none.return_value = None
            _refund_credits(mock_session, JOB_ID, "android")
            mock_session.add.assert_not_called()

    def test_refund_credits_skips_when_no_user_id(self):
        from tasks.mobile_scan import _refund_credits

        mock_scan_job = MagicMock()
        mock_user_cls = MagicMock()
        mock_credit_log = MagicMock()
        with patch.dict(
            "sys.modules",
            {
                "app.models.scan_job": MagicMock(ScanJob=mock_scan_job),
                "app.models.user": MagicMock(User=mock_user_cls),
                "app.models.credit_log": MagicMock(CreditLog=mock_credit_log),
            },
        ):
            mock_session = MagicMock()
            mock_job = MagicMock()
            mock_job.user_id = None
            mock_job.credit_cost = 10
            mock_session.query.return_value.where.return_value.one_or_none.return_value = mock_job
            _refund_credits(mock_session, JOB_ID, "android")
            mock_session.add.assert_not_called()

    def test_refund_credits_skips_when_user_not_found(self):
        from tasks.mobile_scan import _refund_credits

        mock_scan_job = MagicMock()
        mock_user_cls = MagicMock()
        mock_credit_log = MagicMock()
        with patch.dict(
            "sys.modules",
            {
                "app.models.scan_job": MagicMock(ScanJob=mock_scan_job),
                "app.models.user": MagicMock(User=mock_user_cls),
                "app.models.credit_log": MagicMock(CreditLog=mock_credit_log),
            },
        ):
            mock_session = MagicMock()
            mock_job = MagicMock()
            mock_job.user_id = "some-user-id"
            mock_job.credit_cost = 10

            def query_side_effect(model):
                query_mock = MagicMock()
                if "ScanJob" in str(model):
                    query_mock.where.return_value.one_or_none.return_value = mock_job
                else:
                    query_mock.where.return_value.one_or_none.return_value = None
                return query_mock

            mock_session.query.side_effect = query_side_effect
            _refund_credits(mock_session, JOB_ID, "android")
            mock_session.add.assert_not_called()
