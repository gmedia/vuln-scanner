from unittest.mock import MagicMock

import pytest

from app.services.scanner import ScannerService


class TestDispatchTask:
    def setup_service(self):
        db_mock = MagicMock()
        return ScannerService(db_mock)

    def test_dispatch_ip(self, mock_celery):
        svc = self.setup_service()
        result = svc._dispatch_task(
            job_id="job-1",
            scan_type="ip",
            target="10.0.0.1",
            ports="22-80",
            platform=None,
        )

        mock_celery.assert_called_once_with(
            "ip_scan.run",
            args=["job-1", "10.0.0.1", "22-80"],
            queue="ip_scan",
        )
        assert result.id == "mock-task-id-456"

    def test_dispatch_domain(self, mock_celery):
        svc = self.setup_service()
        result = svc._dispatch_task(
            job_id="job-2",
            scan_type="domain",
            target="example.com",
            ports=None,
            platform=None,
        )

        mock_celery.assert_called_once_with(
            "domain_scan.run",
            args=["job-2", "example.com"],
            queue="domain_scan",
        )
        assert result.id == "mock-task-id-456"

    def test_dispatch_apk(self, mock_celery):
        svc = self.setup_service()
        result = svc._dispatch_task(
            job_id="job-3",
            scan_type="apk",
            target="app.apk",
            ports=None,
            platform="android",
            file_path="/tmp/scans/test.apk",
        )

        mock_celery.assert_called_once_with(
            "mobile_scan.run",
            args=["job-3", "/tmp/scans/test.apk", "android"],
            queue="mobile_scan",
        )
        assert result.id == "mock-task-id-456"

    def test_dispatch_ipa(self, mock_celery):
        svc = self.setup_service()
        result = svc._dispatch_task(
            job_id="job-4",
            scan_type="ipa",
            target="app.ipa",
            ports=None,
            platform="ios",
            file_path="/tmp/scans/test.ipa",
        )

        mock_celery.assert_called_once_with(
            "mobile_scan.run",
            args=["job-4", "/tmp/scans/test.ipa", "ios"],
            queue="mobile_scan",
        )
        assert result.id == "mock-task-id-456"

    def test_dispatch_unknown_type(self, mock_celery):
        svc = self.setup_service()
        with pytest.raises(ValueError, match=r"Unknown scan type: unknown_type"):
            svc._dispatch_task(
                job_id="job-5",
                scan_type="unknown_type",
                target="x",
                ports=None,
                platform=None,
            )
        mock_celery.assert_not_called()
