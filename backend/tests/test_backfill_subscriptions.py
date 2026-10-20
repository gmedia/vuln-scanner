"""Guards for the subscription backfill migration.

The migration runs Postgres-only SQL (``INTERVAL``, ``LATERAL``), and the test
database is SQLite, so this file asserts the source invariants instead of
executing it:

* status is derived from the invoice period, never hardcoded;
* every status literal it writes is a status the model accepts;
* the insert stays idempotent.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.models.billing import BILLING_STATUSES

MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "backfill_subscriptions.py"
)


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_status_is_derived_from_the_period() -> None:
    sql = _sql()
    assert "WHEN latest.period_end >= now() THEN 'active'" in sql
    assert "ELSE 'past_due'" in sql


def test_status_is_not_a_hardcoded_literal() -> None:
    sql = _sql()
    # The status column follows ``o.sku`` in the SELECT list; a bare literal
    # there means every backfilled row gets the same status regardless of age.
    assert not re.search(r"o\.sku,\s*\n\s*'(active|past_due|trialing)'", sql)


def test_written_statuses_exist_in_the_model() -> None:
    sql = _sql()
    literals = set(re.findall(r"'(active|past_due|trialing|incomplete|unpaid|canceled)'", sql))
    assert literals
    assert literals <= set(BILLING_STATUSES)


def test_insert_stays_idempotent() -> None:
    assert "ON CONFLICT (organization_id) DO NOTHING" in _sql()
