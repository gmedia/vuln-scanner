import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.admin import (
    AdminStats,
    AdminUserItem,
    AdminUserList,
    CreditUpdateRequest,
    PricingItem,
    PricingListResponse,
    PricingUpdateRequest,
)
from app.schemas.api_key import (
    KeyCreateRequest,
    KeyListResponse,
    KeyResponse,
    KeyRevokeResponse,
)
from app.schemas.credit import (
    CreditHistoryResponse,
    CreditInfo,
    CreditLogItem,
    ScanEligibility,
)


class TestCreditInfo:
    def test_valid(self):
        info = CreditInfo(credits=100, is_admin=False)
        assert info.credits == 100
        assert info.is_admin is False

    def test_admin(self):
        info = CreditInfo(credits=0, is_admin=True)
        assert info.credits == 0
        assert info.is_admin is True

    def test_invalid_missing_fields(self):
        with pytest.raises(ValidationError):
            CreditInfo()


class TestCreditLogItem:
    def test_valid(self):
        item_id = uuid.uuid4()
        now = datetime.now(UTC)
        item = CreditLogItem(
            id=item_id,
            amount=50,
            type="credit",
            description="Test credit",
            reference_id=None,
            created_at=now,
        )
        assert item.id == item_id
        assert item.amount == 50
        assert item.type == "credit"
        assert item.description == "Test credit"

    def test_description_max_length(self):
        item_id = uuid.uuid4()
        now = datetime.now(UTC)
        desc = "a" * 2000
        item = CreditLogItem(
            id=item_id,
            amount=10,
            type="deduct",
            description=desc,
            reference_id=None,
            created_at=now,
        )
        assert len(item.description) == 2000

    def test_description_too_long(self):
        with pytest.raises(ValidationError):
            CreditLogItem(
                id=uuid.uuid4(),
                amount=10,
                type="deduct",
                description="a" * 2001,
                reference_id=None,
                created_at=datetime.now(UTC),
            )

    def test_description_none(self):
        item = CreditLogItem(
            id=uuid.uuid4(),
            amount=5,
            type="refund",
            reference_id=None,
            created_at=datetime.now(UTC),
        )
        assert item.description is None

    def test_from_attributes_config(self):
        assert hasattr(CreditLogItem, "model_config")
        assert CreditLogItem.model_config.get("from_attributes") is True


class TestCreditHistoryResponse:
    def test_valid(self):
        item = CreditLogItem(
            id=uuid.uuid4(),
            amount=100,
            type="credit",
            reference_id=None,
            created_at=datetime.now(UTC),
        )
        resp = CreditHistoryResponse(items=[item], total=1)
        assert len(resp.items) == 1
        assert resp.total == 1

    def test_empty_items(self):
        resp = CreditHistoryResponse(items=[], total=0)
        assert resp.items == []
        assert resp.total == 0


class TestScanEligibility:
    def test_valid(self):
        e = ScanEligibility(
            eligible=True,
            required_credits=10,
            current_credits=50,
            scan_type="ip",
        )
        assert e.eligible is True
        assert e.required_credits == 10
        assert e.current_credits == 50
        assert e.scan_type == "ip"

    def test_scan_type_max_length(self):
        e = ScanEligibility(
            eligible=False,
            required_credits=5,
            current_credits=0,
            scan_type="a" * 20,
        )
        assert len(e.scan_type) == 20

    def test_scan_type_too_long(self):
        with pytest.raises(ValidationError):
            ScanEligibility(
                eligible=False,
                required_credits=5,
                current_credits=0,
                scan_type="a" * 21,
            )


class TestKeyCreateRequest:
    def test_valid(self):
        req = KeyCreateRequest(name="My API Key", rate_limit=120)
        assert req.name == "My API Key"
        assert req.rate_limit == 120

    def test_default_rate_limit(self):
        req = KeyCreateRequest(name="Default Key")
        assert req.rate_limit == 60

    def test_name_max_length(self):
        req = KeyCreateRequest(name="a" * 100)
        assert len(req.name) == 100

    def test_name_too_long(self):
        with pytest.raises(ValidationError):
            KeyCreateRequest(name="a" * 101)

    def test_name_required(self):
        with pytest.raises(ValidationError):
            KeyCreateRequest()


class TestKeyResponse:
    def test_valid(self):
        key_id = uuid.uuid4()
        now = datetime.now(UTC)
        resp = KeyResponse(
            id=key_id,
            name="Test Key",
            is_active=True,
            rate_limit=60,
            created_at=now,
            key="sk-abc123",
        )
        assert resp.id == key_id
        assert resp.name == "Test Key"
        assert resp.is_active is True
        assert resp.key == "sk-abc123"

    def test_key_none(self):
        resp = KeyResponse(
            id=uuid.uuid4(),
            name=None,
            is_active=False,
            rate_limit=30,
            created_at=datetime.now(UTC),
        )
        assert resp.key is None
        assert resp.name is None


