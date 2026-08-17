#!/usr/bin/env bash
# Repeatable Guard host enroll/unenroll on the existing lab agent VM (SSH alias tc5).
#
# Not Playwright. Default refuses sinexis.app / vs.appmedia.id.
# Token generate/revoke stays in CI Layer B. This redeems POST /api/guard/enroll
# and optionally imports the key on tc5. Unenroll is Manager DELETE (no product API).
#
#   export GUARD_LAB_APP_BASE GUARD_LAB_EMAIL GUARD_LAB_PASSWORD
#   export GUARD_LAB_AGENT_SSH=tc5
#   ./scripts/guard-lab-enroll-smoke.sh
#   ./scripts/guard-lab-enroll-smoke.sh --api-only
#   ./scripts/guard-lab-enroll-smoke.sh --unenroll
#
# Unenroll also needs WAZUH_MANAGER_URL WAZUH_MANAGER_USER WAZUH_MANAGER_PASSWORD.
# Never prints tokens, agent keys, passwords, or host IPs.

set -euo pipefail

API_ONLY=0
DO_UNENROLL=0
SKIP_APPLY=0
for arg in "$@"; do
  case "$arg" in
    --api-only) API_ONLY=1 ;;
    --unenroll) DO_UNENROLL=1 ;;
    --skip-apply) SKIP_APPLY=1 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "error: unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

GUARD_LAB_APP_BASE="${GUARD_LAB_APP_BASE:-}"
GUARD_LAB_EMAIL="${GUARD_LAB_EMAIL:-${E2E_EMAIL:-}}"
GUARD_LAB_PASSWORD="${GUARD_LAB_PASSWORD:-${E2E_PASSWORD:-}}"
GUARD_LAB_AGENT_SSH="${GUARD_LAB_AGENT_SSH:-tc5}"
AGENT_NAME_PREFIX="${GUARD_LAB_AGENT_PREFIX:-e2e-tc5}"
PROTECTED_IDS="${GUARD_LAB_PROTECTED_AGENT_IDS:-000,003}"
WAIT_SECONDS="${GUARD_LAB_WAIT_SECONDS:-90}"
VERIFY_TLS="${GUARD_LAB_VERIFY_TLS:-1}"

log() { echo "=== $* ==="; }
die() { echo "error: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

is_public_prod_base() {
  local host
  host="$(python3 -c 'import os,urllib.parse; print(urllib.parse.urlparse(os.environ.get("GUARD_LAB_APP_BASE","")).hostname or "")')"
  case "$host" in
    sinexis.app|*.sinexis.app|vs.appmedia.id|*.vs.appmedia.id)
      return 0
      ;;
  esac
  return 1
}

json_get() {
  local raw="$1"
  local expr="$2"
  GUARD_JSON_RAW="$raw" python3 -c "import json,os; o=json.loads(os.environ['GUARD_JSON_RAW']); print($expr)"
}

curl_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local args=(-sS -X "$method" --max-time 30)
  if [[ "$VERIFY_TLS" == "0" ]]; then
    args+=(-k)
  fi
  if [[ -n "${ACCESS_TOKEN:-}" ]]; then
    args+=(-H "Authorization: Bearer ${ACCESS_TOKEN}")
  fi
  if [[ -n "$data" ]]; then
    args+=(-H "Content-Type: application/json" -d "$data")
  fi
  args+=(-w $'\n%{http_code}' "${GUARD_LAB_APP_BASE}${path}")
  curl "${args[@]}"
}

split_body_code() {
  local blob="$1"
  HTTP_BODY="$(printf '%s' "$blob" | sed '$d')"
  HTTP_CODE="$(printf '%s' "$blob" | tail -n1)"
}

require_cmd curl
require_cmd python3
require_cmd ssh

[[ -n "$GUARD_LAB_APP_BASE" ]] || die "GUARD_LAB_APP_BASE is required"
[[ -n "$GUARD_LAB_EMAIL" ]] || die "GUARD_LAB_EMAIL (or E2E_EMAIL) is required"
[[ -n "$GUARD_LAB_PASSWORD" ]] || die "GUARD_LAB_PASSWORD (or E2E_PASSWORD) is required"

GUARD_LAB_APP_BASE="${GUARD_LAB_APP_BASE%/}"
export GUARD_LAB_APP_BASE

