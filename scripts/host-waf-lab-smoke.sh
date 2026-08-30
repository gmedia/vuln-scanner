#!/usr/bin/env bash
# Repeatable Host WAF API smoke (S5).
#
# Not Playwright. Does not enroll Guard. Does not wipe tc5.
# Does not SSH to tc5. Does not paste onto sinexis.app edge nginx.
# Default refuses sinexis.app / vs.appmedia.id.
# Never prints tokens, passwords, or host IPs.
#
#   export GUARD_LAB_APP_BASE GUARD_LAB_EMAIL GUARD_LAB_PASSWORD
#   ./scripts/host-waf-lab-smoke.sh
#   ./scripts/host-waf-lab-smoke.sh --keep-site
#   HOST_WAF_LAB_VHOST_SSH=<lab-alias> ./scripts/host-waf-lab-smoke.sh --apply-vhost
#
# --apply-vhost copies the generated snippet to a disposable lab vhost via SSH.
# Refuse aliases tc5 and any name containing erp / sx-erpstg.
# Requires HOST_WAF_ENABLED on the API.

set -euo pipefail

KEEP_SITE=0
APPLY_VHOST=0
for arg in "$@"; do
  case "$arg" in
    --keep-site) KEEP_SITE=1 ;;
    --apply-vhost) APPLY_VHOST=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"
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
VERIFY_TLS="${GUARD_LAB_VERIFY_TLS:-1}"
ROOT_PATH="${HOST_WAF_LAB_ROOT_PATH:-/var/www/host-waf-fixture}"
SITE_NAME="${HOST_WAF_LAB_SITE_NAME:-lab-host-waf-fixture}"
AGENT_UUID="${HOST_WAF_LAB_AGENT_UUID:-${HOST_PROTECT_LAB_AGENT_UUID:-}}"
VHOST_SSH="${HOST_WAF_LAB_VHOST_SSH:-}"
SNIPPET_REMOTE="${HOST_WAF_LAB_SNIPPET_REMOTE:-/tmp/sinexis-host-waf-lab.conf}"

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

[[ -n "$GUARD_LAB_APP_BASE" ]] || die "GUARD_LAB_APP_BASE is required"
[[ -n "$GUARD_LAB_EMAIL" ]] || die "GUARD_LAB_EMAIL (or E2E_EMAIL) is required"
[[ -n "$GUARD_LAB_PASSWORD" ]] || die "GUARD_LAB_PASSWORD (or E2E_PASSWORD) is required"

GUARD_LAB_APP_BASE="${GUARD_LAB_APP_BASE%/}"
export GUARD_LAB_APP_BASE

if is_public_prod_base && [[ "${HOST_WAF_LAB_ALLOW_PUBLIC_PROD:-${GUARD_LAB_ALLOW_PUBLIC_PROD:-0}}" != "1" ]]; then
  die "refusing public prod origin (override: HOST_WAF_LAB_ALLOW_PUBLIC_PROD=1 or GUARD_LAB_ALLOW_PUBLIC_PROD=1)"
fi

