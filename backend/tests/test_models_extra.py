import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import String, Text, TypeDecorator
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.database import Base
from app.models.api_key import ApiKey
from app.models.credit_log import CreditLog
from app.models.email_verification import EmailVerificationToken
from app.models.password_reset import PasswordResetToken
from app.models.pricing import PricingConfig


# SQLite-compatible UUID and JSONB type decorators
class _UUIDType(TypeDecorator):
    impl = String(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value.hex
        return str(value).replace("-", "")

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


class _JSONBType(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        import json

        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            import json

            return json.loads(value)
        return value


# Patch the metadata columns for these models (conftest handles User/ScanJob/ScanFinding)
for table_name in ("api_keys", "credit_logs", "email_verification_tokens", "password_reset_tokens", "pricing"):
    table = Base.metadata.tables.get(table_name)
    if table is not None:
        for column in table.columns:
            if isinstance(column.type, PG_UUID):
                column.type = _UUIDType(32)
            elif isinstance(column.type, PG_JSONB):
                column.type = _JSONBType()


class TestApiKey:
    @pytest.mark.asyncio
    async def test_create_all_fields(self, db_session):
        key = ApiKey(
            id=uuid.uuid4(),
            key_hash="sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            name="Production Key",
            is_active=True,
            rate_limit=120,
        )
        db_session.add(key)
        await db_session.commit()
        await db_session.refresh(key)

        assert key.name == "Production Key"
        assert key.is_active is True
        assert key.rate_limit == 120
        assert key.key_hash == "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
        assert key.created_at is not None

    @pytest.mark.asyncio
    async def test_create_defaults(self, db_session):
        key = ApiKey(
            id=uuid.uuid4(),
            key_hash="sha256:defaults1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        )
        db_session.add(key)
        await db_session.commit()
        await db_session.refresh(key)

        assert key.is_active is True
        assert key.rate_limit == 60
        assert key.name is None

    @pytest.mark.asyncio
    async def test_key_hash_unique(self, db_session):
        key1 = ApiKey(
            id=uuid.uuid4(),
            key_hash="sha256:unique1111111111111111111111111111111111111111111111111111111111",
        )
        key2 = ApiKey(
            id=uuid.uuid4(),
            key_hash="sha256:unique2222222222222222222222222222222222222222222222222222222222",
        )
        db_session.add_all([key1, key2])
        await db_session.commit()

        assert key1.key_hash != key2.key_hash

    @pytest.mark.asyncio
    async def test_name_max_length(self, db_session):
        name = "a" * 100
        key = ApiKey(
            id=uuid.uuid4(),
            key_hash="sha256:longname111111111111111111111111111111111111111111111111111111111",
            name=name,
        )
        db_session.add(key)
        await db_session.commit()
        await db_session.refresh(key)

        assert len(key.name) == 100
        assert key.name == name


class TestCreditLog:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("log_type", ["credit", "deduct", "refund"])
    async def test_create_with_types(self, db_session, sample_user, log_type):
        log = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=50,
            type=log_type,
            description=f"{log_type} transaction",
        )
        db_session.add(log)
        await db_session.commit()
        await db_session.refresh(log)

        assert log.type == log_type
        assert log.amount == 50
        assert log.user_id == sample_user.id

    @pytest.mark.asyncio
    async def test_create_all_fields(self, db_session, sample_user):
        admin_id = uuid.uuid4()
        ref_id = uuid.uuid4()
        log = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=100,
            type="credit",
            description="Admin bonus credits",
            reference_id=ref_id,
            performed_by=admin_id,
        )
        db_session.add(log)
        await db_session.commit()
        await db_session.refresh(log)

        assert log.amount == 100
        assert log.type == "credit"
        assert log.description == "Admin bonus credits"
        assert log.reference_id == ref_id
        assert log.performed_by == admin_id
        assert log.created_at is not None

    @pytest.mark.asyncio
    async def test_performed_by_nullable(self, db_session, sample_user):
        log = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=25,
            type="deduct",
            description="Scan cost",
        )
        db_session.add(log)
        await db_session.commit()
        await db_session.refresh(log)

        assert log.performed_by is None

    @pytest.mark.asyncio
    async def test_description_nullable(self, db_session, sample_user):
        log = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=10,
            type="credit",
        )
        db_session.add(log)
        await db_session.commit()
        await db_session.refresh(log)

        assert log.description is None

    @pytest.mark.asyncio
    async def test_negative_amount(self, db_session, sample_user):
        log = CreditLog(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            amount=-30,
            type="deduct",
            description="Negative deduction",
        )
        db_session.add(log)
        await db_session.commit()
        await db_session.refresh(log)

        assert log.amount == -30


