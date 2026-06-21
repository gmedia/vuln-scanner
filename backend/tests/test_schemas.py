import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.scan import (
    DomainScanRequest,
    ErrorResponse,
    PaginatedResponse,
    ScanFindingResponse,
    ScanJobResponse,
    ScanRequest,
)


class TestScanRequest:
    def test_valid(self):
        req = ScanRequest(target="192.168.1.1", ports="22-80")
        assert req.target == "192.168.1.1"
        assert req.ports == "22-80"

    def test_invalid_empty(self):
        with pytest.raises(ValidationError):
            ScanRequest(target="")

    def test_ports_regex_valid(self):
        req = ScanRequest(target="10.0.0.1", ports="80,443,8080-8090")
        assert req.ports == "80,443,8080-8090"

    def test_ports_regex_invalid(self):
        with pytest.raises(ValidationError):
            ScanRequest(target="10.0.0.1", ports="abc")


class TestDomainScanRequest:
    def test_valid(self):
        req = DomainScanRequest(domain="example.com")
        assert req.domain == "example.com"

    def test_too_short(self):
        with pytest.raises(ValidationError):
            DomainScanRequest(domain="ab")


class TestPaginatedResponse:
    def test_construct(self):
        item = ScanJobResponse(
            id=uuid.uuid4(),
            scan_type="ip",
            target="10.0.0.1",
            status="completed",
            progress=100,
            result_summary=None,
            celery_task_id=None,
            started_at=None,
            completed_at=None,
            created_at=datetime.now(UTC),
        )
        resp = PaginatedResponse(
            items=[item],
            total=1,
            page=1,
            limit=20,
            pages=1,
        )
        assert len(resp.items) == 1
        assert resp.total == 1
        assert resp.page == 1
        assert resp.pages == 1


class TestErrorResponse:
    def test_construct(self):
        err = ErrorResponse(detail="Something went wrong")
        assert err.detail == "Something went wrong"


class TestScanFindingResponseFromOrm:
    def test_from_orm(self):
        now = datetime.now(UTC)
        job_id = uuid.uuid4()
        finding_id = uuid.uuid4()
        finding = ScanFindingResponse(
            id=finding_id,
            job_id=job_id,
            severity="high",
            category="Network",
            title="Open port 22",
            description="SSH is open",
            cve_id="CVE-2024-1234",
            cvss_score=7.5,
            remediation="Disable root login",
            raw_data=None,
            found_at=now,
        )
        assert finding.severity == "high"
        assert finding.cvss_score == 7.5
        assert finding.cve_id == "CVE-2024-1234"
