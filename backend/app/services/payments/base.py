"""Provider-agnostic payment primitives.

The dataclasses in this module are the stable contract between the billing
services and every gateway adapter (Midtrans now, Xendit/Stripe later). They
intentionally carry provider ids, raw payloads, and money fields so a new
adapter does not require a schema migration.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from app.models.billing import PaymentAttempt

KINDS = frozenset(
    {
        "succeeded",
        "pending",
        "failed",
        "expired",
        "canceled",
        "refunded",
        "partially_refunded",
        "chargeback",
        "ignored",
    }
)


@dataclass(frozen=True, slots=True)
class CheckoutRequest:
    order_id: str
    amount_idr: int
    currency: str
    invoice_number: str
    description: str
    customer_email: str
    customer_name: str
    return_url: str
    cancel_url: str
    idempotency_key: str


@dataclass(frozen=True, slots=True)
class CheckoutResult:
    provider: str
    provider_order_id: str
    provider_payment_id: str | None
    provider_token: str | None
    redirect_url: str
    expires_at: datetime | None
    amount_idr: int
    currency: str
    raw: Mapping[str, object] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class NormalizedEvent:
    event_id: str
    kind: str
    provider_order_id: str | None
    provider_payment_id: str | None
    amount_idr: int
    currency: str
    fee_idr: int = 0
    refunded_amount_idr: int = 0
    method: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    raw: Mapping[str, object] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class StatusResult:
    found: bool
    event: NormalizedEvent | None = None
    error: str | None = None


class PaymentProviderError(Exception):
    """A gateway rejected or could not process a request.

    ``transient`` tells the caller whether a retry may help; ``code`` carries
    the provider/HTTP code when one is meaningful (for example Midtrans 406).
    """

    def __init__(self, message: str, *, transient: bool = False, code: int | None = None) -> None:
        super().__init__(message)
        self.transient = transient
        self.code = code


class PaymentConfigError(Exception):
    """Gateway configuration is inconsistent (missing key, wrong mode)."""


class InvalidWebhookSignature(Exception):  # noqa: N818
    """The webhook signature is missing or does not match the raw body."""


class MalformedWebhook(Exception):  # noqa: N818
    """The webhook body is not valid JSON or lacks required fields."""


class ProviderUnavailable(Exception):  # noqa: N818
    """The requested provider is unknown, disabled, or unreachable."""


class PaymentProvider(Protocol):
    name: str

    def enabled(self) -> bool: ...

    async def create_checkout(self, req: CheckoutRequest) -> CheckoutResult: ...

    async def parse_webhook(self, raw_body: bytes, headers: Mapping[str, str]) -> NormalizedEvent: ...

    async def fetch_status(self, attempt: PaymentAttempt) -> StatusResult: ...

    async def cancel(self, attempt: PaymentAttempt) -> bool: ...
