"""Read-only launch readiness check for the AI wallet top-up feature.

Run from ``backend/`` (or inside the backend container) before announcing the
top-up flow::

    python -m scripts.check_topup_ready

The command only reads settings and the ``ai_topup_packs`` table. It never
inserts, updates, or deletes a row, never calls a payment provider, and never
prints the bank account value, provider keys, or host names.

Exit code 0 means there is no blocking ``FAIL`` (``WARN`` is allowed and is a
valid launch, for example manual-transfer-only). Exit code 1 means at least one
check failed and the feature is not ready.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.config import Settings

Status = Literal["PASS", "WARN", "FAIL"]

CHECK_AI_GATEWAY = "AI_GATEWAY_ENABLED"
CHECK_ACTIVE_PACKS = "ACTIVE_TOPUP_PACKS"
CHECK_BANK_COPY = "BANK_COPY"
CHECK_PAYMENT_GATEWAY = "PAYMENT_GATEWAY_ENABLED"
CHECK_MIDTRANS = "MIDTRANS_PROVIDER"

_PACK_ADMIN_PATH = "/api/admin/ai/topup/packs"
_PACK_ADMIN_UI = "/admin/ai/packs"
_GATEWAY_PREFLIGHT = "python -m scripts.check_payment_config"


@dataclass(frozen=True, slots=True)
class CheckResult:
    check: str
    status: Status
    detail: str


def _result(check: str, status: Status, detail: str) -> CheckResult:
    return CheckResult(check=check, status=status, detail=detail)


def _ai_gateway_check(cfg: Settings) -> CheckResult:
    if not cfg.ai_gateway_enabled:
        return _result(
            CHECK_AI_GATEWAY,
            "FAIL",
            "AI_GATEWAY_ENABLED=false; customer top-up routes return 404 and the feature is unusable",
        )
    return _result(CHECK_AI_GATEWAY, "PASS", "AI_GATEWAY_ENABLED=true; customer routes are mounted")


async def _active_pack_check(db: AsyncSession) -> CheckResult:
    from sqlalchemy import func, select

    from app.models.ai_gateway import AiTopupPack

    row = (
        await db.execute(
            select(
                func.count(AiTopupPack.id).label("active_count"),
                func.min(AiTopupPack.amount_idr).label("min_amount"),
                func.max(AiTopupPack.amount_idr).label("max_amount"),
            ).where(AiTopupPack.active.is_(True))
        )
    ).one()
    count = int(row.active_count or 0)
    if count == 0:
        return _result(
            CHECK_ACTIVE_PACKS,
            "FAIL",
            f"no active pack; customers have nothing to buy (add one at {_PACK_ADMIN_UI} or POST {_PACK_ADMIN_PATH})",
        )
    min_amount = int(row.min_amount or 0)
    max_amount = int(row.max_amount or 0)
    amount_range = f"IDR {min_amount:,}" if min_amount == max_amount else f"IDR {min_amount:,}-{max_amount:,}"
    return _result(
        CHECK_ACTIVE_PACKS,
        "PASS",
        f"{count} active pack(s); amount range {amount_range}",
    )


def _bank_copy_check(cfg: Settings) -> CheckResult:
    values = {
        "name": (cfg.invoice_bank_name or "").strip(),
        "account": (cfg.invoice_bank_account or "").strip(),
        "holder": (cfg.invoice_bank_holder or "").strip(),
    }
    missing = [label for label, value in values.items() if not value]
    if missing:
        return _result(
            CHECK_BANK_COPY,
            "FAIL",
            f"missing bank copy: {', '.join(missing)}; manual transfer returns 503",
        )
    # Presence only: the account value must never reach stdout.
    return _result(CHECK_BANK_COPY, "PASS", "bank name: set, account: set, holder: set")


def _payment_gateway_check(cfg: Settings) -> CheckResult:
    if cfg.payment_gateway_enabled:
        return _result(CHECK_PAYMENT_GATEWAY, "PASS", "gateway checkout is enabled alongside manual transfer")
    return _result(
        CHECK_PAYMENT_GATEWAY,
        "WARN",
        "gateway checkout is disabled; manual bank transfer only (a valid launch)",
    )


def _midtrans_check(cfg: Settings) -> CheckResult:
    if not cfg.payment_gateway_enabled:
        return _result(
            CHECK_MIDTRANS,
            "PASS",
            "not required while PAYMENT_GATEWAY_ENABLED=false",
        )
    # Pure config preflight: no network, no mutation, and it never echoes the key.
    from app.services.payments.preflight import check_payment_config

    report = check_payment_config(cfg)
    if report.errors:
        return _result(
            CHECK_MIDTRANS,
            "WARN",
            f"gateway enabled but the Midtrans provider is not fully configured "
            f"({len(report.errors)} blocking issue(s)); run {_GATEWAY_PREFLIGHT}",
        )
    return _result(CHECK_MIDTRANS, "PASS", "Midtrans provider credentials are configured")


async def run_checks(db: AsyncSession, *, cfg: Settings | None = None) -> list[CheckResult]:
    """Return every readiness check result. Read-only: SELECT queries only."""
    from app.config import settings

    config = cfg or settings
    return [
        _ai_gateway_check(config),
        await _active_pack_check(db),
        _bank_copy_check(config),
        _payment_gateway_check(config),
        _midtrans_check(config),
    ]


def format_report(results: Sequence[CheckResult]) -> str:
    width = max((len(result.check) for result in results), default=0)
    lines = [f"{'STATUS':<6} {'CHECK':<{width}}  DETAIL"]
    for result in results:
        lines.append(f"{result.status:<6} {result.check:<{width}}  {result.detail}")
    failures = sum(1 for result in results if result.status == "FAIL")
    warnings = sum(1 for result in results if result.status == "WARN")
    lines.append("")
    lines.append(f"{failures} failure(s), {warnings} warning(s)")
    lines.append("TOP-UP READINESS: BLOCKED" if failures else "TOP-UP READINESS: OK")
    return "\n".join(lines)


def exit_code(results: Sequence[CheckResult]) -> int:
    """0 when nothing failed (warnings are allowed), 1 when any check failed."""
    return 1 if any(result.status == "FAIL" for result in results) else 0


async def _amain() -> int:
    from app.database import async_session

    async with async_session() as db:
        results = await run_checks(db)
    print(format_report(results))
    return exit_code(results)


def main() -> int:
    return asyncio.run(_amain())


if __name__ == "__main__":
    raise SystemExit(main())
