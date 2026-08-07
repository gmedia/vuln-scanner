#!/usr/bin/env bash
# Ensure production (or any compose) e2e user can log in for Playwright / visual QA.
#
# Usage (on the deploy host, from repo root):
#   ./scripts/ensure_e2e_user.sh
#
# Env:
#   E2E_EMAIL          default e2e@vulnscan.dev (mailbox name only — not a secret)
#   E2E_PASSWORD       required — no default in public repo
#   BACKEND_CONTAINER  default vuln-backend
#   REDIS_CONTAINER    default vuln-redis
#   DEPLOY_PATH        default /home/ubuntu/vuln-scanner (for .env / REDIS_PASSWORD)
#
# Notes:
# - backend container is read-only; Python is fed via stdin (no docker cp).
# - Always resets password + admin/verified flags + min credits.
# - Clears Redis ratelimit:* keys so prior failed logins do not 429.

set -euo pipefail

E2E_EMAIL="${E2E_EMAIL:-e2e@vulnscan.dev}"
if [[ -z "${E2E_PASSWORD:-}" ]]; then
  echo "error: E2E_PASSWORD is required (do not commit passwords; export in the shell)" >&2
  exit 1
fi
BACKEND_CONTAINER="${BACKEND_CONTAINER:-vuln-backend}"
REDIS_CONTAINER="${REDIS_CONTAINER:-vuln-redis}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/ubuntu/vuln-scanner}"
MIN_CREDITS="${MIN_CREDITS:-100}"

if ! docker ps --format '{{.Names}}' | grep -qx "$BACKEND_CONTAINER"; then
  echo "error: backend container '$BACKEND_CONTAINER' is not running" >&2
  exit 1
fi

echo "=== ensure e2e user in $BACKEND_CONTAINER ==="
# shellcheck disable=SC2016
docker exec -i -e E2E_EMAIL="$E2E_EMAIL" -e E2E_PASSWORD="$E2E_PASSWORD" -e MIN_CREDITS="$MIN_CREDITS" \
  "$BACKEND_CONTAINER" python - <<'PY'
import asyncio
import os
from datetime import UTC, datetime

from sqlalchemy import select

from app.database import async_session
from app.models.user import User
from app.services.auth import hash_password, verify_password

EMAIL = os.environ["E2E_EMAIL"]
PASSWORD = os.environ["E2E_PASSWORD"]
MIN_CREDITS = int(os.environ.get("MIN_CREDITS", "100"))


async def main() -> None:
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == EMAIL))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                email=EMAIL,
                password_hash=hash_password(PASSWORD),
                is_verified=True,
                is_admin=True,
                verified_at=datetime.now(UTC),
                credits=MIN_CREDITS,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            print(f"CREATED id={user.id} email={user.email}")
        else:
            user.password_hash = hash_password(PASSWORD)
            user.is_admin = True
            user.is_verified = True
            user.verified_at = user.verified_at or datetime.now(UTC)
            if (user.credits or 0) < MIN_CREDITS:
                user.credits = MIN_CREDITS
            await session.commit()
            await session.refresh(user)
            print(
                f"UPDATED id={user.id} email={user.email} "
                f"admin={user.is_admin} verified={user.is_verified} credits={user.credits}"
            )
        ok = verify_password(PASSWORD, user.password_hash)
        print(f"password_verify={ok}")
        if not ok:
            raise SystemExit("password verify failed after write")


asyncio.run(main())
PY

echo "=== clear redis rate-limit keys ==="
if docker ps --format '{{.Names}}' | grep -qx "$REDIS_CONTAINER"; then
  if [[ -f "$DEPLOY_PATH/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$DEPLOY_PATH/.env"
    set +a
  fi
  if [[ -z "${REDIS_PASSWORD:-}" ]]; then
    echo "warn: REDIS_PASSWORD unset; skip rate-limit clear" >&2
  else
    mapfile -t keys < <(
      docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning \
        --scan --pattern 'ratelimit:*' 2>/dev/null || true
    )
    if ((${#keys[@]} == 0)); then
      echo "no ratelimit:* keys"
    else
      for key in "${keys[@]}"; do
        [[ -z "$key" ]] && continue
        docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning DEL "$key" >/dev/null
        echo "deleted $key"
      done
    fi
  fi
else
  echo "warn: redis container '$REDIS_CONTAINER' not running; skip rate-limit clear" >&2
fi

echo "=== done ==="
echo "Login: $E2E_EMAIL / (E2E_PASSWORD)"
echo "Do NOT POST /api/auth/register for this email on prod — it creates an unverified user."
