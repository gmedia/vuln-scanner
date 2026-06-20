import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

from unittest.mock import ANY, MagicMock, PropertyMock, patch

import pytest
from celery.exceptions import Retry

JOB_ID = "test-job-mobile-9012"
FILE_PATH = "/tmp/test-app.apk"
PLATFORM = "android"


class TestMobileAndroidSuccessfulFlow:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        from utils.mobile_utils import AndroidManifestInfo

        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.analyze_ipa") as mock_ipa,
            patch("tasks.mobile_scan._scan_secrets") as mock_secrets,
            patch("tasks.mobile_scan.lookup_service_cves") as mock_cve,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan._save_findings") as mock_save_findings,
            patch("tasks.mobile_scan.redis.Redis.from_url") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
            patch("tasks.mobile_scan.os.remove") as mock_remove,
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
            self.mock_session.return_value, JOB_ID, "completed",
            progress=100, result_summary=ANY, completed_at=ANY,
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


class TestMobileScanFileNotFound:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
        ):
            mock_exists.return_value = False
            mock_session.return_value = MagicMock()

            self.mock_session = mock_session
            self.mock_progress = mock_progress
            self.mock_update_status = mock_update_status
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
            self.mock_session.return_value, JOB_ID, "failed",
        )

    def test_file_not_found_publishes_failure(self):
        self._call_task()
        self.mock_progress.assert_called_with(
            JOB_ID, "failed", 100, ANY,
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
            patch("tasks.mobile_scan.redis.Redis.from_url") as mock_redis,
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
            self.mock_session.return_value, JOB_ID, "failed",
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


class TestMobileScanIos:
    @pytest.fixture(autouse=True)
    def _setup_patches(self):
        with (
            patch("tasks.mobile_scan.get_sync_session") as mock_session,
            patch("tasks.mobile_scan.analyze_apk") as mock_apk,
            patch("tasks.mobile_scan.analyze_ipa") as mock_ipa,
            patch("tasks.mobile_scan.publish_progress") as mock_progress,
            patch("tasks.mobile_scan._update_status") as mock_update_status,
            patch("tasks.mobile_scan._save_findings") as mock_save_findings,
            patch("tasks.mobile_scan.redis.Redis.from_url") as mock_redis,
            patch("tasks.mobile_scan.os.path.exists") as mock_exists,
            patch("tasks.mobile_scan.os.path.getsize") as mock_size,
            patch("tasks.mobile_scan.os.remove") as mock_remove,
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
            ANY, JOB_ID, "completed", progress=100,
            result_summary=ANY, completed_at=ANY,
        )
        self.mock_save_findings.assert_called_once()
