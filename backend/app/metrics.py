from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from typing import TYPE_CHECKING

from prometheus_client.core import Counter, GaugeMetricFamily, Metric
from prometheus_client.registry import REGISTRY

if TYPE_CHECKING:
    from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

AUTO_FAIL_REDIS_KEYS = {
    "pending": "metrics:maintenance:auto_failed:pending",
    "running": "metrics:maintenance:auto_failed:running",
}

_FX_RATE_AGE_NAME = "vuln_ai_fx_rate_age_days"
_SHORTFALL_NAME = "vuln_ai_usage_shortfall_idr_24h"
_LEDGER_DRIFT_NAME = "vuln_ai_wallet_ledger_drift_idr"
STALE_OPEN_RESERVATIONS_NAME = "vuln_ai_stale_open_reservations"
_UPSTREAM_BREAKERS_OPEN_NAME = "vuln_ai_upstream_breakers_open"
_PROVIDERS_DEGRADED_NAME = "vuln_ai_providers_degraded"
_PROVIDERS_PROBE_AGE_NAME = "vuln_ai_providers_probe_age_seconds"
_PROVIDERS_NEVER_PROBED_NAME = "vuln_ai_providers_never_probed"

_PAYMENT_PENDING_ATTEMPTS_NAME = "vuln_payment_pending_attempts"
_PAYMENT_PENDING_AGE_NAME = "vuln_payment_pending_age_seconds"
_PAYMENT_FAILED_EVENTS_NAME = "vuln_payment_failed_events_24h"
_PAYMENT_AMOUNT_MISMATCH_NAME = "vuln_payment_amount_mismatches_24h"
_PAYMENT_DUPLICATE_SETTLEMENT_NAME = "vuln_payment_duplicate_settlements_24h"
_PAYMENT_REFUNDS_NAME = "vuln_payment_refunds_24h"

_AI_TOPUP_ORDERS_TOTAL_NAME = "vuln_ai_topup_orders_total"
_AI_TOPUP_PENDING_AGE_NAME = "vuln_ai_topup_pending_age_seconds"
_AI_TOPUP_PENDING_OVERDUE_NAME = "vuln_ai_topup_pending_overdue_total"
_AI_TOPUP_AWAITING_VERIFICATION_NAME = "vuln_ai_topup_awaiting_verification_total"
_AI_TOPUP_REFUND_REVIEW_NAME = "vuln_ai_topup_refund_review_total"
_AI_TOPUP_WEBHOOK_FAILED_NAME = "vuln_ai_topup_webhook_failed_total"

# A failed top-up webhook is a payment that did not credit the wallet. A rolling
# 24h window mirrors `vuln_payment_failed_events_24h`; the rows are retained far
# longer, so the window only decides how long one failure keeps paging.
AI_TOPUP_WEBHOOK_FAILED_WINDOW_HOURS = 24

_PROMO_DISCOUNT_24H_NAME = "vuln_promo_discount_idr_24h"
_PROMO_DISCOUNT_30D_NAME = "vuln_promo_discount_idr_30d"
_PROMO_REDEMPTIONS_24H_NAME = "vuln_promo_redemptions_24h"
_PROMO_PENDING_APPROVALS_NAME = "vuln_promo_pending_approvals"

# Mirrors workers/tasks/ai_reservations.STALE_RESERVATION_MINUTES; kept local so metrics never imports the worker.
STALE_RESERVATION_MINUTES = 20
# Also local by the same rule; documents the 15-minute VulnScannerAiProviderProbeStale threshold.
PROBE_STALE_THRESHOLD_SECONDS = 900

_collector_registered = False

_UPSTREAM_ATTEMPTS = Counter(
    "vuln_ai_upstream_attempts_total",
    "AI gateway upstream attempts by outcome (served/retried/failed/rejected) and reason",
    ["model", "outcome", "reason"],
)


def record_upstream_attempt(*, model: str, outcome: str, reason: str) -> None:
    """Count one upstream attempt. Never raises: metrics must not break a billed request."""
    try:
        _UPSTREAM_ATTEMPTS.labels(model=model, outcome=outcome, reason=reason).inc()
    except Exception:
        logger.debug("ai upstream attempt metric increment failed", exc_info=True)


