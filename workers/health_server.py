import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

import redis
from loguru import logger

REDIS_URL = os.getenv("REDIS_URL", f"redis://:{os.getenv('REDIS_PASSWORD', '')}@redis:6379/0")
_redis_pool = redis.ConnectionPool.from_url(REDIS_URL, socket_connect_timeout=3, socket_timeout=3)  # type: ignore[no-untyped-call]
CELERY_QUEUES = ["ip_scan", "domain_scan", "mobile_scan"]
_start_time = time.monotonic()


def _get_redis() -> redis.Redis:
    return redis.Redis(connection_pool=_redis_pool)


def _queue_depth(r: redis.Redis) -> dict[str, Any]:
    depths: dict[str, Any] = {}
    for q in CELERY_QUEUES:
        try:
            depths[q] = r.llen(q)
        except Exception as e:
            logger.warning("Failed to get queue depth for {}: {}", q, e)
            depths[q] = "unavailable"
    return depths


def _dead_letter_count(r: redis.Redis) -> Any:
    try:
        return r.zcard("dead_letter:log")
    except Exception as e:
        logger.warning("Failed to check dead letter queue: {}", e)
        return "unavailable"


def _celery_broker_ok(r: redis.Redis) -> bool:
    try:
        return r.ping() is True
    except Exception as e:
        logger.warning("Failed to check broker: {}", e)
        return False


class HealthHandler(BaseHTTPRequestHandler):
    """HTTP handler serving /health and /ready endpoints for worker monitoring."""
    def _json_response(self, code: int, data: dict[str, Any]) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self) -> None:
        if self.path == "/health":
            self._handle_health()
        elif self.path == "/ready":
            self._handle_ready()
        else:
            self._json_response(404, {"error": "not found"})

    def _handle_health(self) -> None:
        r = _get_redis()
        broker_ok = _celery_broker_ok(r)
        payload = {
            "worker_status": "running",
            "celery_broker": "connected" if broker_ok else "unavailable",
            "queue_depth": _queue_depth(r) if broker_ok else {q: "unavailable" for q in CELERY_QUEUES},
            "uptime": int(time.monotonic() - _start_time),
            "dead_letter_count": _dead_letter_count(r),
        }
        try:
            last_task = r.get("health:last_task_completed")
            if last_task is not None:
                last_ts = float(last_task)  # type: ignore[arg-type]
                seconds_ago = int(time.time() - last_ts)
                payload["last_task_seconds_ago"] = seconds_ago
            else:
                payload["last_task_seconds_ago"] = None
        except Exception as e:
            logger.error("Health check failed: {}", e)
            payload["last_task_seconds_ago"] = "unavailable"

        self._json_response(200, payload)

    def _handle_ready(self) -> None:
        r = _get_redis()
        if _celery_broker_ok(r):
            self._json_response(200, {"ready": True})
        else:
            self._json_response(503, {"ready": False, "reason": "redis unreachable"})

    def log_message(self, format: str, *args: Any) -> None:
        logger.debug(format % args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    HTTPServer(("0.0.0.0", port), HealthHandler).serve_forever()