if is_public_prod_base && [[ "${GUARD_LAB_ALLOW_PUBLIC_PROD:-0}" != "1" ]]; then
  die "refusing public prod origin (override: GUARD_LAB_ALLOW_PUBLIC_PROD=1 for lab host vs that API only)"
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
AGENT_NAME="${AGENT_NAME_PREFIX}-${STAMP}"
if (( ${#AGENT_NAME} > 63 )); then
  AGENT_NAME="${AGENT_NAME:0:63}"
fi

STATE_DIR="${GUARD_LAB_STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/guard-lab-enroll}"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
STATE_FILE="${STATE_DIR}/last-enroll.env"

login() {
  log "login (email only; password not printed)"
  local payload blob
  payload="$(GUARD_LAB_EMAIL="$GUARD_LAB_EMAIL" GUARD_LAB_PASSWORD="$GUARD_LAB_PASSWORD" python3 -c 'import json,os; print(json.dumps({"email":os.environ["GUARD_LAB_EMAIL"],"password":os.environ["GUARD_LAB_PASSWORD"]}))')"
  blob="$(curl_api POST /api/auth/login "$payload")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "login failed HTTP ${HTTP_CODE}"
  ACCESS_TOKEN="$(json_get "$HTTP_BODY" "o.get('access_token') or o.get('accessToken') or ''")"
  [[ -n "$ACCESS_TOKEN" ]] || die "login response missing access_token"
}

ensure_enabled() {
  log "GET /api/guard/status"
  local blob enabled
  blob="$(curl_api GET /api/guard/status)"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "status HTTP ${HTTP_CODE}"
  enabled="$(json_get "$HTTP_BODY" "str(o.get('enabled')).lower()")"
  if [[ "$enabled" != "true" ]]; then
    log "POST /api/guard/enable"
    blob="$(curl_api POST /api/guard/enable '{}')"
    split_body_code "$blob"
    [[ "$HTTP_CODE" == "200" ]] || die "enable HTTP ${HTTP_CODE}"
  fi
}

create_token() {
  log "POST /api/guard/enroll-tokens"
  local blob
  blob="$(curl_api POST /api/guard/enroll-tokens "$(python3 -c "import json; print(json.dumps({'label': 'lab-tc5-${STAMP}'}))")")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "201" || "$HTTP_CODE" == "200" ]] || die "enroll-tokens HTTP ${HTTP_CODE}"
  ENROLL_TOKEN="$(json_get "$HTTP_BODY" "o.get('token') or ''")"
  ENROLL_TOKEN_ID="$(json_get "$HTTP_BODY" "str(o.get('id') or '')")"
  [[ -n "$ENROLL_TOKEN" ]] || die "enroll token missing in response"
}

redeem_enroll() {
  log "POST /api/guard/enroll agent_name=${AGENT_NAME}"
  local payload blob saved
  payload="$(ENROLL_TOKEN="$ENROLL_TOKEN" AGENT_NAME="$AGENT_NAME" python3 -c 'import json,os; print(json.dumps({"token":os.environ["ENROLL_TOKEN"],"agent_name":os.environ["AGENT_NAME"]}))')"
  saved="${ACCESS_TOKEN:-}"
  ACCESS_TOKEN=""
  blob="$(curl_api POST /api/guard/enroll "$payload")"
  ACCESS_TOKEN="$saved"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "enroll HTTP ${HTTP_CODE} (body redacted)"
  WAZUH_AGENT_ID="$(json_get "$HTTP_BODY" "str(o.get('agent_id') or '')")"
  AGENT_KEY="$(json_get "$HTTP_BODY" "o.get('agent_key') or ''")"
  MANAGER_HOST="$(json_get "$HTTP_BODY" "o.get('manager_host') or ''")"
  [[ -n "$WAZUH_AGENT_ID" && -n "$AGENT_KEY" && -n "$MANAGER_HOST" ]] || die "enroll response incomplete"
  case ",${PROTECTED_IDS}," in
    *",${WAZUH_AGENT_ID},"*) die "enroll returned protected agent id ${WAZUH_AGENT_ID}" ;;
  esac
  umask 077
  cat >"$STATE_FILE" <<EOF
WAZUH_AGENT_ID=${WAZUH_AGENT_ID}
AGENT_NAME=${AGENT_NAME}
MANAGER_HOST=${MANAGER_HOST}
ENROLL_TOKEN_ID=${ENROLL_TOKEN_ID}
EOF
  chmod 600 "$STATE_FILE"
  log "enrolled wazuh_agent_id=${WAZUH_AGENT_ID} (key not printed; state ${STATE_FILE})"
}

sync_and_list() {
  log "POST /api/guard/sync"
  local blob
  blob="$(curl_api POST /api/guard/sync '{}')"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "sync HTTP ${HTTP_CODE}"
  log "GET /api/guard/agents"
  blob="$(curl_api GET /api/guard/agents)"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "agents HTTP ${HTTP_CODE}"
  python3 -c "
import json,sys
rows=json.loads(sys.argv[1])
want=sys.argv[2]
wid=sys.argv[3]
found=[r for r in rows if r.get('name')==want or str(r.get('wazuh_agent_id'))==wid]
print('agent_rows_matching', len(found))
for r in found:
    print('status', r.get('status'), 'name', r.get('name'), 'id', r.get('wazuh_agent_id'))
if not found:
    sys.exit(1)
" "$HTTP_BODY" "$AGENT_NAME" "$WAZUH_AGENT_ID"
}

apply_on_tc5() {
  log "apply key on SSH host ${GUARD_LAB_AGENT_SSH} (stdin; key not logged)"
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "${GUARD_LAB_AGENT_SSH}" \
    "sudo test -x /var/ossec/bin/manage_agents"
  if [[ -n "${MANAGER_HOST:-}" ]]; then
    ssh -o BatchMode=yes "${GUARD_LAB_AGENT_SSH}" \
      "sudo sed -i 's|<address>.*</address>|<address>${MANAGER_HOST}</address>|g' /var/ossec/etc/ossec.conf"
  fi
  printf '%s\n' "$AGENT_KEY" | ssh -o BatchMode=yes "${GUARD_LAB_AGENT_SSH}" \
    "sudo /var/ossec/bin/manage_agents -i /dev/stdin >/dev/null"
  ssh -o BatchMode=yes "${GUARD_LAB_AGENT_SSH}" \
    "sudo systemctl daemon-reload || true; sudo systemctl enable --now wazuh-agent; sudo systemctl is-active wazuh-agent"
}

wait_and_resync() {
  log "wait ${WAIT_SECONDS}s for keep-alive then sync"
  sleep "$WAIT_SECONDS"
  sync_and_list || true
}

is_protected_id() {
  case ",${PROTECTED_IDS}," in
    *",$1,"*) return 0 ;;
  esac
  return 1
}

manager_delete_agent() {
  local aid="$1"
  is_protected_id "$aid" && die "refusing to delete protected agent id ${aid}"
  [[ -n "${WAZUH_MANAGER_URL:-}" ]] || die "WAZUH_MANAGER_URL required for --unenroll"
  [[ -n "${WAZUH_MANAGER_USER:-}" && -n "${WAZUH_MANAGER_PASSWORD:-}" ]] || die "WAZUH_MANAGER_USER/PASSWORD required for --unenroll"
  local verify=()
  [[ "${WAZUH_VERIFY_TLS:-true}" == "false" || "${WAZUH_VERIFY_TLS:-1}" == "0" ]] && verify=(-k)
  log "Manager DELETE /agents?agents_list=${aid}"
  local tok blob jwt
  tok="$(curl -sS "${verify[@]}" -u "${WAZUH_MANAGER_USER}:${WAZUH_MANAGER_PASSWORD}" \
    -X POST --max-time 30 "${WAZUH_MANAGER_URL%/}/security/user/authenticate")"
  jwt="$(json_get "$tok" "((o.get('data') or {}).get('token') if isinstance(o, dict) else '') or o.get('token') or ''")"
  [[ -n "$jwt" ]] || die "manager auth failed"
  blob="$(curl -sS "${verify[@]}" -H "Authorization: Bearer ${jwt}" \
    -X DELETE --max-time 30 \
    -w $'\n%{http_code}' \
    "${WAZUH_MANAGER_URL%/}/agents?pretty=true&older_than=0s&agents_list=${aid}&status=all")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "manager delete HTTP ${HTTP_CODE}"
}

purge_on_tc5() {
  log "stop wazuh-agent on ${GUARD_LAB_AGENT_SSH} (package left installed)"
  ssh -o BatchMode=yes "${GUARD_LAB_AGENT_SSH}" \
    "sudo systemctl stop wazuh-agent || true; sudo systemctl is-active wazuh-agent || true"
}

load_state() {
  [[ -f "$STATE_FILE" ]] || die "no state file ${STATE_FILE} — run enroll first"
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  [[ -n "${WAZUH_AGENT_ID:-}" ]] || die "state missing WAZUH_AGENT_ID"
}

if [[ "$DO_UNENROLL" -eq 1 ]]; then
  login
  load_state
  manager_delete_agent "$WAZUH_AGENT_ID"
  if [[ "$API_ONLY" -eq 0 && "$SKIP_APPLY" -eq 0 ]]; then
    purge_on_tc5 || true
  fi
  sync_and_list || true
  log "unenroll done for wazuh_agent_id=${WAZUH_AGENT_ID}"
  exit 0
fi

login
ensure_enabled
create_token
redeem_enroll
sync_and_list || true

if [[ "$API_ONLY" -eq 0 && "$SKIP_APPLY" -eq 0 ]]; then
  apply_on_tc5
  wait_and_resync
else
  log "skip host apply (--api-only/--skip-apply); Manager has pending agent ${WAZUH_AGENT_ID}"
fi

log "done. Unenroll later: $0 --unenroll (uses ${STATE_FILE})"
