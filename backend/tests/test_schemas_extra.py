import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.scan import (
    ScanFindingResponse,
    ScanHistoryParams,
    ScanRequest,
)


class TestScanHistoryParams:
    def test_default_values(self):
        params = ScanHistoryParams()
        assert params.page == 1
        assert params.limit == 20
        assert params.scan_type is None

    def test_custom_values(self):
        params = ScanHistoryParams(page=3, limit=50, scan_type="ip")
        assert params.page == 3
        assert params.limit == 50
        assert params.scan_type == "ip"

    def test_invalid_page_zero(self):
        with pytest.raises(ValidationError):
            ScanHistoryParams(page=0)

    def test_invalid_limit_zero(self):
        with pytest.raises(ValidationError):
            ScanHistoryParams(limit=0)

    def test_invalid_limit_exceeds_max(self):
        with pytest.raises(ValidationError):
            ScanHistoryParams(limit=101)


class TestScanRequest:
    def test_max_length_target(self):
        target = "a" * 500
        req = ScanRequest(target=target, ports="80")
        assert len(req.target) == 500
        assert req.ports == "80"


class TestScanFindingResponseAllOptionalNone:
    def test_all_optional_fields_none(self):
        now = datetime.now(UTC)
        finding_id = uuid.uuid4()
        job_id = uuid.uuid4()
        finding = ScanFindingResponse(
            id=finding_id,
            job_id=job_id,
            severity="low",
            category=None,
            title="Test finding",
            description=None,
            cve_id=None,
            cvss_score=None,
            remediation=None,
            raw_data=None,
            found_at=now,
        )
        assert finding.id == finding_id
        assert finding.job_id == job_id
        assert finding.severity == "low"
        assert finding.category is None
        assert finding.title == "Test finding"
        assert finding.description is None
        assert finding.cve_id is None
        assert finding.cvss_score is None
        assert finding.remediation is None
        assert finding.raw_data is None
        assert finding.found_at == now
