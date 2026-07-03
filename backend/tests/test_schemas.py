import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.auth import (
    ChangePasswordRequest,
    ResetPasswordRequest,
)
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

    @pytest.mark.parametrize(
        "target",
        [
            "invalid",
            "http://example.com",
            "not-a-valid-target",
        ],
    )
    def test_validate_target_rejects_invalid_input(self, target):
        with pytest.raises(ValidationError) as exc_info:
            ScanRequest(target=target)
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert "target must be a valid IPv4 address or fully-qualified domain name" in errors[0]["msg"]


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
            user_id=uuid.uuid4(),
            credit_cost=0,
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


# ---------------------------------------------------------------------------
# ResetPasswordRequest — password strength validator
# ---------------------------------------------------------------------------


class TestResetPasswordRequest:
    def test_valid(self):
        req = ResetPasswordRequest(
            token="abc123",
            new_password="Valid1Pass",
            confirm_password="Valid1Pass",
        )
        assert req.new_password == "Valid1Pass"
        assert req.token == "abc123"

    @pytest.mark.parametrize(
        "password,expected_msg",
        [
            ("nouppercase1", "Password must contain at least one uppercase letter"),
            ("NOLOWERCASE1", "Password must contain at least one lowercase letter"),
            ("NoDigitsHere", "Password must contain at least one digit"),
        ],
    )
    def test_rejects_weak_passwords(self, password, expected_msg):
        with pytest.raises(ValidationError) as exc_info:
            ResetPasswordRequest(
                token="abc123",
                new_password=password,
                confirm_password=password,
            )
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert expected_msg in errors[0]["msg"]

    def test_rejects_too_short(self):
        with pytest.raises(ValidationError) as exc_info:
            ResetPasswordRequest(
                token="abc123",
                new_password="Ab1",
                confirm_password="Ab1",
            )
        errors = exc_info.value.errors()
        assert any("String should have at least 8 characters" in e["msg"] for e in errors)


# ---------------------------------------------------------------------------
# ChangePasswordRequest — password strength validator
# ---------------------------------------------------------------------------


class TestChangePasswordRequest:
    def test_valid(self):
        req = ChangePasswordRequest(
            current_password="OldPass123",
            new_password="NewPass456",
            confirm_password="NewPass456",
        )
        assert req.new_password == "NewPass456"
        assert req.current_password == "OldPass123"

    @pytest.mark.parametrize(
        "password,expected_msg",
        [
            ("nouppercase1", "Password must contain at least one uppercase letter"),
            ("NOLOWERCASE1", "Password must contain at least one lowercase letter"),
            ("NoDigitsHere", "Password must contain at least one digit"),
        ],
    )
    def test_rejects_weak_passwords(self, password, expected_msg):
        with pytest.raises(ValidationError) as exc_info:
            ChangePasswordRequest(
                current_password="OldPass123",
                new_password=password,
                confirm_password=password,
            )
        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert expected_msg in errors[0]["msg"]

    def test_rejects_too_short(self):
        with pytest.raises(ValidationError) as exc_info:
            ChangePasswordRequest(
                current_password="OldPass123",
                new_password="Ab1",
                confirm_password="Ab1",
            )
        errors = exc_info.value.errors()
        assert any("String should have at least 8 characters" in e["msg"] for e in errors)
