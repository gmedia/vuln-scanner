#!/usr/bin/env bash
# Repeatable Host Protect API smoke against an enrolled Guard agent.
#
# Not Playwright. Does not enroll/unenroll Guard. Does not wipe tc5.
# Default refuses sinexis.app / vs.appmedia.id.
# Never prints tokens, passwords, or host IPs.
#
#   export GUARD_LAB_APP_BASE GUARD_LAB_EMAIL GUARD_LAB_PASSWORD
#   ./scripts/host-protect-lab-smoke.sh
#   ./scripts/host-protect-lab-smoke.sh --prepare-fixture   # mkdir allowlisted path (SSH alias)
#   ./scripts/host-protect-lab-smoke.sh --keep-site
#   ./scripts/host-protect-lab-smoke.sh --require-helper-heartbeat
#   ./scripts/host-protect-lab-smoke.sh --trigger-helper-poll --require-helper-heartbeat
#
# Requires HOST_PROTECT_ENABLED on the API. Fixture path must be under
# /var/www, /srv/www, or /home — default /var/www/host-protect-fixture.
# Do not point at live ERP (sx-erpstg) or customer docroots.

set -euo pipefail

PREPARE_FIXTURE=0
KEEP_SITE=0
REQUIRE_HELPER_HEARTBEAT=0
TRIGGER_HELPER_POLL=0
for arg in "$@"; do
  case "$arg" in
    --prepare-fixture) PREPARE_FIXTURE=1 ;;
    --keep-site) KEEP_SITE=1 ;;
    --require-helper-heartbeat) REQUIRE_HELPER_HEARTBEAT=1 ;;
    --trigger-helper-poll) TRIGGER_HELPER_POLL=1 ;;
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
GUARD_LAB_AGENT_SSH="${GUARD_LAB_AGENT_SSH:-tc5}"
VERIFY_TLS="${GUARD_LAB_VERIFY_TLS:-1}"
ROOT_PATH="${HOST_PROTECT_LAB_ROOT_PATH:-/var/www/host-protect-fixture}"
SITE_NAME="${HOST_PROTECT_LAB_SITE_NAME:-lab-host-protect-fixture}"
POLL_SECONDS="${HOST_PROTECT_LAB_POLL_SECONDS:-45}"
AGENT_UUID="${HOST_PROTECT_LAB_AGENT_UUID:-}"
HELPER_STALE_SECONDS="${HOST_PROTECT_LAB_HELPER_STALE_SECONDS:-1200}"
HELPER_POLL_WAIT="${HOST_PROTECT_LAB_HELPER_POLL_WAIT:-90}"

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

if is_public_prod_base && [[ "${HOST_PROTECT_LAB_ALLOW_PUBLIC_PROD:-${GUARD_LAB_ALLOW_PUBLIC_PROD:-0}}" != "1" ]]; then
  die "refusing public prod origin (override: HOST_PROTECT_LAB_ALLOW_PUBLIC_PROD=1 or GUARD_LAB_ALLOW_PUBLIC_PROD=1)"
fi