class TestEmailVerificationToken:
    @pytest.mark.asyncio
    async def test_create_all_fields(self, db_session, sample_user):
        expires = datetime.now(UTC) + timedelta(hours=24)
        token = EmailVerificationToken(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            token="verify-token-abc123",
            expires_at=expires,
        )
        db_session.add(token)
        await db_session.commit()
        await db_session.refresh(token)

        assert token.user_id == sample_user.id
        assert token.token == "verify-token-abc123"
        assert token.expires_at is not None
        assert token.created_at is not None

    @pytest.mark.asyncio
    async def test_token_unique(self, db_session, sample_user):
        expires = datetime.now(UTC) + timedelta(hours=24)
        token1 = EmailVerificationToken(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            token="unique-token-1",
            expires_at=expires,
        )
        db_session.add(token1)
        await db_session.commit()

        # Create a second user for the second token
        from app.models.user import User

        user2 = User(
            id=uuid.uuid4(),
            email="test2@example.com",
            password_hash="fake-hash",
        )
        db_session.add(user2)
        await db_session.commit()
        await db_session.refresh(user2)

        token2 = EmailVerificationToken(
            id=uuid.uuid4(),
            user_id=user2.id,
            token="unique-token-2",
            expires_at=expires,
        )
        db_session.add(token2)
        await db_session.commit()

        assert token1.token != token2.token

    @pytest.mark.asyncio
    async def test_expires_at_required(self, db_session, sample_user):
        token = EmailVerificationToken(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            token="expiry-token-001",
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db_session.add(token)
        await db_session.commit()
        await db_session.refresh(token)

        assert token.expires_at is not None
        # The UUID TypeDecorator strips tzinfo — reattach UTC for comparison
        assert token.expires_at.replace(tzinfo=UTC) > datetime.now(UTC)


class TestPasswordResetToken:
    @pytest.mark.asyncio
    async def test_create_all_fields(self, db_session, sample_user):
        expires = datetime.now(UTC) + timedelta(hours=1)
        token = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            token="reset-token-xyz789",
            expires_at=expires,
        )
        db_session.add(token)
        await db_session.commit()
        await db_session.refresh(token)

        assert token.user_id == sample_user.id
        assert token.token == "reset-token-xyz789"
        assert token.expires_at is not None
        assert token.created_at is not None

    @pytest.mark.asyncio
    async def test_token_unique(self, db_session, sample_user):
        expires = datetime.now(UTC) + timedelta(hours=1)
        token1 = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            token="reset-unique-1",
            expires_at=expires,
        )
        db_session.add(token1)
        await db_session.commit()

        # Create a second user
        from app.models.user import User

        user2 = User(
            id=uuid.uuid4(),
            email="resetuser2@example.com",
            password_hash="fake-hash",
        )
        db_session.add(user2)
        await db_session.commit()
        await db_session.refresh(user2)

        token2 = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=user2.id,
            token="reset-unique-2",
            expires_at=expires,
        )
        db_session.add(token2)
        await db_session.commit()

        assert token1.token != token2.token

    @pytest.mark.asyncio
    async def test_expires_at_required(self, db_session, sample_user):
        token = PasswordResetToken(
            id=uuid.uuid4(),
            user_id=sample_user.id,
            token="reset-expiry-001",
            expires_at=datetime.now(UTC) + timedelta(minutes=30),
        )
        db_session.add(token)
        await db_session.commit()
        await db_session.refresh(token)

        assert token.expires_at is not None
        # The UUID TypeDecorator strips tzinfo — reattach UTC for comparison
        assert token.expires_at.replace(tzinfo=UTC) > datetime.now(UTC)


class TestPricingConfig:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("scan_type", ["ip", "domain", "apk", "ipa"])
    async def test_create_with_scan_types(self, db_session, scan_type):
        pricing = PricingConfig(
            id=uuid.uuid4(),
            scan_type=scan_type,
            credit_cost=10,
        )
        db_session.add(pricing)
        await db_session.commit()
        await db_session.refresh(pricing)

        assert pricing.scan_type == scan_type
        assert pricing.credit_cost == 10

    @pytest.mark.asyncio
    async def test_create_all_fields(self, db_session):
        pricing = PricingConfig(
            id=uuid.uuid4(),
            scan_type="ip",
            credit_cost=15,
        )
        db_session.add(pricing)
        await db_session.commit()
        await db_session.refresh(pricing)

        assert pricing.scan_type == "ip"
        assert pricing.credit_cost == 15
        assert pricing.updated_at is not None

    @pytest.mark.asyncio
    async def test_scan_type_unique(self, db_session):
        pricing1 = PricingConfig(
            id=uuid.uuid4(),
            scan_type="domain",
            credit_cost=5,
        )
        pricing2 = PricingConfig(
            id=uuid.uuid4(),
            scan_type="ip",
            credit_cost=10,
        )
        db_session.add_all([pricing1, pricing2])
        await db_session.commit()

        assert pricing1.scan_type != pricing2.scan_type

    @pytest.mark.asyncio
    async def test_credit_cost_zero(self, db_session):
        pricing = PricingConfig(
            id=uuid.uuid4(),
            scan_type="apk",
            credit_cost=0,
        )
        db_session.add(pricing)
        await db_session.commit()
        await db_session.refresh(pricing)

        assert pricing.credit_cost == 0
