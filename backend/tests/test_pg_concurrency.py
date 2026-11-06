"""Postgres-only billing concurrency tests.

Four of these tests prove money invariants that SQLite cannot exercise: row
locks (``SELECT ... FOR UPDATE``) and partial unique indexes are real only on
Postgres. They run only when ``TEST_POSTGRES_URL`` is set, so the normal
``pytest tests/`` run stays green and fast. CI runs them in the
``postgres-concurrency-tests`` job against ``postgres:16-alpine``.

The fifth test is a plain sync metadata guard. It runs in **every** CI run,
including the SQLite suite, because losing the index silently re-opens the
duplicate-row hole even when the Postgres job is skipped.

Test 1 (promo quota) is the one that fails if someone removes
``.with_for_update()`` from ``PromoService._get_by_code``.
"""

from __future__ import annotations

import asyncio
import os
import re
import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

import app.services.invoice as invoice_module
from app.config import settings
from app.models.billing import PaymentAttempt
from app.models.invoice import OrgInvoice
from app.models.promo import PromoRedemption
from app.models.user import User
from app.services.invoice import InvoiceService
from app.services.payments.base import CheckoutResult
from app.services.payments.service import PaymentService
from tests import pg_helpers

PG_ENV_VAR = pg_helpers.PG_ENV_VAR
PROMO_CODE = "CONCURRENT10"
PERIOD_MARCH = datetime(2026, 3, 1, tzinfo=UTC)
PERIOD_APRIL = datetime(2026, 4, 1, tzinfo=UTC)
INVOICE_NUMBER_RE = re.compile(r"^SX-\d{6}-\d{4}$")


@pytest_asyncio.fixture
async def pg_engine() -> AsyncEngine:
    """Function-scoped engine: pytest-asyncio gives each test a new loop."""
    url = os.environ.get(PG_ENV_VAR)
    if not url:
        pytest.skip("TEST_POSTGRES_URL not set")
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        await pg_helpers.create_schema(engine)
        await pg_helpers.truncate_all(engine)
        yield engine
        await pg_helpers.truncate_all(engine)
    finally:
        await engine.dispose()


class _FakeProvider:
    """Deterministic in-process provider; never touches the network."""

    name = "midtrans"

    def enabled(self) -> bool:
        return True

    async def create_checkout(self, req):  # noqa: ANN001 - protocol stub
        return CheckoutResult(
            provider=self.name,
            provider_order_id=req.order_id,
            provider_payment_id=f"pay-{self.name}-{req.order_id}",
            provider_token=f"tok-{self.name}-{req.order_id}",
            redirect_url=f"https://example.invalid/{self.name}/{req.order_id}",
            expires_at=datetime.now(UTC) + timedelta(hours=24),
            amount_idr=req.amount_idr,
            currency="IDR",
            raw={},
        )

    async def fetch_status(self, attempt):  # noqa: ANN001 - protocol stub
        del attempt
        raise AssertionError("fetch_status is not used by create_checkout")

    async def cancel(self, attempt):  # noqa: ANN001 - protocol stub
        del attempt
        return True


class _OtherFakeProvider(_FakeProvider):
    name = "xendit"


def _build_fake_provider(name: str, **kwargs: object) -> _FakeProvider:
    return _OtherFakeProvider() if name == "xendit" else _FakeProvider()


def _outcomes(
    results: list[object],
) -> tuple[list[object], list[BaseException]]:
    oks = [result for result in results if not isinstance(result, BaseException)]
    errs = [result for result in results if isinstance(result, BaseException)]
    return oks, errs


