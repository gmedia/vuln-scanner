"""Pure payment gateway configuration preflight.

Takes a :class:`Settings` value and returns operator-facing findings. It never
mutates the config, reads the environment, touches the database, or calls the
network. The startup guard in ``registry.validate_payment_config`` refuses three
inconsistent states; this preflight is a superset that reports every problem at
once instead of raising on the first one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.config import Settings

Level = Literal["error", "warning", "ok"]

_SUPPORTED_PROVIDERS = frozenset({"midtrans"})
_PROVIDER_LIST_ENV = "PAYMENT_PROVIDERS_ENABLED"


@dataclass(frozen=True, slots=True)
class Finding:
    level: Level
    message: str


@dataclass(frozen=True, slots=True)
class PreflightReport:
    findings: tuple[Finding, ...]

    @property
    def errors(self) -> tuple[Finding, ...]:
        return tuple(finding for finding in self.findings if finding.level == "error")

    @property
    def warnings(self) -> tuple[Finding, ...]:
        return tuple(finding for finding in self.findings if finding.level == "warning")

    @property
    def ok(self) -> bool:
        """True when the configuration has no blocking errors."""
        return not self.errors


def _error(message: str) -> Finding:
    return Finding(level="error", message=message)


def _warning(message: str) -> Finding:
    return Finding(level="warning", message=message)


def _ok(message: str) -> Finding:
    return Finding(level="ok", message=message)


def _parse_providers(raw: str) -> tuple[str, ...]:
    """Split, trim, lowercase, drop empties, and de-duplicate while keeping order."""
    parts = (part.strip().lower() for part in (raw or "").split(","))
    return tuple(dict.fromkeys(part for part in parts if part))


def check_payment_config(cfg: Settings) -> PreflightReport:
    """Return every finding for ``cfg`` without touching external state."""
    errors: list[Finding] = []
    warnings: list[Finding] = []

    enabled = cfg.payment_gateway_enabled
    key = (cfg.midtrans_server_key or "").strip()
    providers = _parse_providers(cfg.payment_providers_enabled)
    production = cfg.midtrans_is_production
    frontend_url = (cfg.frontend_url or "").strip()

    # Rules 1-3 only matter when the gateway is switched on. Providers set while
    # the gateway is off are a warning (rule 7), never an error.
    if enabled:
        if not key:
            errors.append(_error("PAYMENT_GATEWAY_ENABLED=true requires MIDTRANS_SERVER_KEY"))
        if not providers:
            errors.append(_error(f"{_PROVIDER_LIST_ENV} is empty while PAYMENT_GATEWAY_ENABLED=true"))
        for name in providers:
            if name not in _SUPPORTED_PROVIDERS:
                errors.append(_error(f"{_PROVIDER_LIST_ENV} contains an unknown provider: {name}"))
    elif providers:
        warnings.append(
            _warning(
                f"{_PROVIDER_LIST_ENV} is set while PAYMENT_GATEWAY_ENABLED=false; the gateway stays off"
            )
        )

    # Rules 4-6 are key/mode sanity checks. They run even when the gateway is off,
    # but only when a key is configured. Messages never contain the key itself.
    if key:
        if production and key.startswith("SB-Mid-"):
            errors.append(_error("MIDTRANS_IS_PRODUCTION=true but the configured key is a sandbox key"))
        if not production and key.startswith("Mid-") and not key.startswith("SB-Mid-"):
            errors.append(_error("MIDTRANS_IS_PRODUCTION=false but the configured key is a production key"))
        if production and not frontend_url.startswith("https://"):
            errors.append(_error("MIDTRANS_IS_PRODUCTION=true requires FRONTEND_URL to start with https://"))

    if enabled:
        if not cfg.midtrans_verify_status:
            warnings.append(
                _warning(
                    "PAYMENT_GATEWAY_ENABLED=true but MIDTRANS_VERIFY_STATUS=false; "
                    "settlements are not verified"
                )
            )
        if not production:
            warnings.append(
                _warning("PAYMENT_GATEWAY_ENABLED=true while MIDTRANS_IS_PRODUCTION=false (sandbox mode)")
            )
        if not frontend_url or frontend_url.startswith(("http://localhost", "http://127.0.0.1")):
            warnings.append(
                _warning(
                    "PAYMENT_GATEWAY_ENABLED=true but FRONTEND_URL points at localhost or is empty; "
                    "provider redirects will fail"
                )
            )

    if not enabled:
        findings = [
            _ok("Manual bank transfer is the active payment path; the gateway is off"),
        ]
    elif errors:
        findings = []
    else:
        mode = "production" if production else "sandbox"
        findings = [
            _ok(
                "Gateway configuration is consistent; "
                f"providers: {', '.join(providers)}; mode: {mode}"
            )
        ]

    return PreflightReport(findings=tuple(errors + warnings + findings))
