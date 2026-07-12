import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.scan import (
    DomainScanRequest,
    ScanFindingResponse,
    ScanHistoryParams,
    ScanRequest,
)


class TestDomainScanRequest:
    def test_valid_domain(self):
        req = DomainScanRequest(domain="example.com")
        assert req.domain == "example.com"

    def test_domain_without_dot_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            DomainScanRequest(domain="nodot")
        assert "fully-qualified domain name" in str(exc_info.value)

    def test_domain_too_long_raises_field_level(self):
        long_domain = "a" * 254
        with pytest.raises(ValidationError):
            DomainScanRequest(domain=long_domain)

    def test_domain_empty_label_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            DomainScanRequest(domain="example..com")
        assert "fully-qualified domain name" in str(exc_info.value)

    def test_domain_label_too_long_raises(self):
        long_label = "a" * 64 + ".com"
        with pytest.raises(ValidationError) as exc_info:
            DomainScanRequest(domain=long_label)
        assert "fully-qualified domain name" in str(exc_info.value)

    def test_domain_label_starts_with_hyphen_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            DomainScanRequest(domain="-example.com")
        assert "fully-qualified domain name" in str(exc_info.value)

    def test_domain_label_ends_with_hyphen_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            DomainScanRequest(domain="example-.com")
        assert "fully-qualified domain name" in str(exc_info.value)


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
        # Build a valid domain (multiple labels) that hits the max_length boundary
        labels = []
        remaining = 500 - len(".example.com")
        while remaining > 0:
            label_len = min(60, remaining - 1 if remaining > 60 else remaining)
            if label_len < 1:
                break
            labels.append("a" * label_len)
            remaining -= label_len + 1
        target = ".".join(labels) + ".example.com"
        req = ScanRequest(target=target, ports="80")
        assert len(req.target) == 499
        assert req.ports == "80"

    def test_invalid_target_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            ScanRequest(target="1.2.3", ports="80")
        assert "valid IPv4" in str(exc_info.value) or "fully-qualified domain" in str(exc_info.value)


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
