from __future__ import annotations

import logging
from collections.abc import Iterable

from prometheus_client.core import GaugeMetricFamily, Metric
from prometheus_client.registry import REGISTRY

logger = logging.getLogger(__name__)

AUTO_FAIL_REDIS_KEYS = {
    "pending": "metrics:maintenance:auto_failed:pending",
    "running": "metrics:maintenance:auto_failed:running",
}

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


def register_custom_metrics() -> None:
    global _collector_registered
    if _collector_registered:
        return
    REGISTRY.register(AutoFailCollector())
    _collector_registered = True
