#!/bin/bash
set -e

DEPLOY_PATH="${1:?usage: $0 <deploy-path>}"
cd "$DEPLOY_PATH"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vuln}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

COMPOSE=(docker compose -f docker-compose.prod.yml)
REMOTE_DATA_MODE=0
if [ "${REMOTE_DATA:-}" = "1" ] || [ "${REMOTE_DATA:-}" = "true" ]; then
  if [ ! -f docker-compose.prod.remote-data.yml ]; then
    echo "=== FAILED — REMOTE_DATA set but docker-compose.prod.remote-data.yml missing ==="
    exit 1
  fi
  COMPOSE+=(-f docker-compose.prod.remote-data.yml)
  REMOTE_DATA_MODE=1
  echo "NOTE: REMOTE_DATA=1 — multi-host overlay (no local postgres/redis containers)"
fi

# Transient egress to github.com:443 is common on some VPS paths — retry pull.
_git_pull_ok=0
for _attempt in 1 2 3 4 5; do
  if git pull origin main; then
    _git_pull_ok=1
    break
  fi
  echo "WARN: git pull origin main failed (attempt ${_attempt}/5); retrying in $((_attempt * 5))s..."
  sleep $((_attempt * 5))
done
if [ "$_git_pull_ok" -ne 1 ]; then
  echo "=== FAILED — git pull origin main after 5 attempts (check egress to github.com:443) ==="
  exit 1
fi

echo "=== Disk before cleanup ==="
df -h / || true
docker image prune -af || true
docker builder prune -af || true
echo "=== Disk after cleanup ==="
df -h / || true

docker tag vuln-backend:latest vuln-backend:previous 2>/dev/null || true
docker tag vuln-frontend:latest vuln-frontend:previous 2>/dev/null || true
docker tag vuln-worker_ip:latest vuln-worker_ip:previous 2>/dev/null || true
docker tag vuln-worker_domain:latest vuln-worker_domain:previous 2>/dev/null || true
docker tag vuln-worker_mobile:latest vuln-worker_mobile:previous 2>/dev/null || true
docker tag vuln-worker_dead_letter:latest vuln-worker_dead_letter:previous 2>/dev/null || true
docker tag vuln-celery_beat:latest vuln-celery_beat:previous 2>/dev/null || true

"${COMPOSE[@]}" build --no-cache

SHA=$(git rev-parse --short HEAD)
docker tag vuln-backend:latest vuln-backend:$SHA
docker tag vuln-frontend:latest vuln-frontend:$SHA
docker tag vuln-worker_ip:latest vuln-worker_ip:$SHA
docker tag vuln-worker_domain:latest vuln-worker_domain:$SHA
docker tag vuln-worker_mobile:latest vuln-worker_mobile:$SHA
docker tag vuln-worker_dead_letter:latest vuln-worker_dead_letter:$SHA 2>/dev/null || true
docker tag vuln-celery_beat:latest vuln-celery_beat:$SHA 2>/dev/null || true

echo "Deploying commit: $SHA"

echo "=== Pre-deploy diagnostics ==="
docker ps -a --format "{{.Names}} {{.Status}}" || true
docker volume ls --format "{{.Name}}" | grep postgres || true

echo "=== Bringing services down ==="
if [ "$REMOTE_DATA_MODE" -eq 1 ]; then
  "${COMPOSE[@]}" --project-name vuln-scanner down --remove-orphans 2>/dev/null || true
  "${COMPOSE[@]}" down --remove-orphans
  docker rm -f vuln-backend vuln-frontend \
    vuln-worker-ip vuln-worker-domain vuln-worker-mobile vuln-worker-dead-letter \
    vuln-celery-beat 2>/dev/null || true
else
  "${COMPOSE[@]}" --project-name vuln-scanner down --volumes --remove-orphans 2>/dev/null || true
  "${COMPOSE[@]}" down --remove-orphans
  docker rm -f vuln-backend vuln-frontend vuln-redis vuln-postgres \
    vuln-worker-ip vuln-worker-domain vuln-worker-mobile vuln-worker-dead-letter \
    vuln-celery-beat 2>/dev/null || true
  docker volume rm -f vuln-scanner_postgres_data vuln-scanner_redis_data vuln-scanner_scan_data 2>/dev/null || true
fi

echo "=== Remaining volumes ==="
docker volume ls --format "{{.Name}}" | grep postgres || true

echo "=== Starting services ==="
if [ "$REMOTE_DATA_MODE" -eq 1 ]; then
  APP_SERVICES=(backend frontend worker_mobile worker_dead_letter celery_beat)
  echo "NOTE: REMOTE_DATA=1 — starting ${APP_SERVICES[*]} (not worker_ip/worker_domain)"
  UP_ARGS=("${APP_SERVICES[@]}")
else
  UP_ARGS=()
fi
"${COMPOSE[@]}" up -d "${UP_ARGS[@]}" || {
  echo "=== docker compose up -d FAILED — dumping logs ==="
  docker logs vuln-postgres --tail=100 2>&1 || true
  docker logs vuln-redis --tail=100 2>&1 || true
  "${COMPOSE[@]}" logs --tail=100 2>&1 || true
  exit 1
}

if [ "$REMOTE_DATA_MODE" -eq 0 ]; then
  echo "Waiting for postgres..."
  for i in $(seq 1 30); do
    if "${COMPOSE[@]}" exec -T postgres pg_isready -U "${POSTGRES_USER:-vuln_scanner}" 2>/dev/null; then
      echo "postgres ready"
      break
    fi
    echo "  attempt $i/30..."
    sleep 2
  done

  REDIS_PASSWORD=$(grep -E '^REDIS_PASSWORD=' .env | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  if [ -z "$REDIS_PASSWORD" ]; then
    echo "=== FAILED — REDIS_PASSWORD missing from .env ==="
    exit 1
  fi

  echo "Waiting for redis..."
  for i in $(seq 1 15); do
    if "${COMPOSE[@]}" exec -T redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
      echo "redis ready"
      break
    fi
    echo "  attempt $i/15..."
    sleep 2
  done
else
  echo "REMOTE_DATA=1 — skipping local postgres/redis readiness (data host)"
fi

if ! "${COMPOSE[@]}" ps --status running | grep -q backend; then
  echo "=== FAILED — dumping logs ==="
  docker logs vuln-backend --tail=100 2>&1 || true
  docker logs vuln-postgres --tail=100 2>&1 || true
  docker logs vuln-redis --tail=100 2>&1 || true
  "${COMPOSE[@]}" logs --tail=100 2>&1 || true
  exit 1
fi

docker exec vuln-backend alembic upgrade head || {
  rc=$?
  echo "=== FAILED — alembic exited $rc, dumping logs ==="
  docker logs vuln-backend --tail=100 2>&1 || true
  docker logs vuln-postgres --tail=100 2>&1 || true
  docker logs vuln-redis --tail=100 2>&1 || true
  "${COMPOSE[@]}" logs --tail=100 2>&1 || true
  exit $rc
}
echo "Deploy completed — migration at $(docker exec vuln-backend alembic current 2>/dev/null | tail -1)"

echo "=== upsert ADMIN_/E2E_ users from env (password overwrite, no table wipe) ==="
docker exec vuln-backend python -m scripts.upsert_secret_users
