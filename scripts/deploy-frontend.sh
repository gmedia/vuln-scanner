#!/usr/bin/env bash
# Frontend-only production deploy (SPA). Prefer this for UI-only waves.
#
# Why not scripts/deploy.sh?
#   Full deploy rebuilds all images and historically used destructive volume
#   cleanup paths. SPA-only changes only need the frontend image rebuilt and
#   recreated; backend/DB/workers stay up.
#
# Usage (on the deploy host, from repo root):
#   ./scripts/deploy-frontend.sh
#   ./scripts/deploy-frontend.sh /home/ubuntu/vuln-scanner
#
# Prerequisites:
#   - git on main (or desired SHA) already pulled
#   - docker-compose.prod.yml + .env present
#   - host nginx proxies to 127.0.0.1:5174 (see nginx/vs.appmedia.id.conf)
#
# Verify after:
#   curl -sS https://vs.appmedia.id/api/health
#   curl -sS https://vs.appmedia.id/ | grep -oE 'assets/index-[^"]+\.js'

set -euo pipefail

DEPLOY_PATH="${1:-${DEPLOY_PATH:-/home/ubuntu/vuln-scanner}}"
cd "$DEPLOY_PATH"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-vuln}"
COMPOSE=(docker compose -f docker-compose.prod.yml)

echo "=== frontend-only deploy ==="
echo "path: $DEPLOY_PATH"
echo "sha:  $(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))"

echo "=== build frontend image ==="
"${COMPOSE[@]}" build frontend

echo "=== recreate frontend container ==="
"${COMPOSE[@]}" up -d --no-deps --force-recreate frontend

echo "=== wait for frontend port 5174 ==="
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

SHA=$(git rev-parse --short HEAD)
echo "=== tag frontend image with SHA ==="
docker tag vuln-frontend:latest "vuln-frontend:${SHA}" 2>/dev/null || true

echo "=== local SPA asset ==="
curl -sS "http://127.0.0.1:5174/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true

echo "=== health (backend should still be up) ==="
curl -sS "http://127.0.0.1:8000/health" || curl -sS "http://127.0.0.1:8000/api/health" || true
echo

echo "Frontend-only deploy complete — SHA $SHA"
echo "If host nginx caches, hard-refresh or purge CDN; public URL should show the new index-*.js hash."
