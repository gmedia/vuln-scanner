#!/bin/sh
# Pre-startup validation script.
# Runs before the main application starts to ensure:
#   - Required environment variables are set
#   - PostgreSQL is reachable
#   - Redis is reachable
#   - Database migrations are up-to-date

set -e

echo "=== Prestart: validating environment ==="

# --- Env var validation ---
REQUIRED_VARS="API_KEY DATABASE_URL DATABASE_URL_SYNC REDIS_URL SECRET_KEY"
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
echo "[OK] All required env vars are set"

# --- Warn about dev/default credentials ---
for var in API_KEY SECRET_KEY; do
  eval "val=\"\$$var\""
  case "$val" in
    dev-*|dev-api-key-*|dev-secret-key-*)
      echo "[WARN] $var is set to a development placeholder (${val%%????????????????}...). Generate a strong key."
      ;;
  esac
done
if echo "$CORS_ORIGINS" | grep -qE '^\*$'; then
  echo "[WARN] CORS_ORIGINS is set to wildcard (*). Restrict to specific origins."
fi

# --- Wait for PostgreSQL ---
DB_HOST=$(echo "$DATABASE_URL_SYNC" | sed 's/.*@//' | sed 's/:.*//')
DB_PORT=$(echo "$DATABASE_URL_SYNC" | sed 's/.*://' | sed 's/\/.*//')
echo "Waiting for PostgreSQL at $DB_HOST:$DB_PORT ..."
for i in $(seq 1 30); do
  if python -c "
import psycopg2, sys, os
try:
    psycopg2.connect(os.environ['DATABASE_URL_SYNC'])
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
    echo "[OK] PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "FATAL: PostgreSQL did not become ready after 30 attempts"
    exit 1
  fi
  sleep 2
done

# --- Wait for Redis ---
REDIS_HOST=$(echo "$REDIS_URL" | sed 's/.*:\/\///' | sed 's/:.*//')
REDIS_PORT=$(echo "$REDIS_URL" | sed 's/.*:/:' | sed 's/.*://' | sed 's/\/.*//')
[ -z "$REDIS_PORT" ] && REDIS_PORT=6379
echo "Waiting for Redis at $REDIS_HOST:$REDIS_PORT ..."
for i in $(seq 1 30); do
  if python -c "
import redis, sys, os
try:
    r = redis.Redis.from_url(os.environ['REDIS_URL'], socket_connect_timeout=2)
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

# --- Run migrations ---
echo "Running database migrations..."
alembic upgrade head
echo "[OK] Migrations up-to-date"

echo "=== Prestart complete ==="
