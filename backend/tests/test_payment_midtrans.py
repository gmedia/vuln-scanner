from __future__ import annotations

import base64
import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest

from app.config import settings
from app.models.billing import PaymentAttempt
from app.services.payments.base import (
    CheckoutRequest,
    InvalidWebhookSignature,
    MalformedWebhook,
    PaymentProviderError,
)
from app.services.payments.midtrans import MidtransProvider

SERVER_KEY = "SB-Mid-server-test-123"
ORDER_ID = "SX-202611-0001-A1"
INVOICE_NUMBER = "SX-202611-0001"
AMOUNT = 715_000
FIXED_NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


def _sign(order_id: str, status_code: str, gross_amount: str, key: str = SERVER_KEY) -> str:
    return hashlib.sha512(f"{order_id}{status_code}{gross_amount}{key}".encode()).hexdigest()


def _payload(
    *,
    transaction_status: str = "settlement",
    status_code: str = "200",
    fraud_status: str = "accept",
    gross_amount: str = "715000.00",
    order_id: str = ORDER_ID,
    transaction_id: str = "trx-0001",
    refund_amount: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "order_id": order_id,
        "status_code": status_code,
        "gross_amount": gross_amount,
        "transaction_status": transaction_status,
        "fraud_status": fraud_status,
        "transaction_id": transaction_id,
        "payment_type": "bank_transfer",
        "signature_key": _sign(order_id, status_code, gross_amount),
    }
    if refund_amount is not None:
        body["refund_amount"] = refund_amount
    return body


def _request() -> CheckoutRequest:
    return CheckoutRequest(
        order_id=ORDER_ID,
        amount_idr=AMOUNT,
        currency="IDR",
        invoice_number=INVOICE_NUMBER,
        description="Sinexis Scan Pro",
        customer_email="billing@example.com",
        customer_name="Example Org",
        return_url="https://sinexis.app/pay/inv-1?status=finish",
        cancel_url="https://sinexis.app/pay/inv-1?status=unfinish",
        idempotency_key="idem-1",
    )


def _provider(
    handler: Any,
    *,
    now: datetime = FIXED_NOW,
) -> MidtransProvider:
    return MidtransProvider(transport=httpx.MockTransport(handler), now=lambda: now)


def _attempt(**overrides: Any) -> PaymentAttempt:
    values: dict[str, Any] = {
        "provider": "midtrans",
        "provider_order_id": ORDER_ID,
        "amount_idr": AMOUNT,
    }
    values.update(overrides)
    return PaymentAttempt(**values)


@pytest.fixture(autouse=True)
def _midtrans_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "midtrans_server_key", SERVER_KEY)
    monkeypatch.setattr(settings, "midtrans_is_production", False)
    monkeypatch.setattr(settings, "payment_gateway_enabled", True)


@pytest.mark.asyncio
async def test_create_sends_expected_payload_and_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["headers"] = request.headers
        captured["json"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"token": "snap-token-1", "redirect_url": "https://app.sandbox.midtrans.com/snap/v4/redirection/abc"},
        )

    result = await _provider(handler).create_checkout(_request())

    assert captured["method"] == "POST"
    assert captured["url"] == "https://app.sandbox.midtrans.com/snap/v1/transactions"
    expected_auth = "Basic " + base64.b64encode(f"{SERVER_KEY}:".encode()).decode()
    assert captured["headers"]["authorization"] == expected_auth
    body = captured["json"]
    assert body["transaction_details"] == {"order_id": ORDER_ID, "gross_amount": AMOUNT}
    assert body["item_details"][0]["price"] * body["item_details"][0]["quantity"] == AMOUNT
    assert body["customer_details"] == {"first_name": "Example Org", "email": "billing@example.com"}
    assert body["callbacks"] == {
        "finish": "https://sinexis.app/pay/inv-1?status=finish",
        "unfinish": "https://sinexis.app/pay/inv-1?status=unfinish",
        "error": "https://sinexis.app/pay/inv-1?status=unfinish",
    }
    assert body["expiry"] == {"unit": "hours", "duration": 24}
    assert result.provider == "midtrans"
    assert result.provider_order_id == ORDER_ID
    assert result.provider_token == "snap-token-1"
    assert result.redirect_url == "https://app.sandbox.midtrans.com/snap/v4/redirection/abc"
    assert result.expires_at == FIXED_NOW + timedelta(hours=24)
    assert result.amount_idr == AMOUNT


