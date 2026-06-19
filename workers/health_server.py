import json
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
CELERY_QUEUES = ["ip_scan", "domain_scan", "mobile_scan"]
_start_time = time.monotonic()


def _get_redis():
    return redis.Redis.from_url(REDIS_URL, socket_connect_timeout=3, socket_timeout=3)


def _queue_depth(r):
    depths = {}
    for q in CELERY_QUEUES:
        try:
            depths[q] = r.llen(q)
        except Exception:
            depths[q] = "unavailable"
    return depths


def _dead_letter_count(r):
    try:
        return r.zcard("dead_letter:log")
    except Exception:
        return "unavailable"


def _celery_broker_ok(r):
    try:
        return r.ping() is True
    except Exception:
        return False


class HealthHandler(BaseHTTPRequestHandler):
    def _json_response(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        if self.path == "/health":
            self._handle_health()
        elif self.path == "/ready":
            self._handle_ready()
        else:
            self._json_response(404, {"error": "not found"})

    def _handle_health(self):
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
                last_ts = float(last_task)
                seconds_ago = int(time.time() - last_ts)
                payload["last_task_seconds_ago"] = seconds_ago
            else:
                payload["last_task_seconds_ago"] = None
        except Exception:
            payload["last_task_seconds_ago"] = "unavailable"

        self._json_response(200, payload)

    def _handle_ready(self):
        r = _get_redis()
        if _celery_broker_ok(r):
            self._json_response(200, {"ready": True})
        else:
            self._json_response(503, {"ready": False, "reason": "redis unreachable"})

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    HTTPServer(("0.0.0.0", port), HealthHandler).serve_forever()
