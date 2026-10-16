#!/usr/bin/env bash
# Env-inventory drift guard.
#
# Keeps a fresh server/domain deploy reproducible from the repo + GitHub alone:
# every env var the production compose files read, and every var the CI deploy
# job writes into the app-host .env, must be documented in .env.example.
#
# Usage: ./scripts/check-env-inventory.sh
# Exit 0 when the inventory is complete; exit 1 (listing the missing keys) otherwise.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

EXAMPLE=".env.example"
COMPOSE_FILES=(docker-compose.prod.yml docker-compose.prod.remote-data.yml)
WORKFLOW=".github/workflows/ci.yml"

# Connection-only keys written by the CI deploy job. They are deploy infra, not
# app config, so they intentionally do NOT belong in .env.example.
DEPLOY_INFRA_KEYS=(
  DEPLOY_HOST DEPLOY_USER DEPLOY_SSH_KEY DEPLOY_PORT DEPLOY_PATH
  DEPLOY_JUMP_HOST DEPLOY_JUMP_USER DEPLOY_JUMP_SSH_KEY DEPLOY_JUMP_PORT
)

for f in "$EXAMPLE" "${COMPOSE_FILES[@]}" "$WORKFLOW"; do
  [[ -f "$f" ]] || { echo "error: missing $f (run from the repo root)" >&2; exit 2; }
done

sorted() { LC_ALL=C sort -u; }

# Keys documented in .env.example (a "KEY=" at the start of a line).
example_keys="$(grep -oE '^[A-Z][A-Z0-9_]*=' "$EXAMPLE" | tr -d '=' | sorted)"

# Keys read by compose: "${KEY...}" and "${KEY:-default}".
compose_keys="$(grep -ohE '\$\{[A-Z][A-Z0-9_]*' "${COMPOSE_FILES[@]}" | sed 's/^${//' | sorted)"

# Keys the CI "Write .env on server" step writes from GitHub secrets.
ci_keys="$(sed -n '/Write \.env on server/,/chmod 600/p' "$WORKFLOW" \
  | grep -oE 'secrets\.[A-Z0-9_]+' | sed 's/^secrets\.//' | sorted)"

if [[ -z "$compose_keys" || -z "$ci_keys" ]]; then
  echo "error: could not extract keys (compose='${compose_keys}' ci='${ci_keys}')" >&2
  echo "       a compose file or the CI step name/range likely changed — update this script." >&2
  exit 2
fi

allow_keys="$(printf '%s\n' "${DEPLOY_INFRA_KEYS[@]}" | sorted)"
documented_or_infra="$(cat <(printf '%s\n' "$example_keys") <(printf '%s\n' "$allow_keys") | sorted)"

fail=0

missing_compose="$(comm -23 <(printf '%s\n' "$compose_keys") <(printf '%s\n' "$example_keys"))"
if [[ -n "$missing_compose" ]]; then
  echo "FAIL: keys read by ${COMPOSE_FILES[*]} but missing from $EXAMPLE:" >&2
  printf '  %s\n' $missing_compose >&2
  fail=1
fi

missing_ci="$(comm -23 <(printf '%s\n' "$ci_keys") <(printf '%s\n' "$documented_or_infra"))"
if [[ -n "$missing_ci" ]]; then
  echo "FAIL: keys written by the CI deploy job but missing from $EXAMPLE:" >&2
  printf '  %s\n' $missing_ci >&2
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo >&2
  echo "Add the keys above to $EXAMPLE — or, only if they are truly connection-only" >&2
  echo "and must not live in the app .env, add them to DEPLOY_INFRA_KEYS in this script." >&2
  exit 1
fi

echo "OK: env inventory complete — $EXAMPLE: $(printf '%s\n' "$example_keys" | wc -l) keys; compose: $(printf '%s\n' "$compose_keys" | wc -l); ci-written: $(printf '%s\n' "$ci_keys" | wc -l)."