@pytest.mark.asyncio
async def test_create_truncates_first_name_to_50_and_falls_back_to_invoice() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["json"] = json.loads(request.content)
        return httpx.Response(200, json={"token": "t", "redirect_url": "https://example.com/r"})

    req = _request()
    long_name = "A" * 60
    from dataclasses import replace

    await _provider(handler).create_checkout(replace(req, customer_name=long_name))
    assert len(captured["json"]["customer_details"]["first_name"]) == 50

    await _provider(handler).create_checkout(replace(req, customer_name="   "))
    assert captured["json"]["customer_details"]["first_name"] == INVOICE_NUMBER


@pytest.mark.asyncio
async def test_create_rejects_blank_email() -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - must not run
        raise AssertionError("Snap must not be called without an email")

    from dataclasses import replace

    with pytest.raises(PaymentProviderError, match="email"):
        await _provider(handler).create_checkout(replace(_request(), customer_email="  "))


@pytest.mark.asyncio
@pytest.mark.parametrize("order_id", ["A" * 51, "SX 202611", "SX/202611"])
async def test_create_validates_order_id(order_id: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - must not run
        raise AssertionError("Snap must not be called with an invalid order id")

    from dataclasses import replace

    with pytest.raises(PaymentProviderError, match="order_id"):
        await _provider(handler).create_checkout(replace(_request(), order_id=order_id))


@pytest.mark.asyncio
async def test_create_maps_406_to_duplicate_order_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(406, json={"error_messages": ["order_id has already been taken"]})

    with pytest.raises(PaymentProviderError) as excinfo:
        await _provider(handler).create_checkout(_request())
    assert excinfo.value.code == 406
    assert excinfo.value.transient is False
    assert "duplicate" in str(excinfo.value)


@pytest.mark.asyncio
async def test_valid_signature_and_settlement_maps_to_succeeded() -> None:
    body = _payload()
    event = await _provider(lambda request: httpx.Response(200)).parse_webhook(json.dumps(body).encode(), {})
    assert event.kind == "succeeded"
    assert event.event_id == "trx-0001:settlement:200:accept"
    assert event.provider_order_id == ORDER_ID
    assert event.provider_payment_id == "trx-0001"
    assert event.amount_idr == AMOUNT
    assert event.method == "bank_transfer"


@pytest.mark.asyncio
async def test_signature_is_computed_over_raw_gross_amount() -> None:
    provider = _provider(lambda request: httpx.Response(200))
    raw_body = json.dumps(_payload(gross_amount="715000.00")).encode()
    event = await provider.parse_webhook(raw_body, {})
    assert event.amount_idr == AMOUNT

    reformatted = _payload(gross_amount="715000.00")
    reformatted["gross_amount"] = "715000"
    with pytest.raises(InvalidWebhookSignature):
        await provider.parse_webhook(json.dumps(reformatted).encode(), {})


@pytest.mark.asyncio
async def test_invalid_tampered_and_missing_signatures_are_rejected() -> None:
    provider = _provider(lambda request: httpx.Response(200))
    bad = _payload()
    bad["signature_key"] = "0" * 128
    with pytest.raises(InvalidWebhookSignature):
        await provider.parse_webhook(json.dumps(bad).encode(), {})

    tampered = _payload(gross_amount="715000.00")
    tampered["gross_amount"] = "714999.00"
    with pytest.raises(InvalidWebhookSignature):
        await provider.parse_webhook(json.dumps(tampered).encode(), {})

    missing = _payload()
    del missing["signature_key"]
    with pytest.raises(InvalidWebhookSignature):
        await provider.parse_webhook(json.dumps(missing).encode(), {})


@pytest.mark.asyncio
async def test_malformed_json_is_rejected() -> None:
    with pytest.raises(MalformedWebhook):
        await _provider(lambda request: httpx.Response(200)).parse_webhook(b"{not-json", {})


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("transaction_status", "status_code", "fraud_status", "expected"),
    [
        ("capture", "200", "accept", "succeeded"),
        ("capture", "200", "", "succeeded"),
        ("capture", "201", "accept", "ignored"),
        ("capture", "200", "challenge", "pending"),
        ("settlement", "200", "accept", "succeeded"),
        ("settlement", "201", "accept", "ignored"),
        ("pending", "201", "accept", "pending"),
        ("PENDING", "201", "accept", "pending"),
        ("authorize", "200", "accept", "pending"),
        ("authorized", "200", "accept", "pending"),
        ("deny", "200", "accept", "failed"),
        ("cancel", "200", "accept", "failed"),
        ("failure", "200", "accept", "failed"),
        ("expire", "200", "accept", "expired"),
        ("refund", "200", "accept", "refunded"),
        ("partial_refund", "200", "accept", "partially_refunded"),
        ("chargeback", "200", "accept", "chargeback"),
        ("partial_chargeback", "200", "accept", "chargeback"),
        ("something_new", "200", "accept", "ignored"),
    ],
)
async def test_status_mapping(
    transaction_status: str,
    status_code: str,
    fraud_status: str,
    expected: str,
) -> None:
    body = _payload(
        transaction_status=transaction_status,
        status_code=status_code,
        fraud_status=fraud_status,
    )
    event = await _provider(lambda request: httpx.Response(200)).parse_webhook(json.dumps(body).encode(), {})
    assert event.kind == expected


