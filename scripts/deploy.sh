#!/bin/bash
set -e

DEPLOY_PATH="${1:?usage: $0 <deploy-path>}"
cd "$DEPLOY_PATH"
export COMPOSE_PROJECT_NAME=vuln

git pull origin main

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

docker compose -f docker-compose.prod.yml build --no-cache

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
docker compose -f docker-compose.prod.yml --project-name vuln-scanner down --volumes --remove-orphans 2>/dev/null || true
docker compose -f docker-compose.prod.yml down --remove-orphans
docker rm -f vuln-backend vuln-frontend vuln-redis vuln-postgres \
  vuln-worker-ip vuln-worker-domain vuln-worker-mobile vuln-worker-dead-letter \
  vuln-celery-beat 2>/dev/null || true
docker volume rm -f vuln-scanner_postgres_data vuln-scanner_redis_data vuln-scanner_scan_data 2>/dev/null || true

echo "=== Remaining volumes ==="
docker volume ls --format "{{.Name}}" | grep postgres || true

echo "=== Starting services ==="
docker compose -f docker-compose.prod.yml up -d || {
  echo "=== docker compose up -d FAILED — dumping logs ==="
  docker logs vuln-postgres --tail=100 2>&1 || true
  docker logs vuln-redis --tail=100 2>&1 || true
  docker compose -f docker-compose.prod.yml logs --tail=100 2>&1 || true
  exit 1
}

echo "Waiting for postgres..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U "${POSTGRES_USER:-vuln_scanner}" 2>/dev/null; then
    echo "postgres ready"
    break
  fi
  echo "  attempt $i/30..."
  sleep 2
done

set -a; source .env; set +a

echo "Waiting for redis..."
for i in $(seq 1 15); do
  if docker compose -f docker-compose.prod.yml exec -T redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
    echo "redis ready"
    break
  fi
  echo "  attempt $i/15..."
  sleep 2
done

if ! docker compose -f docker-compose.prod.yml ps --status running | grep -q backend; then
  echo "=== FAILED — dumping logs ==="
  docker logs vuln-backend --tail=100 2>&1 || true
  docker logs vuln-postgres --tail=100 2>&1 || true
  docker logs vuln-redis --tail=100 2>&1 || true
  docker compose -f docker-compose.prod.yml logs --tail=100 2>&1 || true
  exit 1
fi

docker exec vuln-backend alembic upgrade head || {
  rc=$?
  echo "=== FAILED — alembic exited $rc, dumping logs ==="
  docker logs vuln-backend --tail=100 2>&1 || true
  docker logs vuln-postgres --tail=100 2>&1 || true
  docker logs vuln-redis --tail=100 2>&1 || true
  docker compose -f docker-compose.prod.yml logs --tail=100 2>&1 || true
  exit $rc
}
echo "Deploy completed — migration at $(docker exec vuln-backend alembic current 2>/dev/null | tail -1)"
