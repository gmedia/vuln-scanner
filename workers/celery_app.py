import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from celery import Celery

from utils.redis_helpers import build_redis_url

_default_redis_url = build_redis_url()

celery_app = Celery(
    "vuln_scanner",
    broker=os.getenv("CELERY_BROKER_URL", _default_redis_url),
    backend=os.getenv("CELERY_RESULT_BACKEND", _default_redis_url),
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_soft_time_limit=600,
    task_time_limit=900,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    worker_max_tasks_per_child=50,
    task_routes={
        "ip_scan.run": {"queue": "ip_scan"},
        "domain_scan.run": {"queue": "domain_scan"},
        "mobile_scan.run": {"queue": "mobile_scan"},
        "dead_letter.handle": {"queue": "dead_letter"},
        "maintenance.fail_stale_pending": {"queue": "ip_scan"},
    },
    task_annotations={
        "ip_scan.run": {"rate_limit": "10/m"},
        "domain_scan.run": {"rate_limit": "10/m"},
        "mobile_scan.run": {"rate_limit": "10/m"},
    },
    beat_schedule={
        "fail-stale-pending-every-5m": {
            "task": "maintenance.fail_stale_pending",
            "schedule": 300.0,
        },
    },
)

celery_app.autodiscover_tasks(
    ["tasks.ip_scan", "tasks.domain_scan", "tasks.mobile_scan", "tasks.dead_letter", "tasks.maintenance"]
)
