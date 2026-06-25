import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from celery import Celery

_redis_password = os.getenv("REDIS_PASSWORD", "")
_redis_auth = f":{_redis_password}@" if _redis_password else ""
_default_redis_url = f"redis://{_redis_auth}redis:6379/0"

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
    },
    task_annotations={
        "ip_scan.run": {"rate_limit": "10/m"},
        "domain_scan.run": {"rate_limit": "10/m"},
        "mobile_scan.run": {"rate_limit": "10/m"},
    },
)

celery_app.autodiscover_tasks(["tasks.ip_scan", "tasks.domain_scan", "tasks.mobile_scan", "tasks.dead_letter"])