case "$ROOT_PATH" in
  /var/www/*|/srv/www/*|/home/*) ;;
  *) die "HOST_WAF_LAB_ROOT_PATH must be under /var/www, /srv/www, or /home" ;;
esac
if [[ "$ROOT_PATH" == *..* ]]; then
  die "HOST_WAF_LAB_ROOT_PATH must not contain .."
fi
case "$ROOT_PATH" in
  *erp*|*sx-erpstg*|*sx_erpstg*)
    die "HOST_WAF_LAB_ROOT_PATH looks like ERP — use a disposable fixture path"
    ;;
esac

if [[ "$APPLY_VHOST" -eq 1 ]]; then
  [[ -n "$VHOST_SSH" ]] || die "--apply-vhost requires HOST_WAF_LAB_VHOST_SSH (not tc5)"
  case "$VHOST_SSH" in
    tc5|tc5.*|*erp*|*sx-erpstg*)
      die "HOST_WAF_LAB_VHOST_SSH refuses tc5 and ERP aliases — disposable lab vhost only"
      ;;
  esac
fi

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

pick_agent() {
  log "GET /api/guard/agents"
  local blob
  blob="$(curl_api GET /api/guard/agents)"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "guard agents HTTP ${HTTP_CODE} (is Guard enabled?)"
  AGENT_ID="$(AGENT_UUID="$AGENT_UUID" python3 -c "
import json,os,sys
rows=json.loads(sys.argv[1])
want=os.environ.get('AGENT_UUID','').strip()
if not isinstance(rows, list):
    sys.exit(2)
if want:
    for r in rows:
        if str(r.get('id'))==want:
            print(r['id']); sys.exit(0)
    sys.exit(3)
if not rows:
    sys.exit(4)
print(rows[0]['id'])
" "$HTTP_BODY")" || {
    case $? in
      3) die "HOST_WAF_LAB_AGENT_UUID not in agent list" ;;
      4) die "no Guard agents — enroll first; Playwright is not enroll" ;;
      *) die "could not parse guard agents" ;;
    esac
  }
  log "using guard_agent_id=${AGENT_ID}"
}

ensure_waf_flag() {
  log "GET /api/host/waf/policies (flag check)"
  local blob
  blob="$(curl_api GET /api/host/waf/policies)"
  split_body_code "$blob"
  if [[ "$HTTP_CODE" == "404" ]]; then
    die "Host WAF API 404 — HOST_WAF_ENABLED is off (leave git default false)"
  fi
  [[ "$HTTP_CODE" == "200" ]] || die "waf policies HTTP ${HTTP_CODE}"
}

create_site() {
  log "POST /api/host/sites name=${SITE_NAME}"
  local payload blob
  payload="$(SITE_NAME="$SITE_NAME" AGENT_ID="$AGENT_ID" ROOT_PATH="$ROOT_PATH" python3 -c 'import json,os; print(json.dumps({
    "name": os.environ["SITE_NAME"],
    "guard_agent_id": os.environ["AGENT_ID"],
    "root_path": os.environ["ROOT_PATH"],
    "cms_hint": "wordpress",
    "auto_quarantine": False,
  }))')"
  blob="$(curl_api POST /api/host/sites "$payload")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "201" || "$HTTP_CODE" == "200" ]] || die "create site HTTP ${HTTP_CODE} (body redacted)"
  SITE_ID="$(json_get "$HTTP_BODY" "str(o.get('id') or '')")"
  [[ -n "$SITE_ID" ]] || die "create site missing id"
  log "site_id=${SITE_ID}"
}

upsert_policy() {
  log "PUT WAF policy protect/mock"
  local blob
  blob="$(curl_api PUT "/api/host/waf/sites/${SITE_ID}/policy" '{"mode":"protect","engine":"mock","paranoia":1}')"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "upsert policy HTTP ${HTTP_CODE}"
}

fetch_snippet() {
  log "GET snippet"
  local blob
  blob="$(curl_api GET "/api/host/waf/sites/${SITE_ID}/snippet")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "snippet HTTP ${HTTP_CODE}"
  SNIPPET="$(json_get "$HTTP_BODY" "o.get('content') or ''")"
  [[ -n "$SNIPPET" ]] || die "snippet empty"
  printf '%s' "$SNIPPET" | grep -qi "do not paste onto sinexis.app" || die "snippet missing edge-nginx warning"
  printf '%s' "$SNIPPET" | grep -qiE '(^|[[:space:]])listen[[:space:]]' && die "snippet must not contain listen"
  log "snippet ok (not printed)"
}

simulate_and_events() {
  log "POST simulate"
  local blob action
  blob="$(curl_api POST "/api/host/waf/sites/${SITE_ID}/simulate" '{}')"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "201" ]] || die "simulate HTTP ${HTTP_CODE}"
  action="$(json_get "$HTTP_BODY" "o.get('action') or ''")"
  [[ "$action" == "block" ]] || die "expected action=block got ${action}"
  printf '%s' "$HTTP_BODY" | grep -q full_log && die "simulate body must not include full_log"
  blob="$(curl_api GET "/api/host/waf/events?site_id=${SITE_ID}")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "events HTTP ${HTTP_CODE}"
  local n
  n="$(json_get "$HTTP_BODY" "len(o) if isinstance(o, list) else 0")"
  [[ "$n" != "0" ]] || die "expected at least one WAF event"
  log "events=${n}"
}

apply_vhost() {
  [[ "$APPLY_VHOST" -eq 1 ]] || return 0
  require_cmd ssh
  require_cmd scp
  log "copy snippet to disposable lab vhost (alias not printed as IP)"
  local tmp
  tmp="$(mktemp)"
  printf '%s\n' "$SNIPPET" >"$tmp"
  scp -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new \
    "$tmp" "${VHOST_SSH}:${SNIPPET_REMOTE}" || {
    rm -f "$tmp"
    die "scp snippet failed (disposable vhost only; never tc5/ERP)"
  }
  rm -f "$tmp"
  log "snippet copied to remote path (not nginx/sinexis.app.conf). Operator must include it on a lab vhost."
}

delete_site() {
  if [[ "$KEEP_SITE" -eq 1 ]]; then
    log "keep site ${SITE_ID} (--keep-site)"
    return 0
  fi
  log "DELETE /api/host/sites/${SITE_ID}"
  local blob
  blob="$(curl_api DELETE "/api/host/sites/${SITE_ID}")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "204" || "$HTTP_CODE" == "200" ]] || die "delete site HTTP ${HTTP_CODE}"
}

login
ensure_waf_flag
pick_agent
create_site
upsert_policy
fetch_snippet
simulate_and_events
apply_vhost
delete_site
log "done. Host WAF lab smoke finished (no tokens printed)."