def _read_auto_fail_counts() -> dict[str, int]:
    counts = {"pending": 0, "running": 0}
    try:
        import redis

        from app.config import settings

        r = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=2, decode_responses=True)
        try:
            for status, key in AUTO_FAIL_REDIS_KEYS.items():
                raw = r.get(key)
                if raw is not None:
                    counts[status] = int(raw)
        finally:
            r.close()
    except Exception as e:
        logger.debug("auto-fail metric scrape failed: %s", e)
    return counts


@lru_cache(maxsize=1)
def _ai_engine() -> Engine:
    """One sync engine for metric reads; built lazily so a missing DB at import time cannot crash the app."""
    from sqlalchemy import create_engine

    from app.config import settings

    url = settings.database_url_sync
    connect_args: dict[str, object] = {}
    # SQLite's DBAPI does not accept connect_timeout; keep tests on sqlite working.
    if not url.startswith("sqlite"):
        connect_args["connect_timeout"] = 2
    return create_engine(url, pool_pre_ping=True, connect_args=connect_args)


def _as_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC).date() if value.tzinfo is not None else value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _as_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)
    return None


def _read_ai_fx_rate_age_days() -> float | None:
    """Age in whole days of the newest stored USD->IDR rate; +Inf when the table has no row, None on failure."""
    try:
        from sqlalchemy import text

        today = datetime.now(UTC).date()
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT MAX(effective_date) FROM ai_fx_rates "
                    "WHERE base = :base AND quote = :quote AND effective_date <= :today"
                ),
                {"base": "USD", "quote": "IDR", "today": today},
            ).scalar()
        if raw is None:
            return float("inf")
        effective = _as_date(raw)
        if effective is None:
            return None
        return float((today - effective).days)
    except Exception as e:
        logger.debug("ai fx rate metric scrape failed: %s", e)
        return None


def _read_ai_shortfall_idr_24h() -> float | None:
    """IDR billed but not collected over the last 24h; None on failure."""
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(hours=24)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COALESCE(SUM(shortfall_idr), 0) FROM ai_usage_events WHERE created_at >= :cutoff"),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai shortfall metric scrape failed: %s", e)
        return None


def _read_ai_wallet_ledger_drift_idr() -> float | None:
    """Largest gap between a wallet balance and its ledger sum; 0.0 when consistent, None on failure."""
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT COALESCE(MAX(ABS(w.balance_idr - COALESCE(l.total, 0))), 0) "
                    "FROM ai_wallets w "
                    "LEFT JOIN ("
                    "SELECT organization_id, SUM(delta_idr) AS total "
                    "FROM ai_wallet_ledger "
                    "GROUP BY organization_id"
                    ") l ON l.organization_id = w.organization_id"
                )
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai wallet ledger drift metric scrape failed: %s", e)
        return None


def _read_ai_stale_open_reservations() -> float | None:
    """Open AI reservations older than the reaper threshold; None on failure."""
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(minutes=STALE_RESERVATION_MINUTES)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COUNT(*) FROM ai_reservations WHERE status = 'open' AND created_at < :cutoff"),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai stale reservations metric scrape failed: %s", e)
        return None


def _read_ai_upstream_breakers_open() -> float | None:
    """Open AI breaker keys in Redis; None on failure."""
    try:
        import redis

        from app.config import settings

        r = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=2, decode_responses=True)
        try:
            count = 0
            cursor = 0
            for _ in range(1000):
                cursor, keys = r.scan(cursor=cursor, match="ai:cb:*:open", count=500)
                count += len(keys)
                if cursor == 0:
                    break
            return float(count)
        finally:
            r.close()
    except Exception as e:
        logger.debug("ai upstream breaker metric scrape failed: %s", e)
        return None


def _read_ai_providers_degraded() -> float | None:
    """Providers enabled but marked degraded; None on failure."""
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COUNT(*) FROM ai_providers WHERE enabled IS TRUE AND status = 'degraded'")
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai providers degraded metric scrape failed: %s", e)
        return None


