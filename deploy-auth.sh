#!/bin/bash
# Deploy JWT auth system to production server.
# Usage: bash deploy-auth.sh <SMTP_HOST> <SMTP_PORT> <SMTP_USER> <SMTP_PASS> <SMTP_FROM> [FRONTEND_URL]
# FRONTEND_URL defaults to https://vs.appmedia.id

set -euo pipefail

if [ $# -lt 5 ]; then
    echo "Usage: bash deploy-auth.sh <SMTP_HOST> <SMTP_PORT> <SMTP_USER> <SMTP_PASS> <SMTP_FROM> [FRONTEND_URL]"
    exit 1
fi

SMTP_HOST="$1"
SMTP_PORT="$2"
SMTP_USER="$3"
SMTP_PASS="$4"
SMTP_FROM="$5"
FRONTEND_URL="${6:-https://vs.appmedia.id}"

SERVER="ubuntu@103.217.209.127"
SERVER_PATH="/home/ubuntu/vuln-scanner"

# Generate JWT secret
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

echo "=== Step 1: Add env vars to server .env ==="
ssh -p 4122 "$SERVER" "cat >> $SERVER_PATH/.env << 'ENVEOF'
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
ssh -p 4122 "$SERVER" "cd $SERVER_PATH && git pull origin main"

echo "[OK] Code pulled"

echo ""
echo "=== Step 3: Rebuild Docker images ==="
ssh -p 4122 "$SERVER" "cd $SERVER_PATH && docker compose -f docker-compose.prod.yml build --no-cache backend frontend"

echo "[OK] Images rebuilt"

echo ""
echo "=== Step 4: Restart containers ==="
ssh -p 4122 "$SERVER" "cd $SERVER_PATH && docker compose -f docker-compose.prod.yml up -d backend frontend"

echo "[OK] Containers restarted"

echo ""
echo "=== Step 5: Check backend logs ==="
sleep 10
ssh -p 4122 "$SERVER" "docker logs vuln-backend --tail 50"

echo ""
echo "=== Deployment complete ==="
echo "JWT_SECRET (save this): ${JWT_SECRET}"
echo ""
echo "Test endpoints:"
echo "  Register:  curl -X POST https://vs.appmedia.id/api/auth/register -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\",\"password\":\"Test1234\"}'"
echo "  Login:     curl -X POST https://vs.appmedia.id/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\",\"password\":\"Test1234\"}'"
