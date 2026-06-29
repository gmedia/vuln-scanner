#!/bin/sh
# Worker entrypoint.
# Validates environment, waits for Redis, then starts both the health server
# and the Celery worker for the configured queue.

set -e

echo "=== Worker prestart: validating environment ==="

# --- Env var validation ---
REQUIRED_VARS="CELERY_BROKER_URL DATABASE_URL_SYNC CELERY_QUEUE"
MISSING=""
for var in $REQUIRED_VARS; do
  eval "val=\"\$$var\""
  if [ -z "$val" ]; then
    echo "[ERROR] $var is not set"
    MISSING="$MISSING $var"
  fi
done
if [ -n "$MISSING" ]; then
  echo "FATAL: missing required environment variables:$MISSING"
  exit 1
fi
echo "[OK] Required env vars are set ($CELERY_QUEUE)"

# --- Wait for Redis ---
REDIS_HOST=$(python -c "
from urllib.parse import urlparse
import os
url = urlparse(os.environ['CELERY_BROKER_URL'])
print(url.hostname or 'redis')
")
REDIS_PORT=$(python -c "
from urllib.parse import urlparse
import os
url = urlparse(os.environ['CELERY_BROKER_URL'])
print(url.port or 6379)
")
echo "Waiting for Redis at $REDIS_HOST:$REDIS_PORT ..."
for i in $(seq 1 30); do
  if python -c "
import redis, sys, os
try:
    r = redis.Redis.from_url(os.environ['CELERY_BROKER_URL'], socket_connect_timeout=2)
    r.ping()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
    echo "[OK] Redis is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "FATAL: Redis did not become ready after 30 attempts"
    exit 1
  fi
  sleep 2
done

# --- Wait for PostgreSQL ---
echo "Waiting for PostgreSQL ..."
for i in $(seq 1 30); do
  if python -c "
import psycopg2, sys, os
try:
    psycopg2.connect(os.environ['DATABASE_URL_SYNC'])
    sys.exit(0)
except Exception as e:
    print(f'[psycopg2] {e}', file=sys.stderr)
    sys.exit(1)
" ; then
    echo "[OK] PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "FATAL: PostgreSQL did not become ready after 30 attempts"
    exit 1
  fi
  sleep 2
done

echo "=== Worker prestart complete ==="

# Start health server in background
python /app/health_server.py 8001 &

# Start Celery worker (foreground, so container stays alive)
exec celery -A celery_app worker \
  -Q "$CELERY_QUEUE" \
  --concurrency="${CELERY_CONCURRENCY:-2}" \
  --loglevel=info
