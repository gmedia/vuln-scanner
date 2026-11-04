"""Provider registry and startup configuration guard."""

from __future__ import annotations

from app.config import Settings, settings
from app.services.payments.base import PaymentConfigError, PaymentProvider, ProviderUnavailable
from app.services.payments.midtrans import MidtransProvider

_FACTORIES = {
    "midtrans": MidtransProvider,
}


def build_provider(name: str) -> PaymentProvider:
    factory = _FACTORIES.get((name or "").strip().lower())
    if factory is None:
        raise ProviderUnavailable(f"unknown payment provider: {name}")
    provider = factory()
    if not provider.enabled():
        raise ProviderUnavailable(f"payment provider is disabled: {name}")
    return provider


def enabled_providers(config: Settings | None = None) -> list[PaymentProvider]:
    cfg = config or settings
    names = [part.strip().lower() for part in (cfg.payment_providers_enabled or "").split(",") if part.strip()]
    providers: list[PaymentProvider] = []
    for name in names:
        factory = _FACTORIES.get(name)
        if factory is None:
            continue
        provider = factory()
        if provider.enabled():
            providers.append(provider)
    return providers


def validate_payment_config(config: Settings | None = None) -> None:
    """Refuse an inconsistent gateway configuration at startup.

    The gateway being off is always valid: manual bank transfer is the default
    path and must keep working without any Midtrans env.
    """
    cfg = config or settings
    key = (cfg.midtrans_server_key or "").strip()
    if not cfg.payment_gateway_enabled:
        return
    if not key:
        raise PaymentConfigError("PAYMENT_GATEWAY_ENABLED=true requires MIDTRANS_SERVER_KEY")
    if cfg.midtrans_is_production and key.startswith("SB-Mid-"):
        raise PaymentConfigError("MIDTRANS_IS_PRODUCTION=true but MIDTRANS_SERVER_KEY is a sandbox key")
    if not cfg.midtrans_is_production and key.startswith("Mid-"):
        raise PaymentConfigError("MIDTRANS_IS_PRODUCTION=false but MIDTRANS_SERVER_KEY is a production key")
