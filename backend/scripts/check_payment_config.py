"""Operator preflight for the Midtrans gateway configuration.

Run inside the backend container before flipping ``PAYMENT_GATEWAY_ENABLED``:

    python -m scripts.check_payment_config

Exit code 0 means there are no blocking errors (warnings are informational);
exit code 1 means at least one error must be fixed before enabling the gateway.
"""

from __future__ import annotations

import os

_LABELS = {"error": "ERROR", "warning": "WARN", "ok": "OK"}
_DB_IMPORT_DEFAULTS = {
    # ``app.config`` reads DATABASE_URL in the Settings class body, so importing
    # it in a bare operator shell would raise before any payment check runs. The
    # preflight never opens a connection; only fill values that are absent.
    "DATABASE_URL": "postgresql+asyncpg://localhost/vuln_scanner",
    "DATABASE_URL_SYNC": "postgresql://localhost/vuln_scanner",
}


def main() -> int:
    # Imported inside main so importing this module never parses the environment.
    for name, value in _DB_IMPORT_DEFAULTS.items():
        os.environ.setdefault(name, value)
    from app.config import settings
    from app.services.payments.preflight import check_payment_config

    report = check_payment_config(settings)
    for finding in report.findings:
        print(f"{_LABELS[finding.level]:<7}{finding.message}")

    print(f"\n{len(report.errors)} error(s), {len(report.warnings)} warning(s)")
    print("PAYMENT CONFIG: OK" if report.ok else "PAYMENT CONFIG: BLOCKED")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
