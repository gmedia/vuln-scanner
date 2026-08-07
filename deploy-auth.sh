#!/bin/bash
# One-shot helper to append JWT/SMTP env on a deploy host and rebuild backend/frontend.
# Prefer routine deploys via scripts/deploy-services.sh.
#
# Usage:
#   export DEPLOY_SSH='user@host'          # required
#   export DEPLOY_SSH_PORT=22              # optional, default 22
#   export DEPLOY_PATH=/path/to/vuln-scanner
#   bash deploy-auth.sh <SMTP_HOST> <SMTP_PORT> <SMTP_USER> <SMTP_PASS> <SMTP_FROM> [FRONTEND_URL]
#
# FRONTEND_URL defaults to https://vs.appmedia.id

set -euo pipefail

if [ $# -lt 5 ]; then
    echo "Usage: DEPLOY_SSH=user@host bash deploy-auth.sh <SMTP_HOST> <SMTP_PORT> <SMTP_USER> <SMTP_PASS> <SMTP_FROM> [FRONTEND_URL]"
    exit 1
fi

if [[ -z "${DEPLOY_SSH:-}" ]]; then
    echo "error: set DEPLOY_SSH=user@host (do not hardcode production hosts in this public repo)" >&2
    exit 1
fi

SMTP_HOST="$1"
SMTP_PORT="$2"
SMTP_USER="$3"
SMTP_PASS="$4"
SMTP_FROM="$5"
FRONTEND_URL="${6:-https://vs.appmedia.id}"

SERVER="$DEPLOY_SSH"
SERVER_PATH="${DEPLOY_PATH:-/home/ubuntu/vuln-scanner}"
SSH_PORT="${DEPLOY_SSH_PORT:-22}"

JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

echo "=== Step 1: Add env vars to server .env ==="
ssh -p "$SSH_PORT" "$SERVER" "cat >> $SERVER_PATH/.env << 'ENVEOF'
JWT_SECRET=${JWT_SECRET}
JWT_ALGORITHM=HS256
JWT_ACCESS_EXPIRE_MINUTES=30
JWT_REFRESH_EXPIRE_DAYS=7
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_FROM}
FRONTEND_URL=${FRONTEND_URL}
ENVEOF"

echo "[OK] Env vars added"

echo ""
echo "=== Step 2: Pull latest code on server ==="
ssh -p "$SSH_PORT" "$SERVER" "cd $SERVER_PATH && git pull origin main"

echo "[OK] Code pulled"

echo ""
echo "=== Step 3: Rebuild Docker images ==="
ssh -p "$SSH_PORT" "$SERVER" "cd $SERVER_PATH && docker compose -f docker-compose.prod.yml build --no-cache backend frontend"

echo "[OK] Images rebuilt"

echo ""
echo "=== Step 4: Restart containers ==="
ssh -p "$SSH_PORT" "$SERVER" "cd $SERVER_PATH && docker compose -f docker-compose.prod.yml up -d backend frontend"

echo "[OK] Containers restarted"

echo ""
echo "=== Step 5: Check backend logs ==="
sleep 10
ssh -p "$SSH_PORT" "$SERVER" "docker logs vuln-backend --tail 50"

echo ""
echo "=== Deployment complete ==="
echo "JWT_SECRET generated (save from this run output only; do not commit)."
echo "Test register/login against FRONTEND_URL/api/auth/* with your own test credentials."