@pytest.mark.asyncio
async def test_amount_is_integer_rupiah_and_mismatch_is_preserved() -> None:
    provider = _provider(lambda request: httpx.Response(200))
    body = _payload(gross_amount="714999.00")
    event = await provider.parse_webhook(json.dumps(body).encode(), {})
    assert event.amount_idr == 714_999

    fractional = _payload(gross_amount="715000.5")
    with pytest.raises(MalformedWebhook):
        await provider.parse_webhook(json.dumps(fractional).encode(), {})


@pytest.mark.asyncio
async def test_refund_amount_is_captured() -> None:
    body = _payload(transaction_status="partial_refund", refund_amount="100000.00")
    event = await _provider(lambda request: httpx.Response(200)).parse_webhook(json.dumps(body).encode(), {})
    assert event.kind == "partially_refunded"
    assert event.refunded_amount_idr == 100_000


@pytest.mark.asyncio
async def test_fetch_status_200_maps_event_and_verifies_amount() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers["authorization"]
        return httpx.Response(200, json=_payload(transaction_status="settlement"))

    result = await _provider(handler).fetch_status(_attempt())

    assert result.found is True
    assert result.error is None
    assert result.event is not None
    assert result.event.kind == "succeeded"
    assert result.event.amount_idr == AMOUNT
    assert captured["url"] == f"https://api.sandbox.midtrans.com/v2/{ORDER_ID}/status"
    assert captured["auth"] == "Basic " + base64.b64encode(f"{SERVER_KEY}:".encode()).decode()


@pytest.mark.asyncio
async def test_fetch_status_amount_mismatch_returns_failed_event() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_payload(gross_amount="714999.00"))

    result = await _provider(handler).fetch_status(_attempt())

    assert result.found is True
    assert result.error == "amount mismatch"
    assert result.event is not None
    assert result.event.kind == "failed"
    assert result.event.failure_code == "amount_mismatch"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "expected_error"),
    [(404, None), (500, "Midtrans status failed (500)")],
)
async def test_fetch_status_404_and_5xx_do_not_raise(status_code: int, expected_error: str | None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={})

    result = await _provider(handler).fetch_status(_attempt())
    assert result.found is False
    assert result.event is None
    assert result.error == expected_error


@pytest.mark.asyncio
async def test_fetch_status_timeout_returns_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    result = await _provider(handler).fetch_status(_attempt())
    assert result.found is False
    assert result.event is None
    assert result.error == "Midtrans status request failed"


@pytest.mark.asyncio
async def test_cancel_uses_snap_token_and_raw_server_key_header() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["auth"] = request.headers["authorization"]
        return httpx.Response(200, json={"canceled_at": "2026-11-04T12:00:00Z"})

    cancelled = await _provider(handler).cancel(_attempt(provider_token="snap-token-1"))

    assert cancelled is True
    assert captured["method"] == "POST"
    assert captured["url"] == ("https://app.sandbox.midtrans.com/snap/v1/transactions/snap-token-1/cancel")
    # Snap cancel documents the raw server key, unlike create/status Basic auth.
    assert captured["auth"] == SERVER_KEY


@pytest.mark.asyncio
async def test_cancel_without_token_is_local_only() -> None:
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - must not run
        raise AssertionError("cancel must not call Snap without a token")

    assert await _provider(handler).cancel(_attempt(provider_token=None)) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [404, 412])
async def test_cancel_terminal_states_return_false(status_code: int) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={})

    assert await _provider(handler).cancel(_attempt(provider_token="snap-token-1")) is False
