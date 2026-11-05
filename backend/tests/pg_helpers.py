"""Helpers for the Postgres-only billing concurrency suite.

The regular test suite runs SQLite in-memory. The money invariants that depend
on row locks and partial unique indexes need a real Postgres server, so these
helpers are deliberately small and only used by ``test_pg_concurrency.py``.

Design rules:

* ``TEST_POSTGRES_URL`` is the **only** switch. No other env var enables the
  Postgres suite, and nothing here connects when the var is unset.
* The schema is built from ``Base.metadata.create_all`` rather than Alembic:
  the tests target the model metadata and the index predicates declared there.
  ``tests/conftest.py`` imports every model before any test runs, so the
  metadata is complete by the time these helpers are called.
* Each test gets a fresh engine (function-scoped) because pytest-asyncio hands
  every test a new event loop; a session-scoped asyncpg pool would be bound to
  the first loop. ``NullPool`` keeps connections out of the loop pool too.
* Isolation is ``TRUNCATE ... RESTART IDENTITY CASCADE`` over
  ``Base.metadata.sorted_tables``, run before and after every test.
* Concurrency helpers create a *separate* ``async_sessionmaker`` and session
  per task. One ``AsyncSession`` is never shared between concurrent tasks.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.database import Base
from app.models.invoice import OrgInvoice, SkuCatalog
from app.models.organization import Organization, OrganizationMembership
from app.models.promo import PromoCode
from app.models.sku_tier import SkuTier
from app.models.user import User

PG_ENV_VAR = "TEST_POSTGRES_URL"

# Same owner-locked tier/catalog values the SQLite ``db_session`` fixture seeds.
# Copied rather than invented so the Postgres harness bills exactly like the
# rest of the suite.
_BASIC_TIER = {
    "code": "basic",
    "label": "Basic",
    "rank": 1,
    "active": True,
    "requestable": True,
    "sales_led": False,
    "is_default": True,
    "bundle_idr": 450_000,
    "limit_scan": 1,
    "limit_host": 1,
    "limit_uptime": 10,
    "limit_guard": 1,
    "allow_status_page": False,
    "allow_custom_host": False,
    "allow_waf_protect": False,
    "allow_siem": False,
    "billing_unrestricted": False,
    "workspace_editor_limit": 1,
    "workspace_viewer_limit": 1,
}

_PRO_TIER = {
    "code": "pro",
    "label": "Pro",
    "rank": 2,
    "active": True,
    "requestable": True,
    "sales_led": False,
    "is_default": False,
    "bundle_idr": 1_000_000,
    "limit_scan": 3,
    "limit_host": 3,
    "limit_uptime": 50,
    "limit_guard": 3,
    "allow_status_page": True,
    "allow_custom_host": False,
    "allow_waf_protect": True,
    "allow_siem": False,
    "billing_unrestricted": False,
    "workspace_editor_limit": None,
    "workspace_viewer_limit": None,
}

_SCAN_CATALOG = {"basic": 300_000, "pro": 650_000}


@dataclass(frozen=True, slots=True)
class Seed:
    """Ids of the rows every concurrency test can rely on."""

    admin_id: uuid.UUID
    org_a_id: uuid.UUID
    org_b_id: uuid.UUID


def _maker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def create_schema(engine: AsyncEngine) -> None:
    """Create every model table and index from the live metadata."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def truncate_all(engine: AsyncEngine) -> None:
    """Empty every table with identity reset, ignoring FK order."""
    names = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.exec_driver_sql(f"TRUNCATE TABLE {names} RESTART IDENTITY CASCADE")


async def seed(engine: AsyncEngine) -> Seed:
    """Insert the minimal billing graph the tests need, and nothing else."""
    now = datetime.now(UTC)
    admin = User(
        id=uuid.uuid4(),
        email="pg-concurrency-admin@example.com",
        password_hash="fake-hash",
        is_verified=True,
        is_admin=True,
        credits=100,
    )
    org_a = Organization(
        id=uuid.uuid4(),
        name="Postgres Org A",
        slug="pg-org-a",
        kind="company",
        sku="basic",
        created_by_user_id=admin.id,
    )
    org_b = Organization(
        id=uuid.uuid4(),
        name="Postgres Org B",
        slug="pg-org-b",
        kind="company",
        sku="basic",
        created_by_user_id=admin.id,
    )
    async with _maker(engine)() as session:
        session.add_all(
            [
                SkuTier(**_BASIC_TIER, created_at=now, updated_at=now),
                SkuTier(**_PRO_TIER, created_at=now, updated_at=now),
            ]
        )
        await session.flush()
        for sku, list_idr in _SCAN_CATALOG.items():
            session.add(
                SkuCatalog(
                    product="scan",
                    sku=sku,
                    list_idr=list_idr,
                    invoicable=True,
                    updated_at=now,
                )
            )
        await session.flush()
        session.add(admin)
        await session.flush()
        session.add_all([org_a, org_b])
        await session.flush()
        for org in (org_a, org_b):
            session.add(
                OrganizationMembership(
                    id=uuid.uuid4(),
                    organization_id=org.id,
                    user_id=admin.id,
                    role="owner",
                )
            )
        await session.commit()
    return Seed(admin_id=admin.id, org_a_id=org_a.id, org_b_id=org_b.id)