@pytest.mark.asyncio
async def test_global_promo_quota_is_serialised_by_the_row_lock(
    pg_engine: AsyncEngine,
) -> None:
    """Locks the global ``max_redemptions`` quota under real concurrency.

    Two *different* orgs race for one percent promo capped at one redemption.
    Different orgs mean the organization-row lock cannot serialise them, so the
    promo row ``FOR UPDATE`` is the only mutex. They also use different billing
    periods so their invoice numbers cannot collide and re-serialise them on
    ``uq_org_invoices_number``. Without the promo lock both invoices consume the
    last redemption and the applied ledger holds two rows.
    """
    seed = await pg_helpers.seed(pg_engine)
    await pg_helpers.insert_promo(
        pg_engine,
        code=PROMO_CODE,
        percent_off_bp=1000,
        max_redemptions=1,
        max_redemptions_per_org=1,
        created_by_user_id=seed.admin_id,
    )

    async def create(organization_id: uuid.UUID, period_start: datetime):
        async def _run(session):
            actor = await pg_helpers.detached_actor(pg_engine, seed.admin_id)
            return await InvoiceService(session).create_invoice(
                organization_id=organization_id,
                sku="basic",
                actor=actor,
                period_start=period_start,
                promo_code=PROMO_CODE,
            )

        return await pg_helpers.run_in_session(pg_engine, _run)

    results = await asyncio.gather(
        create(seed.org_a_id, PERIOD_MARCH),
        create(seed.org_b_id, PERIOD_APRIL),
        return_exceptions=True,
    )
    oks, errs = _outcomes(results)

    assert len(oks) == 1, results
    assert len(errs) == 1, results
    loser = errs[0]
    assert isinstance(loser, HTTPException)
    assert loser.status_code == 400

    winner = oks[0]
    assert isinstance(winner, OrgInvoice)
    assert winner.promo_code == PROMO_CODE
    assert winner.discount_idr == 30_000
    assert winner.total_idr == 270_000

    applied = await pg_helpers.scalar_count(
        pg_engine,
        select(func.count())
        .select_from(PromoRedemption)
        .where(PromoRedemption.status == "applied"),
    )
    assert applied == 1

    with_promo = await pg_helpers.scalar_count(
        pg_engine,
        select(func.count())
        .select_from(OrgInvoice)
        .where(OrgInvoice.promo_code == PROMO_CODE),
    )
    assert with_promo == 1


@pytest.mark.asyncio
async def test_same_org_same_period_race_creates_one_invoice(
    pg_engine: AsyncEngine,
) -> None:
    """Locks the per-org ``FOR UPDATE`` that serialises invoice creation.

    Same org, same SKU, same period. Both tasks must serialise on the
    organization row; the second sees the committed overlap and gets a 409.
    Without the lock both would pass the overlap check and double-bill.
    """
    seed = await pg_helpers.seed(pg_engine)

    async def create():
        async def _run(session):
            actor = await pg_helpers.detached_actor(pg_engine, seed.admin_id)
            return await InvoiceService(session).create_invoice(
                organization_id=seed.org_a_id,
                sku="basic",
                actor=actor,
                period_start=PERIOD_MARCH,
            )

        return await pg_helpers.run_in_session(pg_engine, _run)

    results = await asyncio.gather(create(), create(), return_exceptions=True)
    oks, errs = _outcomes(results)

    assert len(oks) == 1, results
    assert len(errs) == 1, results
    assert isinstance(errs[0], HTTPException)
    assert errs[0].status_code == 409

    non_void = await pg_helpers.scalar_count(
        pg_engine,
        select(func.count())
        .select_from(OrgInvoice)
        .where(
            OrgInvoice.organization_id == seed.org_a_id,
            OrgInvoice.status != "void",
        ),
    )
    assert non_void == 1


