#!/usr/bin/env bash
# Service-only production deploy — rebuild + recreate selected app services.
# NEVER tears down postgres/redis volumes (unlike scripts/deploy.sh).
#
# Why not scripts/deploy.sh?
#   Full deploy historically used destructive volume cleanup paths
#   (`down --volumes`, explicit volume rm). App-code deploys only need
#   image rebuild + container recreate; DB/Redis data must stay intact.
#
# Prefer this for:
#   - backend API changes
#   - worker task/utils changes
#   - multi-service waves (e.g. mobile AAB: backend + frontend + worker_mobile)
# Prefer scripts/deploy-frontend.sh for SPA-only waves.
#
# Usage (on the **production / edge** host that serves the public site — not a
# coding-only laptop — from repo root, git already on target SHA):
#   ./scripts/deploy-services.sh
#   ./scripts/deploy-services.sh backend frontend worker_mobile
#   ./scripts/deploy-services.sh /path/to/vuln-scanner backend worker_mobile
#   DEPLOY_PATH=/path/to/vuln-scanner ./scripts/deploy-services.sh --all
#   ./scripts/deploy-services.sh --no-cache backend
#   ./scripts/deploy-services.sh --skip-migrate backend
#
# Compose project name (important):
#   Default COMPOSE_PROJECT_NAME is "vuln" if unset. Existing stacks often use
#   "vuln-scanner" (container names vuln-backend, network …_default). Mismatch
#   causes name conflicts or new empty networks. On the edge host, match live:
#     docker inspect vuln-backend --format '{{index .Config.Labels "com.docker.compose.project"}}'
#   then e.g.:
#     COMPOSE_PROJECT_NAME=vuln-scanner ./scripts/deploy-services.sh . backend celery_beat …
#   App services must join the same Docker network as running postgres/redis.
#
# Env: use the production env that already works on the edge host. A coding-host
# .env may be incomplete vs live containers — do not blindly copy placeholders.
#
# Default services (when none listed): backend frontend worker_ip worker_domain
#   worker_mobile worker_dead_letter celery_beat
# Postgres and redis are NEVER rebuilt/recreated by this script.
# Include celery_beat when rolling Scan Attach schedules (see docs/scan-schedules-ops.md).
#
# Verify after (on the same host as public DNS):
#   curl -sS https://vs.appmedia.id/api/health
#   curl -sS https://vs.appmedia.id/ | grep -oE 'assets/index-[^"]+\.js'
#   docker ps --filter name=vuln- --format '{{.Names}} {{.Status}}'

set -euo pipefail

DEFAULT_SERVICES=(
  backend
  frontend
  worker_ip
  worker_domain
  worker_mobile
  worker_dead_letter
  celery_beat
)

BLOCKED_SERVICES=(postgres redis)