async def insert_promo(
    engine: AsyncEngine,
    *,
    code: str,
    percent_off_bp: int = 1000,
    max_redemptions: int | None = 1,
    max_redemptions_per_org: int = 1,
    created_by_user_id: uuid.UUID,
) -> uuid.UUID:
    """Create one active percent promo and commit it before the race starts."""
    now = datetime.now(UTC)
    promo = PromoCode(
        id=uuid.uuid4(),
        code=code,
        description="Postgres concurrency promo",
        kind="percent",
        percent_off_bp=percent_off_bp,
        min_amount_idr=0,
        max_redemptions=max_redemptions,
        max_redemptions_per_org=max_redemptions_per_org,
        active=True,
        requires_approval=False,
        created_by_user_id=created_by_user_id,
        updated_by_user_id=created_by_user_id,
        created_at=now,
        updated_at=now,
    )
    async with _maker(engine)() as session:
        session.add(promo)
        await session.commit()
    return promo.id


async def insert_invoice(
    engine: AsyncEngine,
    *,
    organization_id: uuid.UUID,
    number: str,
    status: str = "sent",
    total_idr: int = 650_000,
    product: str = "scan",
    sku: str = "pro",
) -> uuid.UUID:
    """Insert one invoice row directly, bypassing invoice-number allocation."""
    now = datetime.now(UTC)
    start = datetime(2026, 3, 1, tzinfo=UTC)
    end = datetime(2026, 3, 31, 23, 59, 59, 999999, tzinfo=UTC)
    invoice = OrgInvoice(
        id=uuid.uuid4(),
        organization_id=organization_id,
        number=number,
        product=product,
        sku=sku,
        amount_idr=total_idr,
        discount_idr=0,
        dpp_idr=total_idr,
        ppn_idr=0,
        pph23_idr=0,
        total_idr=total_idr,
        period_start=start,
        period_end=end,
        due_date=start.replace(day=8),
        status=status,
        sent_at=now if status != "draft" else None,
    )
    async with _maker(engine)() as session:
        session.add(invoice)
        await session.commit()
    return invoice.id


async def run_in_session(
    engine: AsyncEngine,
    fn: Callable[[AsyncSession], Awaitable[Any]],
) -> Any:
    """Run ``fn`` in its own session; roll back so locks are released fast."""
    async with _maker(engine)() as session:
        try:
            return await fn(session)
        except BaseException:
            await session.rollback()
            raise


async def read(engine: AsyncEngine, fn: Callable[[AsyncSession], Awaitable[Any]]) -> Any:
    """Read-only helper: fresh session, caller owns the query."""
    async with _maker(engine)() as session:
        return await fn(session)


async def scalar_count(engine: AsyncEngine, stmt: Any) -> int:
    """Count rows for a ``select(func.count())`` statement."""

    async def _count(session: AsyncSession) -> int:
        return int((await session.scalar(stmt)) or 0)

    return int(await read(engine, _count))


async def detached_actor(engine: AsyncEngine, user_id: uuid.UUID) -> User:
    """Load the actor and detach it from the session.

    Only for tests that race a row lock or unique constraint without entering
    the invoice-number retry. The retry runs ``Session.rollback()``, which
    expires every *attached* ORM instance; the retry test therefore loads the
    actor from its own session so the rebind path is exercised for real.
    """

    async def _get(session: AsyncSession) -> User:
        user = await session.get(User, user_id)
        if user is None:  # pragma: no cover - seed contract guard
            raise AssertionError("seeded admin is missing")
        session.expunge(user)
        return user

    return await read(engine, _get)


async def invoice_ids_for_org(engine: AsyncEngine, organization_id: uuid.UUID) -> list[uuid.UUID]:
    from app.models.invoice import OrgInvoice

    async def _query(session: AsyncSession) -> list[uuid.UUID]:
        rows = await session.execute(
            select(OrgInvoice.id).where(OrgInvoice.organization_id == organization_id)
        )
        return list(rows.scalars().all())

    return await read(engine, _query)
