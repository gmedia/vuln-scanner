"""Expanded tests for the database module in app.database."""

import inspect

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.database import Base, async_session, engine, get_db
from app.models.cve_cache import CveCache  # noqa: F401 — ensures table is registered in metadata


class TestBase:
    def test_base_is_declarative_base(self):
        assert issubclass(Base, DeclarativeBase)

    def test_metadata_has_expected_tables(self):
        expected_tables = {
            "users",
            "scan_jobs",
            "scan_findings",
            "cve_cache",
            "api_keys",
            "credit_logs",
            "email_verification_tokens",
            "password_reset_tokens",
            "pricing",
        }

        actual_tables = set(Base.metadata.tables.keys())
        missing = expected_tables - actual_tables

        assert not missing, f"Missing tables in metadata: {missing}"


class TestEngine:
    def test_engine_is_not_none(self):
        assert engine is not None

    def test_engine_has_url(self):
        assert str(engine.url) != ""


class TestAsyncSession:
    def test_async_session_is_sessionmaker(self):
        assert isinstance(async_session, async_sessionmaker)

    def test_async_session_uses_async_session_class(self):
        assert async_session.class_ is AsyncSession


class TestGetDb:
    def test_get_db_is_async_generator(self):
        assert inspect.isasyncgenfunction(get_db)