usage() {
  sed -n '2,32p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

DEPLOY_PATH="${DEPLOY_PATH:-/home/ubuntu/vuln-scanner}"
SERVICES=()
NO_CACHE=0
SKIP_MIGRATE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --all)
      SERVICES=("${DEFAULT_SERVICES[@]}")
      shift
      ;;
    --no-cache)
      NO_CACHE=1
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE=1
      shift
      ;;
    -*)
      echo "error: unknown flag: $1" >&2
      usage 1
      ;;
    *)
      if [[ ${#SERVICES[@]} -eq 0 && -d "$1" && -f "$1/docker-compose.prod.yml" ]]; then
        DEPLOY_PATH="$1"
      else
        SERVICES+=("$1")
      fi
      shift
      ;;
  esac
done

if [[ ${#SERVICES[@]} -eq 0 ]]; then
  SERVICES=("${DEFAULT_SERVICES[@]}")
fi

cd "$DEPLOY_PATH"

if [[ ! -f docker-compose.prod.yml ]]; then
  echo "error: docker-compose.prod.yml not found in $DEPLOY_PATH" >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vuln}"
COMPOSE=(docker compose -f docker-compose.prod.yml)
# Multi-host: Postgres/Redis on a dedicated data host (see docs/multi-host-ops.md).
if [[ "${REMOTE_DATA:-}" == "1" || "${REMOTE_DATA:-}" == "true" ]]; then
  if [[ ! -f docker-compose.prod.remote-data.yml ]]; then
    echo "error: REMOTE_DATA set but docker-compose.prod.remote-data.yml missing" >&2
    exit 1
  fi
  COMPOSE+=(-f docker-compose.prod.remote-data.yml)
  echo "NOTE: REMOTE_DATA=1 — local postgres/redis containers disabled"
fi

# Capture once. Avoid `cmd | grep -q` under `set -o pipefail`: when grep -q
# exits early on a match, the producer gets SIGPIPE and the pipeline fails
# even though the service name is valid.
KNOWN_SERVICES=$("${COMPOSE[@]}" config --services)
KNOWN_SERVICES_FLAT=${KNOWN_SERVICES//$'\n'/ }

for svc in "${SERVICES[@]}"; do
  for blocked in "${BLOCKED_SERVICES[@]}"; do
    if [[ "$svc" == "$blocked" ]]; then
      echo "error: refusing to recreate '$svc' via deploy-services.sh (data volume risk)." >&2
      echo "  Postgres/redis stay running; app services attach to existing network/volumes." >&2
      exit 1
    fi
  done
  if ! grep -Fxq -- "$svc" <<< "$KNOWN_SERVICES"; then
    echo "error: unknown compose service '$svc'" >&2
    echo "  known: $KNOWN_SERVICES_FLAT" >&2
    exit 1
  fi
done

DEDUPED=()
for svc in "${SERVICES[@]}"; do
  skip=0
  for d in "${DEDUPED[@]+"${DEDUPED[@]}"}"; do
    [[ "$d" == "$svc" ]] && skip=1 && break
  done
  [[ $skip -eq 1 ]] || DEDUPED+=("$svc")
done
SERVICES=("${DEDUPED[@]}")

SHA=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)

echo "=== service-only deploy ==="
echo "path:     $DEPLOY_PATH"
echo "sha:      $SHA ($BRANCH)"
echo "project:  $COMPOSE_PROJECT_NAME"
echo "services: ${SERVICES[*]}"
echo "NOTE:     postgres/redis volumes are NOT touched"

tag_previous() {
  local svc="$1"
  local img="vuln-${svc}"
  if docker image inspect "${img}:latest" >/dev/null 2>&1; then
    docker tag "${img}:latest" "${img}:previous" 2>/dev/null || true
  fi
}

for svc in "${SERVICES[@]}"; do
  tag_previous "$svc"
done

echo "=== build: ${SERVICES[*]} ==="
BUILD_ARGS=()
if [[ "$NO_CACHE" -eq 1 ]]; then
  BUILD_ARGS+=(--no-cache)
fi
"${COMPOSE[@]}" build "${BUILD_ARGS[@]}" "${SERVICES[@]}"

echo "=== recreate (no-deps, force): ${SERVICES[*]} ==="
"${COMPOSE[@]}" up -d --no-deps --force-recreate "${SERVICES[@]}"

for svc in "${SERVICES[@]}"; do
  img="vuln-${svc}"
  if docker image inspect "${img}:latest" >/dev/null 2>&1; then
    docker tag "${img}:latest" "${img}:${SHA}" 2>/dev/null || true
  fi
done

contains() {
  local needle=$1
  shift
  for x in "$@"; do [[ "$x" == "$needle" ]] && return 0; done
  return 1
}

if contains backend "${SERVICES[@]}" && [[ "$SKIP_MIGRATE" -eq 0 ]]; then
  echo "=== wait for backend health ==="
  for i in $(seq 1 30); do
    if curl -sf -o /dev/null "http://127.0.0.1:8000/health" 2>/dev/null \
      || curl -sf -o /dev/null "http://127.0.0.1:8000/api/health" 2>/dev/null; then
      echo "backend ready (attempt $i)"
      break
    fi
    if [[ "$i" -eq 30 ]]; then
      echo "error: backend did not become healthy" >&2
      docker logs vuln-backend --tail=80 2>&1 || true
      exit 1
    fi
    sleep 2
  done

  echo "=== alembic upgrade head ==="
  docker exec vuln-backend alembic upgrade head || {
    rc=$?
    echo "error: alembic exited $rc" >&2
    docker logs vuln-backend --tail=80 2>&1 || true
    exit $rc
  }
  echo "migration: $(docker exec vuln-backend alembic current 2>/dev/null | tail -1)"
fi

if contains frontend "${SERVICES[@]}"; then
  echo "=== wait for frontend :5174 ==="
  for i in $(seq 1 30); do
    if curl -sf -o /dev/null "http://127.0.0.1:5174/" 2>/dev/null; then
      echo "frontend ready (attempt $i)"
      break
    fi
    if [[ "$i" -eq 30 ]]; then
      echo "error: frontend did not become ready on :5174" >&2
      docker logs vuln-frontend --tail=80 2>&1 || true
      exit 1
    fi
    sleep 2
  done
  echo "SPA asset: $(curl -sS "http://127.0.0.1:5174/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || echo unknown)"
fi

echo "=== container status ==="
docker ps --filter "name=vuln-" --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || true

echo "=== health probes ==="
curl -sS "http://127.0.0.1:8000/health" 2>/dev/null || curl -sS "http://127.0.0.1:8000/api/health" 2>/dev/null || echo "(backend probe skipped/failed)"
echo

echo "Service-only deploy complete — SHA $SHA"
echo "Services: ${SERVICES[*]}"
echo "Postgres/redis were left running; no volumes removed."