def _read_ai_providers_never_probed() -> float | None:
    """Enabled providers the probe has never reached a verdict on.

    ``MIN(last_probed_at)`` ignores NULL, so a provider that always fails while the rest
    are healthy is invisible to the age gauge. This counts exactly those rows. Omitted
    when the probe is switched off, so a deliberate pause does not page anyone.
    """
    try:
        from sqlalchemy import text

        from app.config import settings

        if not settings.ai_gateway_enabled or not settings.ai_provider_probe_enabled:
            return None

        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT COUNT(*) FROM ai_providers "
                    "WHERE enabled IS TRUE AND status != 'disabled' AND last_probed_at IS NULL"
                )
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai providers never-probed metric scrape failed: %s", e)
        return None


def _read_ai_providers_probe_age_seconds() -> float | None:
    """Seconds since the oldest enabled non-disabled provider was probed.

    ``+Inf`` when the probe is configured to run but has never run. ``None`` on failure, on
    an empty fleet, or when the probe is switched off — a deliberate ``AI_GATEWAY_ENABLED=false``
    or ``AI_PROVIDER_PROBE_ENABLED=false`` would otherwise report ``+Inf`` forever and page
    someone with "check celery beat" during an intentional rollback.
    """
    try:
        from sqlalchemy import text

        from app.config import settings

        if not settings.ai_gateway_enabled or not settings.ai_provider_probe_enabled:
            return None

        with _ai_engine().connect() as conn:
            oldest, count = conn.execute(
                text(
                    "SELECT MIN(last_probed_at), COUNT(*) FROM ai_providers "
                    "WHERE enabled IS TRUE AND status != 'disabled'"
                )
            ).one()
        if not count:
            return None
        if oldest is None:
            return float("inf")
        probed_at = _as_datetime(oldest)
        if probed_at is None:
            return None
        return max((datetime.now(UTC) - probed_at).total_seconds(), 0.0)
    except Exception as e:
        logger.debug("ai providers probe age metric scrape failed: %s", e)
        return None


def _read_payment_pending_attempts() -> float | None:
    """Count gateway attempts still pending; a standing backlog means checkouts outrun expiry."""
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COUNT(*) FROM payment_attempts WHERE status = 'pending' AND payable_kind = 'invoice'")
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("payment pending attempts metric scrape failed: %s", e)
        return None


def _read_payment_pending_age_seconds() -> float | None:
    """Age of the oldest pending attempt.

    A pending attempt older than the 24h checkout expiry (and the 10-minute reconciliation
    sweep) means webhooks are being missed and nothing is reconciling it. Reported as 0
    when there is no pending row, so an idle gateway does not look stale.
    """
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            oldest = conn.execute(
                text(
                    "SELECT MIN(created_at) FROM payment_attempts WHERE status = 'pending' AND payable_kind = 'invoice'"
                )
            ).scalar()
        if oldest is None:
            return 0.0
        created_at = _as_datetime(oldest)
        if created_at is None:
            return None
        return max((datetime.now(UTC) - created_at).total_seconds(), 0.0)
    except Exception as e:
        logger.debug("payment pending age metric scrape failed: %s", e)
        return None


def _read_payment_failed_events_24h() -> float | None:
    """Failed webhook events in the last 24h; each one is a payment that did not activate."""
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(hours=24)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COUNT(*) FROM payment_events WHERE status = 'failed' AND received_at >= :cutoff"),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("payment failed events metric scrape failed: %s", e)
        return None


def _read_payment_amount_mismatches_24h() -> float | None:
    """Attempts failed because the provider amount differed from the invoice in the last 24h.

    The webhook refuses to mark the invoice paid on a mismatch, so every row here is a
    customer who paid something the gateway and the invoice disagree on.
    """
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(hours=24)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT COUNT(*) FROM payment_attempts "
                    "WHERE failure_code = 'amount_mismatch' AND failed_at >= :cutoff "
                    "AND payable_kind = 'invoice'"
                ),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("payment amount mismatch metric scrape failed: %s", e)
        return None


def _read_payment_duplicate_settlements_24h() -> float | None:
    """Second successful settlements against an already-paid invoice in the last 24h.

    Access was not re-activated, so the customer has paid twice and needs a manual refund.
    """
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(hours=24)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT COUNT(*) FROM payment_attempts "
                    "WHERE provider_status = 'duplicate' AND updated_at >= :cutoff "
                    "AND payable_kind = 'invoice'"
                ),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("payment duplicate settlement metric scrape failed: %s", e)
        return None


