import os

import redis


def build_redis_url() -> str:
    """Build Redis connection URL from environment variables.

    Uses REDIS_PASSWORD if set, otherwise connects without auth.
    """
    password = os.getenv("REDIS_PASSWORD", "")
    if password:
        return f"redis://:{password}@redis:6379/0"
    return "redis://redis:6379/0"


_redis_pool: redis.ConnectionPool | None = None


def get_redis_pool() -> redis.ConnectionPool:
    """Return a singleton Redis connection pool, lazily initialized."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.ConnectionPool.from_url(build_redis_url())
    return _redis_pool