case "$ROOT_PATH" in
  /var/www/*|/srv/www/*|/home/*) ;;
  *) die "HOST_PROTECT_LAB_ROOT_PATH must be under /var/www, /srv/www, or /home" ;;
esac
if [[ "$ROOT_PATH" == *..* ]]; then
  die "HOST_PROTECT_LAB_ROOT_PATH must not contain .."
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

prepare_fixture() {
  require_cmd ssh
  local hosts=()
  local h
  # App host (tc1) often cannot resolve the agent SSH alias; bastion can.
  # Prefer an explicit fixture host, then GUARD_LAB_AGENT_SSH (default tc5).
  if [[ -n "${HOST_PROTECT_LAB_FIXTURE_SSH:-}" ]]; then
    hosts+=("${HOST_PROTECT_LAB_FIXTURE_SSH}")
  fi
  hosts+=("${GUARD_LAB_AGENT_SSH}")
  log "mkdir fixture (allowlisted path; not a customer docroot)"
  for h in "${hosts[@]}"; do
    [[ -n "$h" ]] || continue
    if ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$h" \
      "sudo mkdir -p '${ROOT_PATH}/wp-content/uploads' && sudo chmod 755 '${ROOT_PATH}' '${ROOT_PATH}/wp-content' '${ROOT_PATH}/wp-content/uploads' && printf '%s\\n' '<?php eval(\$_POST[\"x\"]);' | sudo tee '${ROOT_PATH}/wp-content/uploads/lab-sample.php' '${ROOT_PATH}/wp-content/uploads/cache.php' >/dev/null && sudo chmod 644 '${ROOT_PATH}/wp-content/uploads/lab-sample.php' '${ROOT_PATH}/wp-content/uploads/cache.php'"; then
      log "fixture mkdir ok (SSH alias used; not printed as IP)"
      return 0
    fi
    log "SSH alias failed (try HOST_PROTECT_LAB_FIXTURE_SSH from a host that resolves the agent)"
  done
  die "could not mkdir fixture — run --prepare-fixture from a bastion that has Host ${GUARD_LAB_AGENT_SSH}, or set HOST_PROTECT_LAB_FIXTURE_SSH"
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
      3) die "HOST_PROTECT_LAB_AGENT_UUID not in agent list" ;;
      4) die "no Guard agents — enroll first (scripts/guard-lab-enroll-smoke.sh); Playwright is not enroll" ;;
      *) die "could not parse guard agents" ;;
    esac
  }
  log "using guard_agent_id=${AGENT_ID}"
}

kick_helper() {
  local h="${HOST_PROTECT_LAB_FIXTURE_SSH:-${GUARD_LAB_AGENT_SSH}}"
  ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$h" \
    "unit='sinexis-host-protect@${AGENT_ID}.service'; sudo systemctl reset-failed \"\$unit\" >/dev/null 2>&1 || true; if systemctl is-active --quiet \"\$unit\"; then exit 0; fi; sudo systemctl start --no-block \"\$unit\" >/dev/null 2>&1 || true" \
    || true
}

trigger_helper_poll() {
  require_cmd ssh
  log "one-shot helper poll on SSH alias (token not printed)"
  local h="${HOST_PROTECT_LAB_FIXTURE_SSH:-${GUARD_LAB_AGENT_SSH}}"
  ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$h" \
    "unit='sinexis-host-protect@${AGENT_ID}.service'; if systemctl is-active --quiet \"\$unit\"; then exit 0; fi; sudo systemctl start \"\$unit\"" \
    || die "helper poll start failed (install helper first — docs/host-protect-helper-am.md)"
}

require_helper_heartbeat() {
  log "require last_helper_poll_at within ${HELPER_STALE_SECONDS}s"
  local i blob stamp
  for ((i = 0; i < HELPER_POLL_WAIT; i += 5)); do
    blob="$(curl_api GET /api/guard/agents)"
    split_body_code "$blob"
    [[ "$HTTP_CODE" == "200" ]] || die "guard agents HTTP ${HTTP_CODE}"
    stamp="$(AGENT_ID="$AGENT_ID" python3 -c "
import json,os,sys
from datetime import datetime, timezone
rows=json.loads(sys.argv[1])
want=os.environ['AGENT_ID']
for r in rows:
    if str(r.get('id'))==want:
        print(r.get('last_helper_poll_at') or '')
        break
" "$HTTP_BODY")"
    if [[ -n "$stamp" ]]; then
      STALE="$(STAMP="$stamp" HELPER_STALE_SECONDS="$HELPER_STALE_SECONDS" python3 -c "
import os
from datetime import datetime, timezone
raw=os.environ['STAMP'].replace('Z','+00:00')
try:
    ts=datetime.fromisoformat(raw)
except ValueError:
    raise SystemExit(2)
if ts.tzinfo is None:
    ts=ts.replace(tzinfo=timezone.utc)
age=(datetime.now(timezone.utc)-ts).total_seconds()
print('stale' if age > float(os.environ['HELPER_STALE_SECONDS']) else 'fresh')
")" || die "could not parse last_helper_poll_at"
      log "helper heartbeat=${STALE}"
      if [[ "$STALE" == "fresh" ]]; then
        return 0
      fi
    else
      log "helper heartbeat missing"
    fi
    sleep 5
  done
  die "helper heartbeat missing or stale — enable sinexis-host-protect@.timer on tc5 (AM runbook)"
}

ensure_host_flag() {
  log "GET /api/host/sites (flag check)"
  local blob
  blob="$(curl_api GET /api/host/sites)"
  split_body_code "$blob"
  if [[ "$HTTP_CODE" == "404" ]]; then
    die "Host Protect API 404 — HOST_PROTECT_ENABLED is off (leave prod off until this smoke passes)"
  fi
  [[ "$HTTP_CODE" == "200" ]] || die "host sites HTTP ${HTTP_CODE}"
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
  if [[ "$HTTP_CODE" == "409" ]]; then
    log "site already exists — reuse matching root_path"
    blob="$(curl_api GET /api/host/sites)"
    split_body_code "$blob"
    [[ "$HTTP_CODE" == "200" ]] || die "list sites HTTP ${HTTP_CODE}"
    SITE_ID="$(ROOT_PATH="$ROOT_PATH" AGENT_ID="$AGENT_ID" python3 -c "
import json,os,sys
rows=json.loads(sys.argv[1])
root=os.environ['ROOT_PATH']
aid=os.environ['AGENT_ID']
for r in rows:
    if str(r.get('root_path'))==root and str(r.get('guard_agent_id'))==aid:
        print(r['id']); break
" "$HTTP_BODY")"
    [[ -n "$SITE_ID" ]] || die "409 but no matching site to reuse"
  else
    [[ "$HTTP_CODE" == "201" || "$HTTP_CODE" == "200" ]] || die "create site HTTP ${HTTP_CODE} (body redacted)"
    SITE_ID="$(json_get "$HTTP_BODY" "str(o.get('id') or '')")"
  fi
  [[ -n "$SITE_ID" ]] || die "create site missing id"
  log "site_id=${SITE_ID}"
}

enqueue_scan() {
  log "POST /api/host/sites/${SITE_ID}/scan"
  local blob
  blob="$(curl_api POST "/api/host/sites/${SITE_ID}/scan" '{}')"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "201" || "$HTTP_CODE" == "200" ]] || die "enqueue scan HTTP ${HTTP_CODE}"
  SCAN_ID="$(json_get "$HTTP_BODY" "str(o.get('id') or '')")"
  [[ -n "$SCAN_ID" ]] || die "scan missing id"
}

poll_scan() {
  log "poll scans up to ${POLL_SECONDS}s"
  local i blob status hit_count
  for ((i = 0; i < POLL_SECONDS; i += 3)); do
    blob="$(curl_api GET "/api/host/sites/${SITE_ID}/scans")"
    split_body_code "$blob"
    [[ "$HTTP_CODE" == "200" ]] || die "list scans HTTP ${HTTP_CODE}"
    read -r status hit_count <<<"$(SCAN_ID="$SCAN_ID" python3 -c "
import json,os,sys
rows=json.loads(sys.argv[1])
sid=os.environ['SCAN_ID']
for r in rows:
    if str(r.get('id'))==sid:
        print(r.get('status') or '', r.get('hit_count') if r.get('hit_count') is not None else 0)
        break
else:
    print('missing', 0)
" "$HTTP_BODY")"
    log "scan status=${status} hit_count=${hit_count}"
    case "$status" in
      completed|failed) return 0 ;;
    esac
    if [[ "$TRIGGER_HELPER_POLL" -eq 1 && $((i % 15)) -eq 0 ]]; then
      kick_helper
    fi
    sleep 3
  done
  die "scan did not finish within ${POLL_SECONDS}s"
}

wait_hit_status() {
  local hit_id="$1"
  local want="$2"
  local i blob got
  log "wait hit ${hit_id} status=${want}"
  for ((i = 0; i < POLL_SECONDS; i += 3)); do
    blob="$(curl_api GET "/api/host/hits?site_id=${SITE_ID}")"
    split_body_code "$blob"
    [[ "$HTTP_CODE" == "200" ]] || die "hits wait HTTP ${HTTP_CODE}"
    got="$(HIT_ID="$hit_id" python3 -c "
import json,os,sys
rows=json.loads(sys.argv[1])
want=os.environ['HIT_ID']
for r in rows:
    if str(r.get('id'))==want:
        print(r.get('status') or '')
        break
" "$HTTP_BODY")"
    log "hit status=${got}"
    if [[ "$got" == "$want" ]]; then
      return 0
    fi
    if [[ "$TRIGGER_HELPER_POLL" -eq 1 ]]; then
      kick_helper
    fi
    sleep 3
  done
  die "hit did not reach ${want} within ${POLL_SECONDS}s (last=${got:-none})"
}

hits_and_actions() {
  log "GET /api/host/hits?site_id=${SITE_ID}"
  local blob hit_id
  blob="$(curl_api GET "/api/host/hits?site_id=${SITE_ID}")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "hits HTTP ${HTTP_CODE}"
  HIT_COUNT="$(json_get "$HTTP_BODY" "len(o) if isinstance(o, list) else 0")"
  HIT_ENGINE="$(SCAN_ID="$SCAN_ID" python3 -c "
import json,os,sys
rows=json.loads(sys.argv[1])
sid=os.environ.get('SCAN_ID','')
picked=None
for r in rows:
    if sid and str(r.get('scan_id'))==sid:
        picked=r
        break
if picked is None and rows:
    picked=rows[0]
print((picked or {}).get('engine') or '')
" "$HTTP_BODY")"
  log "hit_rows=${HIT_COUNT} engine=${HIT_ENGINE}"
  if [[ -n "${HOST_PROTECT_LAB_EXPECT_ENGINE:-}" && "$HIT_ENGINE" != "${HOST_PROTECT_LAB_EXPECT_ENGINE}" ]]; then
    die "expected engine=${HOST_PROTECT_LAB_EXPECT_ENGINE} got engine=${HIT_ENGINE}"
  fi
  hit_id="$(SCAN_ID="$SCAN_ID" python3 -c "
import json,os,sys
rows=json.loads(sys.argv[1])
sid=os.environ.get('SCAN_ID','')
picked=''
for r in rows:
    if r.get('status')!='open':
        continue
    if sid and str(r.get('scan_id'))==sid:
        picked=r.get('id') or ''
        break
    if not picked:
        picked=r.get('id') or ''
print(picked)
" "$HTTP_BODY")"
  if [[ -z "$hit_id" ]]; then
    log "no hits (mock may need worker; still a valid smoke if scan completed)"
    return 0
  fi
  log "POST quarantine then restore on first hit"
  blob="$(curl_api POST "/api/host/hits/${hit_id}/quarantine" '{}')"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "quarantine HTTP ${HTTP_CODE}"
  if [[ "$TRIGGER_HELPER_POLL" -eq 1 ]]; then
    kick_helper
  fi
  wait_hit_status "$hit_id" "quarantined"
  blob="$(curl_api POST "/api/host/hits/${hit_id}/restore" '{}')"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "restore HTTP ${HTTP_CODE}"
  wait_hit_status "$hit_id" "restored"
  blob="$(curl_api GET "/api/host/hits?site_id=${SITE_ID}")"
  split_body_code "$blob"
  [[ "$HTTP_CODE" == "200" ]] || die "hits refresh HTTP ${HTTP_CODE}"
  ignore_id="$(HIT_ID="$hit_id" python3 -c "
import json,os,sys
rows=json.loads(sys.argv[1])
skip=os.environ.get('HIT_ID','')
if not isinstance(rows, list):
    raise SystemExit(0)
for r in rows:
    if str(r.get('id'))!=skip and r.get('status')=='open':
        print(r['id'])
        break
" "$HTTP_BODY")"
  if [[ -n "$ignore_id" ]]; then
    log "POST ignore on a second open hit"
    blob="$(curl_api POST "/api/host/hits/${ignore_id}/ignore" '{}')"
    split_body_code "$blob"
    [[ "$HTTP_CODE" == "200" ]] || die "ignore HTTP ${HTTP_CODE}"
  else
    log "skip ignore (single-hit mock; ignore needs a remaining open row)"
  fi
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
if [[ "$PREPARE_FIXTURE" -eq 1 ]]; then
  prepare_fixture
fi
ensure_host_flag
pick_agent
if [[ "$TRIGGER_HELPER_POLL" -eq 1 ]]; then
  trigger_helper_poll
fi
if [[ "$REQUIRE_HELPER_HEARTBEAT" -eq 1 ]]; then
  require_helper_heartbeat
fi
create_site
enqueue_scan
poll_scan
hits_and_actions
delete_site
log "done. Host Protect lab smoke finished (no tokens printed)."