def _read_payment_refunds_24h() -> float | None:
    """Refund and chargeback attempts in the last 24h.

    Refunds are money leaving the business. They are recorded on the attempt but
    never auto-revoke access, so operators must see them and decide manually.
    """
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(hours=24)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT COUNT(*) FROM payment_attempts "
                    "WHERE status = 'refunded' AND updated_at >= :cutoff "
                    "AND payable_kind = 'invoice'"
                ),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("payment refunds metric scrape failed: %s", e)
        return None


def _read_ai_topup_orders_total() -> list[tuple[str, str, float]] | None:
    """Order counts grouped by status and payment method; None on failure."""
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            rows = conn.execute(
                text("SELECT status, payment_method, COUNT(*) FROM ai_topup_orders GROUP BY status, payment_method")
            ).all()
        return [(str(row[0]), str(row[1]), float(row[2])) for row in rows]
    except Exception as e:
        logger.debug("ai top-up orders total metric scrape failed: %s", e)
        return None


def _read_ai_topup_pending_age_seconds() -> dict[str, float] | None:
    """Age of the oldest pending_payment order per payment method; None on failure."""
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT payment_method, MIN(created_at) FROM ai_topup_orders "
                    "WHERE status = 'pending_payment' GROUP BY payment_method"
                )
            ).all()
        now = datetime.now(UTC)
        ages: dict[str, float] = {}
        for method, oldest in rows:
            created_at = _as_datetime(oldest)
            if created_at is None:
                continue
            ages[str(method)] = max((now - created_at).total_seconds(), 0.0)
        return ages
    except Exception as e:
        logger.debug("ai top-up pending age metric scrape failed: %s", e)
        return None


def _read_ai_topup_pending_overdue_total() -> float | None:
    """pending_payment orders past expires_at; the expiry sweep has not retired them."""
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COUNT(*) FROM ai_topup_orders WHERE status = 'pending_payment' AND expires_at < :now"),
                {"now": datetime.now(UTC)},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai top-up pending overdue metric scrape failed: %s", e)
        return None


def _read_ai_topup_awaiting_verification_total() -> float | None:
    """Manual orders waiting for an admin to approve or reject."""
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COUNT(*) FROM ai_topup_orders WHERE status = 'awaiting_verification'")
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai top-up awaiting verification metric scrape failed: %s", e)
        return None


def _read_ai_topup_refund_review_total() -> float | None:
    """Refund/chargeback orders waiting for an admin clawback or write-off."""
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            raw = conn.execute(text("SELECT COUNT(*) FROM ai_topup_orders WHERE status = 'refund_review'")).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai top-up refund review metric scrape failed: %s", e)
        return None


def _read_ai_topup_webhook_failed_total() -> float | None:
    """Failed webhook events that belong to a top-up attempt in the rolling window."""
    try:
        from sqlalchemy import text

        engine = _ai_engine()
        if engine.dialect.name == "sqlite":
            order_id_expr = "json_extract(pe.payload, '$.order_id')"
        else:
            order_id_expr = "pe.payload ->> 'order_id'"
        cutoff = datetime.now(UTC) - timedelta(hours=AI_TOPUP_WEBHOOK_FAILED_WINDOW_HOURS)
        with engine.connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT COUNT(DISTINCT pe.id) FROM payment_events pe "
                    "JOIN payment_attempts pa "
                    f"ON pa.provider_order_id = {order_id_expr} "
                    "WHERE pe.status = 'failed' "
                    "AND pa.payable_kind = 'topup' "
                    "AND pe.received_at >= :cutoff"
                ),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("ai top-up webhook failed metric scrape failed: %s", e)
        return None


def _read_promo_discount_idr_24h() -> float | None:
    """Discount granted by applied promo redemptions in the last 24h (IDR); None on failure.

    Discount is money leaving the business. ``released`` redemptions are excluded on
    purpose: they belong to a voided invoice, so the quota came back and no lasting
    discount was granted.
    """
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(hours=24)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT COALESCE(SUM(discount_idr), 0) FROM promo_redemptions "
                    "WHERE status = 'applied' AND created_at >= :cutoff"
                ),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("promo discount 24h metric scrape failed: %s", e)
        return None


