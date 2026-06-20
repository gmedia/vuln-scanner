import sys

sys.path.insert(0, "/home/ubuntu/vuln-scanner/backend")

import json
import uuid
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import String, Text, TypeDecorator
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Import models first so metadata is populated
from app.database import Base
from app.models.scan_finding import ScanFinding
from app.models.scan_job import ScanJob


# Build SQLite-safe type decorators
class UUIDType(TypeDecorator):
    impl = String(32)
    cache_ok = True
    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value.hex
        return str(value).replace('-', '')
    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)

class JSONBType(TypeDecorator):
    impl = Text
    cache_ok = True
    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value)
    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            return json.loads(value)
        return value

# Replace PostgreSQL types on metadata with SQLite-safe decorators
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

for table in Base.metadata.tables.values():
    for column in table.columns:
        if isinstance(column.type, PG_UUID):
            column.type = UUIDType(32)
        elif isinstance(column.type, PG_JSONB):
            column.type = JSONBType()

# Now safe to import the rest of the app
from app.database import get_db
from app.main import app


@pytest_asyncio.fixture
async def engine():
    test_engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", echo=False
    )
    yield test_engine
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async_session_local = async_sessionmaker(
        engine, expire_on_commit=False
    )
    async with async_session_local() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    app.middleware_stack = None
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def mock_celery(monkeypatch):
    mock_async_result = MagicMock()
    mock_async_result.id = "mock-task-id-456"
    mock_send_task = MagicMock(return_value=mock_async_result)
    monkeypatch.setattr(
        "app.services.scanner.celery_app.send_task", mock_send_task
    )
    return mock_send_task


@pytest_asyncio.fixture
async def sample_job(db_session):
    job = ScanJob(
        id=uuid.uuid4(),
        scan_type="ip",
        target="192.168.1.1",
        status="completed",
        progress=100,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    return job


@pytest_asyncio.fixture
async def sample_finding(db_session, sample_job):
    finding = ScanFinding(
        id=uuid.uuid4(),
        job_id=sample_job.id,
        severity="high",
        category="Network",
        title="Open port 22",
        description="SSH port is open",
        cve_id=None,
        cvss_score=7.5,
    )
    db_session.add(finding)
    await db_session.commit()
    await db_session.refresh(finding)
    return finding