@pytest.mark.asyncio
async def test_one_pending_checkout_per_invoice(
    pg_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Locks ``uq_payment_attempt_pending_invoice`` (partial unique index).

    Two concurrent checkouts for one sent invoice, each with a *different*
    provider. Different providers matter: with the same provider the generated
    order id also collides on ``uq_payment_attempt_provider_order``, so dropping
    the pending index would still leave one row and the test would pass for the
    wrong reason. With two providers the pending predicate is the only
    constraint that can stop the second row, which is exactly PY7's
    "one pending attempt per invoice across all providers".

    The loser gets a 409 (a different provider never reuses the winner's
    attempt); there is never a second ``pending`` row. Dropping the index or
    changing its ``status = 'pending'`` predicate re-opens the double-charge
    hole.
    """
    seed = await pg_helpers.seed(pg_engine)
    invoice_id = await pg_helpers.insert_invoice(
        pg_engine,
        organization_id=seed.org_a_id,
        number="SX-202603-9001",
    )

    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr(
        "app.services.payments.service.build_provider",
        _build_fake_provider,
    )

    async def checkout(provider_name: str):
        async def _run(session):
            invoice = await session.get(OrgInvoice, invoice_id)
            actor = await pg_helpers.detached_actor(pg_engine, seed.admin_id)
            return await PaymentService(session).create_checkout(
                invoice,
                actor,
                provider_name,
                return_url="https://example.invalid/return",
                cancel_url="https://example.invalid/cancel",
            )

        return await pg_helpers.run_in_session(pg_engine, _run)

    results = await asyncio.gather(
        checkout("midtrans"), checkout("xendit"), return_exceptions=True
    )
    oks, errs = _outcomes(results)

    assert len(oks) == 1, results
    assert len(errs) == 1, results
    assert isinstance(errs[0], HTTPException)
    assert errs[0].status_code == 409
    winner = oks[0]
    assert isinstance(winner, PaymentAttempt)

    pending = await pg_helpers.read(
        pg_engine,
        lambda session: session.execute(
            select(PaymentAttempt).where(
                PaymentAttempt.invoice_id == invoice_id,
                PaymentAttempt.status == "pending",
            )
        ),
    )
    pending_rows = list(pending.scalars().all())
    assert len(pending_rows) == 1, pending_rows

    all_attempts = await pg_helpers.read(
        pg_engine,
        lambda session: session.execute(
            select(PaymentAttempt).where(PaymentAttempt.invoice_id == invoice_id)
        ),
    )
    rows = list(all_attempts.scalars().all())
    order_keys = [(row.provider, row.provider_order_id) for row in rows]
    assert len(order_keys) == len(set(order_keys))
    assert all(row.provider_order_id for row in rows)


@pytest.mark.asyncio
async def test_invoice_number_allocation_survives_a_real_unique_violation(
    pg_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Locks the ``IntegrityError`` retry in ``create_invoice``.

    Two different orgs allocate a number for the same period concurrently. A
    barrier holds both tasks after they read the same count, so both really try
    to insert ``...-0001``; one loses the unique race and the retry loop must
    re-read and allocate ``...-0002``. Without the retry the loser surfaces a
    500/409 instead of the second valid invoice.
    """
    seed = await pg_helpers.seed(pg_engine)

    barrier = asyncio.Barrier(2)
    allocated: list[str] = []
    real_next = invoice_module.next_invoice_number

    async def synchronized_next(db, period_start):  # noqa: ANN001, ANN202
        number = await real_next(db, period_start)
        allocated.append(number)
        if len(allocated) <= 2:
            # Both first attempts computed the same prefix before either insert.
            await asyncio.wait_for(barrier.wait(), timeout=30)
        return number

    monkeypatch.setattr(invoice_module, "next_invoice_number", synchronized_next)

    async def create(organization_id: uuid.UUID):
        async def _run(session):
            actor = await session.get(User, seed.admin_id)
            assert actor is not None
            return await InvoiceService(session).create_invoice(
                organization_id=organization_id,
                sku="basic",
                actor=actor,
                period_start=PERIOD_APRIL,
            )

        return await pg_helpers.run_in_session(pg_engine, _run)

    results = await asyncio.gather(
        create(seed.org_a_id), create(seed.org_b_id), return_exceptions=True
    )
    oks, errs = _outcomes(results)

    assert errs == [], results
    assert len(oks) == 2, results
    numbers = sorted(invoice.number for invoice in oks if isinstance(invoice, OrgInvoice))
    assert numbers == ["SX-202604-0001", "SX-202604-0002"]
    assert all(INVOICE_NUMBER_RE.match(number) for number in numbers)
    assert sorted(allocated) == ["SX-202604-0001", "SX-202604-0001", "SX-202604-0002"]

    total = await pg_helpers.scalar_count(
        pg_engine, select(func.count()).select_from(OrgInvoice)
    )
    assert total == 2


def test_partial_unique_indexes_that_preserve_duplicate_invariants() -> None:
    """Guards the index predicates even when the Postgres job is skipped.

    These indexes are the database-level half of the invariants above. A lost
    predicate or a lost ``unique=True`` silently allows duplicate checkout
    attempts, duplicate promo consumption or two invoices for one request.
    """

    def index_for(table, name):  # noqa: ANN001, ANN202
        for index in table.indexes:
            if index.name == name:
                return index
        raise AssertionError(f"{name} is missing from {table.name}")

    pending = index_for(PaymentAttempt.__table__, "uq_payment_attempt_pending_invoice")
    assert pending.unique is True
    assert [column.name for column in pending.columns] == ["invoice_id"]
    for dialect in ("postgresql_where", "sqlite_where"):
        predicate = str(pending.dialect_kwargs[dialect])
        assert "status = 'pending'" in predicate, (dialect, predicate)

    invoice_request = index_for(
        OrgInvoice.__table__, "uq_org_invoices_subscription_request"
    )
    assert invoice_request.unique is True
    for dialect in ("postgresql_where", "sqlite_where"):
        predicate = str(invoice_request.dialect_kwargs[dialect])
        assert "subscription_request_id IS NOT NULL" in predicate, (dialect, predicate)

    promo_request = index_for(
        PromoRedemption.__table__, "uq_promo_redemption_request"
    )
    assert promo_request.unique is True
    for dialect in ("postgresql_where", "sqlite_where"):
        predicate = str(promo_request.dialect_kwargs[dialect])
        assert "subscription_request_id IS NOT NULL" in predicate, (dialect, predicate)