def _read_promo_discount_idr_30d() -> float | None:
    """Discount granted by applied promo redemptions in the last 30 days (IDR); None on failure.

    The longer window catches a slow, steady burn that never trips the 24h threshold.
    ``released`` redemptions are excluded for the same reason as the 24h reader.
    """
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(days=30)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text(
                    "SELECT COALESCE(SUM(discount_idr), 0) FROM promo_redemptions "
                    "WHERE status = 'applied' AND created_at >= :cutoff"
                ),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("promo discount 30d metric scrape failed: %s", e)
        return None


def _read_promo_redemptions_24h() -> float | None:
    """Applied promo redemptions in the last 24h; None on failure.

    A spike means a leaked code or a runaway campaign, not organic demand. ``released``
    rows never granted a lasting discount, so they are not usage.
    """
    try:
        from sqlalchemy import text

        cutoff = datetime.now(UTC) - timedelta(hours=24)
        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COUNT(*) FROM promo_redemptions WHERE status = 'applied' AND created_at >= :cutoff"),
                {"cutoff": cutoff},
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("promo redemptions 24h metric scrape failed: %s", e)
        return None


def _read_promo_pending_approvals() -> float | None:
    """Codes above the finance cap still waiting for a second admin; None on failure.

    This is a queue depth, not a rate, so it has no time window. A code created above
    the P9 cap is inactive until another platform admin approves it, which means the
    customer cannot redeem it in the meantime.
    """
    try:
        from sqlalchemy import text

        with _ai_engine().connect() as conn:
            raw = conn.execute(
                text("SELECT COUNT(*) FROM promo_codes WHERE requires_approval = true AND approved_at IS NULL")
            ).scalar()
        return float(raw or 0)
    except Exception as e:
        logger.debug("promo pending approvals metric scrape failed: %s", e)
        return None


class AutoFailCollector:
    def collect(self) -> Iterable[Metric]:
        counts = _read_auto_fail_counts()
        gauge = GaugeMetricFamily(
            "vuln_maintenance_auto_failed_jobs",
            "Cumulative auto-failed stale scan jobs by original status (from Redis, 7d TTL)",
            labels=["status"],
        )
        for status, value in counts.items():
            gauge.add_metric([status], value)
        yield gauge


class AiFxRateCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_fx_rate_age_days()
        except Exception as e:
            logger.debug("ai fx rate collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _FX_RATE_AGE_NAME,
            "Age in days of the newest stored USD->IDR rate; +Inf when none",
        )
        gauge.add_metric([], value)
        yield gauge


class AiShortfallCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_shortfall_idr_24h()
        except Exception as e:
            logger.debug("ai shortfall collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _SHORTFALL_NAME,
            "IDR billed but not collected in the last 24h",
        )
        gauge.add_metric([], value)
        yield gauge


class AiWalletLedgerDriftCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_wallet_ledger_drift_idr()
        except Exception as e:
            logger.debug("ai wallet ledger drift collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _LEDGER_DRIFT_NAME,
            "Largest gap between ai_wallets.balance_idr and the ledger sum (IDR)",
        )
        gauge.add_metric([], value)
        yield gauge


class AiStaleReservationsCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_stale_open_reservations()
        except Exception as e:
            logger.debug("ai stale reservations collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            STALE_OPEN_RESERVATIONS_NAME,
            "Open AI reservations older than the reaper threshold",
        )
        gauge.add_metric([], value)
        yield gauge


class AiUpstreamBreakersOpenCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_upstream_breakers_open()
        except Exception as e:
            logger.debug("ai upstream breaker collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _UPSTREAM_BREAKERS_OPEN_NAME,
            "Open AI upstream circuit-breaker keys in Redis",
        )
        gauge.add_metric([], value)
        yield gauge


class AiProvidersDegradedCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_providers_degraded()
        except Exception as e:
            logger.debug("ai providers degraded collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PROVIDERS_DEGRADED_NAME,
            "Enabled AI providers marked degraded",
        )
        gauge.add_metric([], value)
        yield gauge


class AiProvidersNeverProbedCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_providers_never_probed()
        except Exception as e:
            logger.debug("ai providers never-probed collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PROVIDERS_NEVER_PROBED_NAME,
            "Enabled AI providers with no probe verdict yet",
        )
        gauge.add_metric([], value)
        yield gauge


class AiProvidersProbeAgeCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_providers_probe_age_seconds()
        except Exception as e:
            logger.debug("ai providers probe age collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PROVIDERS_PROBE_AGE_NAME,
            "Seconds since the oldest enabled AI provider was last probed; +Inf when never probed",
        )
        gauge.add_metric([], value)
        yield gauge


class PaymentPendingAttemptsCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_payment_pending_attempts()
        except Exception as e:
            logger.debug("payment pending attempts collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PAYMENT_PENDING_ATTEMPTS_NAME,
            "Gateway attempts still pending; a standing backlog means checkouts outrun expiry",
        )
        gauge.add_metric([], value)
        yield gauge


class PaymentPendingAgeCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_payment_pending_age_seconds()
        except Exception as e:
            logger.debug("payment pending age collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PAYMENT_PENDING_AGE_NAME,
            "Age in seconds of the oldest pending payment attempt; stale means webhooks were missed",
        )
        gauge.add_metric([], value)
        yield gauge


class PaymentFailedEventsCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_payment_failed_events_24h()
        except Exception as e:
            logger.debug("payment failed events collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PAYMENT_FAILED_EVENTS_NAME,
            "Failed payment webhook events in the last 24h; each one failed to activate access",
        )
        gauge.add_metric([], value)
        yield gauge


class PaymentAmountMismatchCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_payment_amount_mismatches_24h()
        except Exception as e:
            logger.debug("payment amount mismatch collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PAYMENT_AMOUNT_MISMATCH_NAME,
            "Attempts failed on an amount mismatch in the last 24h; the invoice was not marked paid",
        )
        gauge.add_metric([], value)
        yield gauge


class PaymentDuplicateSettlementCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_payment_duplicate_settlements_24h()
        except Exception as e:
            logger.debug("payment duplicate settlement collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PAYMENT_DUPLICATE_SETTLEMENT_NAME,
            "Second settlements against an already-paid invoice in the last 24h; refund manually",
        )
        gauge.add_metric([], value)
        yield gauge


class PaymentRefundsCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_payment_refunds_24h()
        except Exception as e:
            logger.debug("payment refunds collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PAYMENT_REFUNDS_NAME,
            "Refund/chargeback attempts in the last 24h; access is NOT revoked automatically",
        )
        gauge.add_metric([], value)
        yield gauge


class PromoDiscount24hCollector:
    """Surface the 24h promo discount burn.

    A promo code silently gives money away. Without this gauge the only place the
    discount appears is the invoice total, so finance cannot see a code that is being
    abused before the month closes.
    """

    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_promo_discount_idr_24h()
        except Exception as e:
            logger.debug("promo discount 24h collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PROMO_DISCOUNT_24H_NAME,
            "IDR discount granted by applied promo redemptions in the last 24h",
        )
        gauge.add_metric([], value)
        yield gauge


class PromoDiscount30dCollector:
    """Surface the 30d promo discount burn.

    The longer window is the trend view: a code can stay under the daily threshold and
    still drain the month. It also gives finance a number to compare with invoice volume.
    """

    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_promo_discount_idr_30d()
        except Exception as e:
            logger.debug("promo discount 30d collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PROMO_DISCOUNT_30D_NAME,
            "IDR discount granted by applied promo redemptions in the last 30 days",
        )
        gauge.add_metric([], value)
        yield gauge


class PromoRedemptions24hCollector:
    """Surface applied promo redemptions per day.

    Redemption volume is the earliest signal of a leaked code or a campaign outrunning
    its budget; the discount gauges only show the damage after the fact.
    """

    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_promo_redemptions_24h()
        except Exception as e:
            logger.debug("promo redemptions 24h collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PROMO_REDEMPTIONS_24H_NAME,
            "Applied promo redemptions in the last 24h",
        )
        gauge.add_metric([], value)
        yield gauge


class PromoPendingApprovalsCollector:
    """Surface codes above the finance cap that no second admin has approved yet.

    Such a code is created inactive, so the customer cannot use it until someone acts.
    A non-zero depth means a sale is waiting on an approval nobody was told about.
    """

    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_promo_pending_approvals()
        except Exception as e:
            logger.debug("promo pending approvals collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _PROMO_PENDING_APPROVALS_NAME,
            "Promo codes above the finance cap waiting for a second platform-admin approval",
        )
        gauge.add_metric([], value)
        yield gauge


class AiTopupOrdersTotalCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            rows = _read_ai_topup_orders_total()
        except Exception as e:
            logger.debug("ai top-up orders total collector failed: %s", e)
            return
        if rows is None:
            return
        gauge = GaugeMetricFamily(
            _AI_TOPUP_ORDERS_TOTAL_NAME,
            "AI top-up orders by status and payment method",
            labels=["status", "method"],
        )
        for status, method, count in rows:
            gauge.add_metric([status, method], count)
        yield gauge


class AiTopupPendingAgeCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            ages = _read_ai_topup_pending_age_seconds()
        except Exception as e:
            logger.debug("ai top-up pending age collector failed: %s", e)
            return
        if ages is None:
            return
        gauge = GaugeMetricFamily(
            _AI_TOPUP_PENDING_AGE_NAME,
            "Age in seconds of the oldest pending_payment top-up order per method",
            labels=["method"],
        )
        for method, age in ages.items():
            gauge.add_metric([method], age)
        yield gauge


class AiTopupPendingOverdueCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_topup_pending_overdue_total()
        except Exception as e:
            logger.debug("ai top-up pending overdue collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _AI_TOPUP_PENDING_OVERDUE_NAME,
            "pending_payment top-up orders past expires_at",
        )
        gauge.add_metric([], value)
        yield gauge


class AiTopupAwaitingVerificationCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_topup_awaiting_verification_total()
        except Exception as e:
            logger.debug("ai top-up awaiting verification collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _AI_TOPUP_AWAITING_VERIFICATION_NAME,
            "Manual top-up orders waiting for admin verification",
        )
        gauge.add_metric([], value)
        yield gauge


class AiTopupRefundReviewCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_topup_refund_review_total()
        except Exception as e:
            logger.debug("ai top-up refund review collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _AI_TOPUP_REFUND_REVIEW_NAME,
            "Top-up orders waiting for an admin refund resolution",
        )
        gauge.add_metric([], value)
        yield gauge


class AiTopupWebhookFailedCollector:
    def collect(self) -> Iterable[Metric]:
        try:
            value = _read_ai_topup_webhook_failed_total()
        except Exception as e:
            logger.debug("ai top-up webhook failed collector failed: %s", e)
            return
        if value is None:
            return
        gauge = GaugeMetricFamily(
            _AI_TOPUP_WEBHOOK_FAILED_NAME,
            "Failed top-up webhook events in the last 24h; the wallet was not credited",
        )
        gauge.add_metric([], value)
        yield gauge


def register_custom_metrics() -> None:
    global _collector_registered
    if _collector_registered:
        return
    REGISTRY.register(AutoFailCollector())
    REGISTRY.register(AiFxRateCollector())
    REGISTRY.register(AiShortfallCollector())
    REGISTRY.register(AiWalletLedgerDriftCollector())
    REGISTRY.register(AiStaleReservationsCollector())
    REGISTRY.register(AiUpstreamBreakersOpenCollector())
    REGISTRY.register(AiProvidersDegradedCollector())
    REGISTRY.register(AiProvidersProbeAgeCollector())
    REGISTRY.register(AiProvidersNeverProbedCollector())
    REGISTRY.register(PaymentPendingAttemptsCollector())
    REGISTRY.register(PaymentPendingAgeCollector())
    REGISTRY.register(PaymentFailedEventsCollector())
    REGISTRY.register(PaymentAmountMismatchCollector())
    REGISTRY.register(PaymentDuplicateSettlementCollector())
    REGISTRY.register(PaymentRefundsCollector())
    REGISTRY.register(PromoDiscount24hCollector())
    REGISTRY.register(PromoDiscount30dCollector())
    REGISTRY.register(PromoRedemptions24hCollector())
    REGISTRY.register(PromoPendingApprovalsCollector())
    REGISTRY.register(AiTopupOrdersTotalCollector())
    REGISTRY.register(AiTopupPendingAgeCollector())
    REGISTRY.register(AiTopupPendingOverdueCollector())
    REGISTRY.register(AiTopupAwaitingVerificationCollector())
    REGISTRY.register(AiTopupRefundReviewCollector())
    REGISTRY.register(AiTopupWebhookFailedCollector())
    _collector_registered = True
