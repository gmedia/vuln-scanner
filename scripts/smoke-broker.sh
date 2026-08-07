#!/usr/bin/env bash
# Smoke Redis broker path used by API + Celery (no scan jobs).
#
# Usage:
#   ./scripts/smoke-broker.sh
#   BASE_URL=https://vs.appmedia.id ./scripts/smoke-broker.sh
#   ./scripts/smoke-broker.sh /home/ubuntu/vuln-scanner
#
# On the deploy host, also PING redis via docker when COMPOSE project is up.

set -euo pipefail

DEPLOY_PATH="${1:-${DEPLOY_PATH:-}}"
BASE_URL="${BASE_URL:-https://vs.appmedia.id}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vuln}"

fail=0

echo "=== API health (${BASE_URL}) ==="
health_json="$(curl -fsS --max-time 15 "${BASE_URL}/api/health" || curl -fsS --max-time 15 "${BASE_URL}/health" || true)"
if [[ -z "${health_json}" ]]; then
  echo "FAIL: could not fetch health"
  fail=1
else
  echo "${health_json}"
  echo "${health_json}" | grep -q '"status":"ok"' || {
    echo "FAIL: status not ok"
    fail=1
  }
  echo "${health_json}" | grep -qi 'redis' || echo "WARN: redis field not found in health payload"
fi

echo "=== queue depths (${BASE_URL}/health/queues) ==="
queues_json="$(curl -fsS --max-time 15 "${BASE_URL}/health/queues" || true)"
if [[ -z "${queues_json}" ]]; then
  echo "FAIL: could not fetch /health/queues"
  fail=1
else
  echo "${queues_json}"
  for q in ip_scan domain_scan mobile_scan; do
    echo "${queues_json}" | grep -q "${q}" || {
      echo "FAIL: missing queue key ${q}"
      fail=1
    }
  done
fi

if [[ -n "${DEPLOY_PATH}" && -d "${DEPLOY_PATH}" ]]; then
  # shellcheck disable=SC1091
  if [[ -f "${DEPLOY_PATH}/.env" ]]; then
    set -a
    # REDIS_PASSWORD only; avoid sourcing entire .env if it has odd syntax — best effort
    # shellcheck disable=SC2046
    export $(grep -E '^REDIS_PASSWORD=' "${DEPLOY_PATH}/.env" | tr -d '\r' || true)
    set +a
  fi
  echo "=== docker redis PING (project=${COMPOSE_PROJECT_NAME}) ==="
  if docker ps --format '{{.Names}}' | grep -qx 'vuln-redis'; then
    if [[ -z "${REDIS_PASSWORD:-}" ]]; then
      echo "WARN: REDIS_PASSWORD unset; trying ping without -a"
      docker exec vuln-redis redis-cli PING || fail=1
    else
      docker exec vuln-redis redis-cli -a "${REDIS_PASSWORD}" PING || fail=1
    fi
  else
    echo "SKIP: container vuln-redis not running on this host"
  fi
fi

if [[ "${fail}" -ne 0 ]]; then
  echo "=== smoke-broker: FAILED ==="
  exit 1
fi
echo "=== smoke-broker: OK ==="
