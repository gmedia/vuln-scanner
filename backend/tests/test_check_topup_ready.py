"""Read-only launch readiness check for the AI wallet top-up feature."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.ai_gateway import AiTopupPack
from scripts.check_topup_ready import (
    CHECK_ACTIVE_PACKS,
    CHECK_AI_GATEWAY,
    CHECK_BANK_COPY,
    CHECK_PAYMENT_GATEWAY,
    CheckResult,
    exit_code,
    format_report,
    run_checks,
)

ACCOUNT = "9876543210123"


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "ai_gateway_enabled": True,
        "payment_gateway_enabled": False,
        "invoice_bank_name": "Bank Contoh",
        "invoice_bank_account": ACCOUNT,
        "invoice_bank_holder": "PT Contoh",
    }
    values.update(overrides)
    return Settings(**values)


async def _add_pack(db: AsyncSession, *, active: bool, amount_idr: int = 100_000) -> None:
    db.add(
        AiTopupPack(
            code=f"p{uuid.uuid4().hex[:8]}",
            label="Pack Contoh",
            amount_idr=amount_idr,
            active=active,
        )
    )
    await db.commit()


def _status(results: list[CheckResult], check: str) -> str:
    return next(result.status for result in results if result.check == check)


@pytest.mark.asyncio
async def test_no_packs_fails(db_session: AsyncSession) -> None:
    results = await run_checks(db_session, cfg=_settings())

    assert _status(results, CHECK_ACTIVE_PACKS) == "FAIL"
    assert exit_code(results) == 1


@pytest.mark.asyncio
async def test_only_inactive_packs_fails(db_session: AsyncSession) -> None:
    await _add_pack(db_session, active=False)

    results = await run_checks(db_session, cfg=_settings())

    assert _status(results, CHECK_ACTIVE_PACKS) == "FAIL"
    assert exit_code(results) == 1


@pytest.mark.asyncio
async def test_active_pack_and_bank_set_passes(db_session: AsyncSession) -> None:
    await _add_pack(db_session, active=True, amount_idr=50_000)
    await _add_pack(db_session, active=True, amount_idr=250_000)

    results = await run_checks(db_session, cfg=_settings())

    assert _status(results, CHECK_ACTIVE_PACKS) == "PASS"
    assert _status(results, CHECK_BANK_COPY) == "PASS"
    assert _status(results, CHECK_AI_GATEWAY) == "PASS"
    assert all(result.status != "FAIL" for result in results)
    assert exit_code(results) == 0

    output = format_report(results)
    assert ACCOUNT not in output
    assert "account: set" in output
    assert "2 active pack(s)" in output


@pytest.mark.asyncio
async def test_missing_bank_holder_fails(db_session: AsyncSession) -> None:
    await _add_pack(db_session, active=True)

    results = await run_checks(db_session, cfg=_settings(invoice_bank_holder=""))

    assert _status(results, CHECK_BANK_COPY) == "FAIL"
    assert exit_code(results) == 1
    assert ACCOUNT not in format_report(results)


@pytest.mark.asyncio
async def test_ai_gateway_flag_off_fails(db_session: AsyncSession) -> None:
    await _add_pack(db_session, active=True)

    results = await run_checks(db_session, cfg=_settings(ai_gateway_enabled=False))

    assert _status(results, CHECK_AI_GATEWAY) == "FAIL"
    assert exit_code(results) == 1


@pytest.mark.asyncio
async def test_payment_gateway_disabled_warns_without_failing(db_session: AsyncSession) -> None:
    await _add_pack(db_session, active=True)

    results = await run_checks(db_session, cfg=_settings(payment_gateway_enabled=False))

    assert _status(results, CHECK_PAYMENT_GATEWAY) == "WARN"
    assert all(result.status != "FAIL" for result in results)
    assert exit_code(results) == 0
