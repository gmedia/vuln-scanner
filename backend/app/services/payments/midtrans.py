"""Midtrans Snap adapter (redirect flow only).

No Snap.js, no card data, no client key: the SPA navigates to the provider
redirect URL and the webhook is the only thing that may mark an invoice paid.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
from collections.abc import Callable, Mapping
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation

import httpx

from app.config import settings
from app.models.billing import PaymentAttempt
from app.services.payments.base import (
    CheckoutRequest,
    CheckoutResult,
    InvalidWebhookSignature,
    MalformedWebhook,
    NormalizedEvent,
    PaymentConfigError,
    PaymentProviderError,
    ProviderUnavailable,
    StatusResult,
)

_ORDER_ID_RE = re.compile(r"[A-Za-z0-9._~-]{1,50}")
_EXPIRY_HOURS = 24
_STATUS_TIMEOUT_SECONDS = 10.0
_CREATE_TIMEOUT_SECONDS = 15.0
_CANCEL_TIMEOUT_SECONDS = 10.0

# ``transaction_status`` values documented by Midtrans. Anything outside the
# map normalizes to ``ignored`` so a new provider value never activates a paid
# invoice by accident.
_PENDING_STATUSES = frozenset({"pending", "authorize", "authorized"})
_FAILED_STATUSES = frozenset({"deny", "cancel", "failure"})
_REFUND_STATUSES = {"refund": "refunded", "partial_refund": "partially_refunded"}
_CHARGEBACK_STATUSES = frozenset({"chargeback", "partial_chargeback"})


def _basic_auth(server_key: str) -> str:
    """Midtrans Basic auth: base64(server_key + \"\")."""
    return "Basic " + base64.b64encode(f"{server_key}:".encode()).decode()


def _raw_string(data: Mapping[str, object], key: str) -> str:
    """Return the field exactly as it appeared in the JSON body.

    Midtrans signs the raw strings from the notification, so an ``int`` is
    converted to its decimal form and everything else stays untouched.
    """
    value = data.get(key)
    if isinstance(value, str):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        return str(value)
    return ""


def _parse_idr(raw: str, field_name: str) -> int:
    try:
        value = Decimal(raw)
    except (InvalidOperation, ValueError) as exc:
        raise MalformedWebhook(f"invalid {field_name}") from exc
    if not value.is_finite() or value != value.to_integral_value():
        raise MalformedWebhook(f"invalid {field_name}")
    return int(value)


def _map_kind(transaction_status: str, status_code: str, fraud_status: str) -> str:
    """Map a Midtrans notification to the normalized event kind (spec §3)."""
    if transaction_status == "capture":
        if status_code == "200" and fraud_status in ("", "accept"):
            return "succeeded"
        if fraud_status == "challenge":
            return "pending"
        return "ignored"
    if transaction_status == "settlement":
        return "succeeded" if status_code == "200" else "ignored"
    if transaction_status in _PENDING_STATUSES:
        return "pending"
    if transaction_status in _FAILED_STATUSES:
        return "failed"
    if transaction_status == "expire":
        return "expired"
    if transaction_status in _REFUND_STATUSES:
        return _REFUND_STATUSES[transaction_status]
    if transaction_status in _CHARGEBACK_STATUSES:
        return "chargeback"
    return "ignored"


class MidtransProvider:
    name = "midtrans"

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        client: httpx.AsyncClient | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._transport = transport
        self._client = client
        self._now = now or (lambda: datetime.now(UTC))

    @property
    def _snap_base(self) -> str:
        return "https://app.midtrans.com" if settings.midtrans_is_production else "https://app.sandbox.midtrans.com"

    @property
    def _api_base(self) -> str:
        return "https://api.midtrans.com" if settings.midtrans_is_production else "https://api.sandbox.midtrans.com"

    def _server_key(self) -> str:
        key = (settings.midtrans_server_key or "").strip()
        if not key:
            raise PaymentConfigError("MIDTRANS_SERVER_KEY is not configured")
        return key

    async def _request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        json_body: Mapping[str, object] | None = None,
        timeout: float,
    ) -> httpx.Response:
        if self._client is not None:
            return await self._client.request(method, url, headers=headers, json=json_body, timeout=timeout)
        async with httpx.AsyncClient(transport=self._transport, timeout=timeout) as client:
            return await client.request(method, url, headers=headers, json=json_body)

    def configured(self) -> bool:
        key = (settings.midtrans_server_key or "").strip()
        if not key:
            return False
        if settings.midtrans_is_production and key.startswith("SB-Mid-"):
            return False
        return not (
            not settings.midtrans_is_production and key.startswith("Mid-") and not key.startswith("SB-Mid-")
        )

    def enabled(self) -> bool:
        return self.configured() and bool(settings.payment_gateway_enabled)

    async def create_checkout(self, req: CheckoutRequest) -> CheckoutResult:
        if not _ORDER_ID_RE.fullmatch(req.order_id):
            raise PaymentProviderError("order_id must be <= 50 chars and match [A-Za-z0-9._~-]")
        email = (req.customer_email or "").strip()
        if not email:
            raise PaymentProviderError("customer email is required before calling Snap")

        first_name = (req.customer_name or "").strip()[:50] or req.invoice_number[:50]
        payload: dict[str, object] = {
            "transaction_details": {"order_id": req.order_id, "gross_amount": req.amount_idr},
            "item_details": [
                {
                    "id": req.invoice_number,
                    "price": req.amount_idr,
                    "quantity": 1,
                    "name": req.description or req.invoice_number,
                }
            ],
            "customer_details": {"first_name": first_name, "email": email},
            "callbacks": {
                "finish": req.return_url,
                "unfinish": req.cancel_url,
                "error": req.cancel_url,
            },
            "expiry": {"unit": "hours", "duration": _EXPIRY_HOURS},
        }
        headers = {
            "Authorization": _basic_auth(self._server_key()),
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        try:
            resp = await self._request(
                "POST",
                f"{self._snap_base}/snap/v1/transactions",
                headers=headers,
                json_body=payload,
                timeout=_CREATE_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as exc:
            raise ProviderUnavailable("Midtrans create request failed") from exc

        if resp.status_code == 406:
            raise PaymentProviderError("duplicate order id", transient=False, code=406)
        if not resp.is_success:
            raise PaymentProviderError(
                f"Midtrans create failed ({resp.status_code})",
                transient=resp.status_code >= 500 or resp.status_code == 429,
                code=resp.status_code,
            )

        body = self._json_dict(resp, "create")
        token = body.get("token")
        redirect_url = body.get("redirect_url")
        if not isinstance(token, str) or not token or not isinstance(redirect_url, str) or not redirect_url:
            raise PaymentProviderError("Midtrans create response is missing token/redirect_url")

        return CheckoutResult(
            provider=self.name,
            provider_order_id=req.order_id,
            provider_payment_id=None,
            provider_token=token,
            redirect_url=redirect_url,
            expires_at=self._now() + timedelta(hours=_EXPIRY_HOURS),
            amount_idr=req.amount_idr,
            currency=req.currency,
            raw=body,
        )

    async def parse_webhook(self, raw_body: bytes, headers: Mapping[str, str]) -> NormalizedEvent:
        del headers  # Midtrans signs the body, not a header.
        try:
            decoded = json.loads(raw_body)
        except (ValueError, UnicodeDecodeError) as exc:
            raise MalformedWebhook("webhook body is not valid JSON") from exc
        if not isinstance(decoded, dict):
            raise MalformedWebhook("webhook body must be a JSON object")
        data: dict[str, object] = decoded

        order_id = _raw_string(data, "order_id")
        status_code = _raw_string(data, "status_code")
        gross_amount = _raw_string(data, "gross_amount")
        signature = data.get("signature_key")
        if not order_id or not status_code or not gross_amount:
            raise InvalidWebhookSignature("webhook is missing signed fields")
        if not isinstance(signature, str) or not signature.strip():
            raise InvalidWebhookSignature("missing signature_key")

        expected = hashlib.sha512(f"{order_id}{status_code}{gross_amount}{self._server_key()}".encode()).hexdigest()
        if not hmac.compare_digest(signature.strip().lower(), expected):
            raise InvalidWebhookSignature("invalid signature_key")

        return self._event_from_payload(data, event_id=self._event_id(data, order_id))

    async def fetch_status(self, attempt: PaymentAttempt) -> StatusResult:
        order_id = (attempt.provider_order_id or attempt.provider_ref or "").strip()
        if not order_id:
            return StatusResult(found=False, event=None, error="attempt has no provider order id")

        headers = {"Authorization": _basic_auth(self._server_key()), "Accept": "application/json"}
        try:
            resp = await self._request(
                "GET",
                f"{self._api_base}/v2/{order_id}/status",
                headers=headers,
                timeout=_STATUS_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError:
            return StatusResult(found=False, event=None, error="Midtrans status request failed")

        if resp.status_code == 404:
            return StatusResult(found=False, event=None, error=None)
        if resp.status_code >= 500:
            return StatusResult(found=False, event=None, error=f"Midtrans status failed ({resp.status_code})")
        if not resp.is_success:
            return StatusResult(found=False, event=None, error=f"Midtrans status failed ({resp.status_code})")

        try:
            decoded = resp.json()
        except ValueError:
            return StatusResult(found=False, event=None, error="Midtrans returned non-JSON")
        if not isinstance(decoded, dict):
            return StatusResult(found=False, event=None, error="Midtrans returned unexpected payload")
        data: dict[str, object] = decoded

        try:
            event = self._event_from_payload(data, event_id=self._event_id(data, order_id))
        except MalformedWebhook:
            return StatusResult(found=False, event=None, error="Midtrans returned an invalid amount")

        if event.amount_idr != attempt.amount_idr:
            failed = replace(
                event,
                kind="failed",
                failure_code="amount_mismatch",
                failure_message="provider amount does not match the attempt",
            )
            return StatusResult(found=True, event=failed, error="amount mismatch")
        return StatusResult(found=True, event=event)

    async def cancel(self, attempt: PaymentAttempt) -> bool:
        token = (attempt.provider_token or "").strip()
        if not token:
            # Nothing was created at the provider; the caller can expire locally.
            return False

        # Midtrans documents the Snap cancel endpoint with the *raw* server key
        # in Authorization (docs.midtrans.com/reference/cancel-a-snap-session),
        # unlike create/status which use Basic base64(server_key + ":").
        headers = {
            "Authorization": self._server_key(),
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        try:
            resp = await self._request(
                "POST",
                f"{self._snap_base}/snap/v1/transactions/{token}/cancel",
                headers=headers,
                timeout=_CANCEL_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as exc:
            raise ProviderUnavailable("Midtrans cancel request failed") from exc

        if resp.status_code in (200, 201):
            return True
        if resp.status_code in (404, 412):
            return False
        raise ProviderUnavailable(f"Midtrans cancel failed ({resp.status_code})")

    @staticmethod
    def _json_dict(resp: httpx.Response, operation: str) -> dict[str, object]:
        try:
            decoded = resp.json()
        except ValueError as exc:
            raise PaymentProviderError(f"Midtrans {operation} returned non-JSON") from exc
        if not isinstance(decoded, dict):
            raise PaymentProviderError(f"Midtrans {operation} returned unexpected payload")
        return decoded

    @staticmethod
    def _event_id(data: Mapping[str, object], order_id: str) -> str:
        transaction_id = data.get("transaction_id")
        transaction_status = _raw_string(data, "transaction_status").lower()
        status_code = _raw_string(data, "status_code")
        fraud_status = _raw_string(data, "fraud_status").lower()
        if isinstance(transaction_id, str) and transaction_id:
            return f"{transaction_id}:{transaction_status}:{status_code}:{fraud_status}"
        return order_id

    def _event_from_payload(self, data: Mapping[str, object], *, event_id: str) -> NormalizedEvent:
        transaction_status = _raw_string(data, "transaction_status").lower()
        status_code = _raw_string(data, "status_code")
        fraud_status = _raw_string(data, "fraud_status").lower()
        gross_amount = _raw_string(data, "gross_amount")
        amount_idr = _parse_idr(gross_amount, "gross_amount")

        refunded_amount_idr = 0
        refund_raw = _raw_string(data, "refund_amount")
        if refund_raw:
            refunded_amount_idr = _parse_idr(refund_raw, "refund_amount")

        transaction_id = data.get("transaction_id")
        payment_type = data.get("payment_type")
        kind = _map_kind(transaction_status, status_code, fraud_status)

        failure_code: str | None = None
        failure_message: str | None = None
        if kind == "failed":
            failure_code = status_code or None
            message = data.get("status_message")
            failure_message = message if isinstance(message, str) and message else None

        return NormalizedEvent(
            event_id=event_id,
            kind=kind,
            provider_order_id=_raw_string(data, "order_id") or None,
            provider_payment_id=transaction_id if isinstance(transaction_id, str) and transaction_id else None,
            amount_idr=amount_idr,
            currency="IDR",
            fee_idr=0,
            refunded_amount_idr=refunded_amount_idr,
            method=payment_type if isinstance(payment_type, str) and payment_type else None,
            failure_code=failure_code,
            failure_message=failure_message,
            raw=data,
        )
