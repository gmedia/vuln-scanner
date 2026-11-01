from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from functools import lru_cache
from typing import TYPE_CHECKING

from prometheus_client.core import GaugeMetricFamily, Metric
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

_collector_registered = False


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


def register_custom_metrics() -> None:
    global _collector_registered
    if _collector_registered:
        return
    REGISTRY.register(AutoFailCollector())
    REGISTRY.register(AiFxRateCollector())
    REGISTRY.register(AiShortfallCollector())
    _collector_registered = True