class TestKeyRevokeResponse:
    def test_valid(self):
        key_id = uuid.uuid4()
        resp = KeyRevokeResponse(id=key_id, is_active=False)
        assert resp.id == key_id
        assert resp.is_active is False


class TestKeyListResponse:
    def test_valid(self):
        key = KeyResponse(
            id=uuid.uuid4(),
            name="Key 1",
            is_active=True,
            rate_limit=60,
            created_at=datetime.now(UTC),
        )
        resp = KeyListResponse(keys=[key])
        assert len(resp.keys) == 1

    def test_empty_keys(self):
        resp = KeyListResponse(keys=[])
        assert resp.keys == []


class TestAdminStats:
    def test_valid(self):
        stats = AdminStats(
            total_users=100,
            total_scans=500,
            total_findings=2000,
            credits_distributed=10000,
            credits_used=7500,
        )
        assert stats.total_users == 100
        assert stats.total_scans == 500
        assert stats.total_findings == 2000
        assert stats.credits_distributed == 10000
        assert stats.credits_used == 7500

    def test_zero_values(self):
        stats = AdminStats(
            total_users=0,
            total_scans=0,
            total_findings=0,
            credits_distributed=0,
            credits_used=0,
        )
        assert stats.total_users == 0
        assert stats.total_scans == 0
        assert stats.total_findings == 0


class TestAdminUserItem:
    def test_valid(self):
        user_id = uuid.uuid4()
        now = datetime.now(UTC)
        item = AdminUserItem(
            id=user_id,
            email="admin@example.com",
            is_admin=True,
            is_verified=True,
            credits=500,
            scan_count=42,
            created_at=now,
        )
        assert item.id == user_id
        assert item.email == "admin@example.com"
        assert item.is_admin is True
        assert item.scan_count == 42

    def test_from_attributes_config(self):
        assert hasattr(AdminUserItem, "model_config")
        assert AdminUserItem.model_config.get("from_attributes") is True


class TestAdminUserList:
    def test_valid(self):
        item = AdminUserItem(
            id=uuid.uuid4(),
            email="user@example.com",
            is_admin=False,
            is_verified=True,
            credits=100,
            scan_count=5,
            created_at=datetime.now(UTC),
        )
        resp = AdminUserList(users=[item], total=1)
        assert len(resp.users) == 1
        assert resp.total == 1

    def test_empty_users(self):
        resp = AdminUserList(users=[], total=0)
        assert resp.users == []
        assert resp.total == 0


class TestCreditUpdateRequest:
    def test_positive_amount(self):
        req = CreditUpdateRequest(amount=100, description="Bonus credits")
        assert req.amount == 100
        assert req.description == "Bonus credits"

    def test_negative_amount(self):
        req = CreditUpdateRequest(amount=-50, description="Penalty deduction")
        assert req.amount == -50

    def test_default_description(self):
        req = CreditUpdateRequest(amount=25)
        assert req.description == "Admin adjustment"

    def test_description_max_length(self):
        req = CreditUpdateRequest(amount=10, description="a" * 2000)
        assert len(req.description) == 2000

    def test_description_too_long(self):
        with pytest.raises(ValidationError):
            CreditUpdateRequest(amount=10, description="a" * 2001)

    def test_amount_required(self):
        with pytest.raises(ValidationError):
            CreditUpdateRequest()


class TestPricingItem:
    def test_valid(self):
        item_id = uuid.uuid4()
        now = datetime.now(UTC)
        item = PricingItem(
            id=item_id,
            scan_type="ip",
            credit_cost=10,
            updated_at=now,
        )
        assert item.id == item_id
        assert item.scan_type == "ip"
        assert item.credit_cost == 10

    def test_scan_type_max_length(self):
        item = PricingItem(
            id=uuid.uuid4(),
            scan_type="a" * 20,
            credit_cost=5,
            updated_at=datetime.now(UTC),
        )
        assert len(item.scan_type) == 20

    def test_scan_type_too_long(self):
        with pytest.raises(ValidationError):
            PricingItem(
                id=uuid.uuid4(),
                scan_type="a" * 21,
                credit_cost=5,
                updated_at=datetime.now(UTC),
            )

    def test_from_attributes_config(self):
        assert hasattr(PricingItem, "model_config")
        assert PricingItem.model_config.get("from_attributes") is True


class TestPricingUpdateRequest:
    def test_valid(self):
        req = PricingUpdateRequest(credit_cost=15)
        assert req.credit_cost == 15

    def test_zero_cost(self):
        req = PricingUpdateRequest(credit_cost=0)
        assert req.credit_cost == 0

    def test_negative_cost_rejected(self):
        with pytest.raises(ValidationError):
            PricingUpdateRequest(credit_cost=-1)


class TestPricingListResponse:
    def test_valid(self):
        item = PricingItem(
            id=uuid.uuid4(),
            scan_type="domain",
            credit_cost=20,
            updated_at=datetime.now(UTC),
        )
        resp = PricingListResponse(items=[item])
        assert len(resp.items) == 1

    def test_empty_items(self):
        resp = PricingListResponse(items=[])
        assert resp.items == []
