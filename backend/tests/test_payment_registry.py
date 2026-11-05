from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from app.config import settings
from app.database import Base
from app.models.billing import PaymentAttempt
from app.services.payments.base import PaymentConfigError, ProviderUnavailable
from app.services.payments.midtrans import MidtransProvider
from app.services.payments.registry import build_provider, enabled_providers, validate_payment_config


def _cfg(**overrides: object):
    return settings.model_copy(update=overrides)


SANDBOX_KEY = "SB-Mid-server-test-123"


@pytest.fixture(autouse=True)
def _base_gateway_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "midtrans_is_production", False)
    monkeypatch.setattr(settings, "midtrans_server_key", SANDBOX_KEY)


def test_build_provider_returns_configured_adapter_with_flag_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", False)
    provider = build_provider("midtrans")
    assert isinstance(provider, MidtransProvider)
    assert provider.name == "midtrans"


def test_build_provider_checkout_rejects_configured_provider_with_flag_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", False)
    with pytest.raises(ProviderUnavailable, match="disabled"):
        build_provider("midtrans", require_checkout_enabled=True)


def test_build_provider_rejects_missing_key_with_flag_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr(settings, "midtrans_server_key", "  ")
    with pytest.raises(ProviderUnavailable, match="not configured"):
        build_provider("midtrans")


def test_build_provider_checkout_accepts_configured_provider_with_flag_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    provider = build_provider("midtrans", require_checkout_enabled=True)
    assert isinstance(provider, MidtransProvider)


def test_build_provider_rejects_unknown_with_flag_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    with pytest.raises(ProviderUnavailable, match="unknown"):
        build_provider("stripe")


def test_build_provider_rejects_unknown_with_flag_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", False)
    with pytest.raises(ProviderUnavailable, match="unknown"):
        build_provider("stripe")
    with pytest.raises(ProviderUnavailable, match="unknown"):
        build_provider("stripe", require_checkout_enabled=True)


def test_build_provider_rejects_mode_mismatched_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", False)
    monkeypatch.setattr(settings, "midtrans_is_production", True)
    with pytest.raises(ProviderUnavailable, match="not configured"):
        build_provider("midtrans")


def test_enabled_providers_filters_list(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)
    monkeypatch.setattr(settings, "payment_providers_enabled", "midtrans, unknown, ")
    providers = enabled_providers()
    assert [provider.name for provider in providers] == ["midtrans"]


def test_enabled_providers_empty_when_gateway_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "payment_gateway_enabled", False)
    monkeypatch.setattr(settings, "payment_providers_enabled", "midtrans")
    assert enabled_providers() == []


def test_config_guard_allows_gateway_off_without_key() -> None:
    validate_payment_config(_cfg(payment_gateway_enabled=False, midtrans_server_key=""))


def test_config_guard_rejects_enabled_without_key() -> None:
    with pytest.raises(PaymentConfigError, match="MIDTRANS_SERVER_KEY"):
        validate_payment_config(_cfg(payment_gateway_enabled=True, midtrans_server_key=""))


def test_config_guard_rejects_production_mode_with_sandbox_key() -> None:
    with pytest.raises(PaymentConfigError, match="sandbox"):
        validate_payment_config(
            _cfg(
                payment_gateway_enabled=True,
                midtrans_server_key="SB-Mid-server-test",
                midtrans_is_production=True,
            )
        )


def test_config_guard_rejects_sandbox_mode_with_production_key() -> None:
    with pytest.raises(PaymentConfigError, match="production"):
        validate_payment_config(
            _cfg(
                payment_gateway_enabled=True,
                midtrans_server_key="Mid-server-test",
                midtrans_is_production=False,
            )
        )


def test_payment_attempt_model_has_gateway_columns() -> None:
    columns = PaymentAttempt.__table__.columns
    expected = {
        "provider_order_id",
        "provider_payment_id",
        "provider_token",
        "checkout_url",
        "expires_at",
        "provider_status",
        "fee_idr",
        "refunded_amount_idr",
        "attempt_seq",
    }
    assert expected <= set(columns.keys())
    assert columns["provider_order_id"].type.length == 128
    assert columns["provider_token"].type.length == 512
    assert columns["checkout_url"].type.length == 512
    assert columns["provider_status"].type.length == 32
    assert columns["fee_idr"].nullable is False
    assert columns["refunded_amount_idr"].nullable is False


def test_payment_attempt_model_has_partial_unique_indexes() -> None:
    indexes = {index.name: index for index in PaymentAttempt.__table__.indexes}
    provider_order = indexes["uq_payment_attempt_provider_order"]
    pending_invoice = indexes["uq_payment_attempt_pending_invoice"]

    assert provider_order.unique is True
    assert [column.name for column in provider_order.columns] == ["provider", "provider_order_id"]
    assert provider_order.dialect_options["postgresql"]["where"] is not None
    assert provider_order.dialect_options["sqlite"]["where"] is not None

    assert pending_invoice.unique is True
    assert [column.name for column in pending_invoice.columns] == ["invoice_id"]
    assert pending_invoice.dialect_options["postgresql"]["where"] is not None
    assert pending_invoice.dialect_options["sqlite"]["where"] is not None

    # provider_ref stays non-unique: manual bank references repeat.
    provider_ref = indexes.get("ix_payment_attempts_provider_ref")
    assert provider_ref is None or provider_ref.unique is not True


def test_payment_attempt_constraints_include_fee_and_refund() -> None:
    names = {constraint.name for constraint in PaymentAttempt.__table__.constraints}
    assert {"ck_payment_attempt_fee", "ck_payment_attempt_refunded"} <= names


@pytest.mark.asyncio
async def test_payment_attempts_create_all_on_sqlite(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        rows = await conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='index' AND name IN "
            "('uq_payment_attempt_provider_order', 'uq_payment_attempt_pending_invoice')"
        )
        names = {row[0] for row in rows}
    assert names == {"uq_payment_attempt_provider_order", "uq_payment_attempt_pending_invoice"}
