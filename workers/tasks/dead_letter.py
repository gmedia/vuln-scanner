import json
import os
import time

import redis
from celery import shared_task
from loguru import logger

REDIS_URL = os.getenv("REDIS_URL", f"redis://:{os.getenv('REDIS_PASSWORD', '')}@redis:6379/0")
_redis_pool = redis.ConnectionPool.from_url(REDIS_URL)
DEAD_LETTER_MAX = 1000


@shared_task(
    bind=True,
    name="dead_letter.handle",
    acks_late=True,
    max_retries=1,
    default_retry_delay=30,
)
def dead_letter_handler(self, task_name: str, args: list, kwargs: dict, exception_info: str):
    """Handle a task that exhausted all retries.

    Logs the failure with full context and stores it in a Redis sorted set
    (``dead_letter:log``) for observability.  The set is auto-trimmed to
    *DEAD_LETTER_MAX* entries so it does not grow unbounded.
    """
    logger.error(
        "Dead letter received: task={task} args={args} kwargs={kwargs} exception={exc}",
        task=task_name,
        args=args,
        kwargs=kwargs,
        exc=exception_info,
    )

    timestamp = time.time()
    entry = {
        "task_name": task_name,
        "args": args,
        "kwargs": kwargs,
        "exception_info": exception_info,
        "timestamp": timestamp,
    }

    try:
        r = redis.Redis(connection_pool=_redis_pool)
        r.zadd("dead_letter:log", {json.dumps(entry): timestamp})

        # Trim to keep only the most recent DEAD_LETTER_MAX entries
        count = r.zcard("dead_letter:log")
        assert isinstance(count, int)
        if count > DEAD_LETTER_MAX:
            r.zremrangebyrank("dead_letter:log", 0, count - DEAD_LETTER_MAX - 1)

        logger.info(
            "Dead letter logged to Redis: task={task} log_size={size}",
            task=task_name,
            size=min(count, DEAD_LETTER_MAX),
        )
    except Exception as e:
        logger.error("Failed to persist dead letter to Redis: {error}", error=e)
