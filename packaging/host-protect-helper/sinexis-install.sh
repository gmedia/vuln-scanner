#!/usr/bin/env bash
# Sinexis installer — single file. Not curl|bash.
# Bundles Host Protect helper payloads. Optional wazuh-agent package install.
# Usage:
#   sudo ./sinexis-install.sh                 # TTY menu
#   sudo ./sinexis-install.sh --install-wazuh-agent --manager-host HOST
#   sudo ./sinexis-install.sh --configure-host-protect --agent-id UUID --token-file PATH
#   sudo ./sinexis-install.sh --write-waf-snippet   # file only; no nginx include/reload
set -euo pipefail

API_BASE="${SINEXIS_API_BASE:-https://sinexis.app}"
AGENT_ID="${SINEXIS_AGENT_ID:-}"
TOKEN_FILE=""
TOKEN_VALUE=""
DEB_PATH=""
DRY_RUN=0
INTERACTIVE=0
ENABLE_TIMER=1
SKIP_WAZUH_CHECK=0
FROM_TREE=0
MENU=1
DO_STATUS=0
DO_WAZUH=0
DO_HELPER=0
DO_WAF_SNIPPET=0
DO_WAF_APPLY=0
DO_WAF_INGEST=0
DO_WAF_POLL=0
FORCE_SETUP=0
SKIP_SNIPPET_CONFIRM=0
WAF_SNIPPET_PATH="/etc/nginx/sinexis-waf.snippet.conf"
WAF_VHOST_PATH=""
WAF_SITE_ID="${SINEXIS_WAF_SITE_ID:-}"
WAF_AUDIT_LOG="${SINEXIS_WAF_AUDIT_LOG:-}"
WAF_AUDIT_LOG_CLI=0
MANAGER_HOST=""
QUARANTINE_ROOT="/var/lib/sinexis/quarantine"
ENV_PATH="/etc/sinexis/host-protect.env"
LIB_DIR="/usr/lib/sinexis/host-protect"
UNIT_DST="/usr/lib/systemd/system"

usage() {
  cat <<'EOF'
sinexis-install.sh — one file (not curl|bash)

TTY (default, no flags): prints setup status, then menu
  1) Install wazuh-agent (package + Manager address)
  2) Configure Host Protect helper (payloads in this file)
  3) Both (1+2)
  4) Write Host WAF nginx snippet file (no include, no reload)
  5) Write snippet AND include it in every server{} of a vhost you name (nginx -t + reload)
  6) Show setup status only
  7) Set WAF ingest (site UUID + audit log in env; token not printed) and poll once
  8) Poll helper once (POST WAF events if site UUID is set)
  9) Quit

Non-interactive:
  --status                 Print setup (no tokens): includes, ingest, audit size vs unread cursor, last-2k parse; exit
  --force                  Re-run even if that piece is already set up
  --install-wazuh-agent --manager-host HOST
  --configure-host-protect --agent-id UUID --token-file PATH [--api-base URL]
  --write-waf-snippet [--waf-snippet-path PATH]
  --apply-waf-vhost PATH   Write snippet, include in every server{} of that file, nginx -t, reload
  --waf-site-id UUID       Host Protect site UUID from SPA /host (for WAF ingest)
  --waf-audit-log PATH     ModSecurity audit log (auto: nginx path if present, else /var/log/modsec_audit.log)
  --configure-waf-ingest   Write those keys into host-protect.env (keep existing token)
  --poll-once              Refresh helper binary from this file, then start poll once (no journal dump)

Host Protect:
  --agent-id UUID          Guard agent UUID from SPA /guard
  --token-file PATH        File containing X-Host-Agent-Token (mode 600)
  --api-base URL           Default https://sinexis.app
  --from-tree              Copy sibling files if present (optional)
  --deb PATH               dpkg -i this .deb instead of embedded payloads
  --dry-run                Print actions; do not write /etc
  --interactive            Prompt for missing helper fields on a TTY
  --no-timer               Install files/env only
  --skip-wazuh-check       Lab only — do not use on customer VPS
  --force                  Re-run a step that is already set up
  --status                 Print setup status (no tokens) and exit
  --help

Does not: curl|bash, enroll Guard, print the token, wipe ERP.
Does not: guess which vhost to patch, or paste onto sinexis.app edge.
Without --apply-waf-vhost (menu 4): file only — no include, no nginx -t/reload.
With --apply-waf-vhost PATH (menu 5): include in every server{} of that file, then nginx -t + reload.
Already set up: TTY asks Re-run? [y/N]. Flags skip unless --force.
EOF
}

log() { printf '%s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

is_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
}

detect_modsec_audit_log() {
  local p conf line
  for p in /var/log/nginx/modsec_audit_log /var/log/nginx/modsec_audit.log /var/log/modsec_audit.log; do
    if [[ -f "$p" ]]; then
      printf '%s\n' "$p"
      return 0
    fi
  done
  for conf in /etc/nginx/modsec.conf /etc/modsecurity/modsecurity.conf /etc/nginx/modsecurity.conf; do
    [[ -f "$conf" ]] || continue
    line="$(awk '/^[[:space:]]*SecAuditLog[[:space:]]+\//{print $2; exit}' "$conf" 2>/dev/null || true)"
    if [[ -n "$line" ]]; then
      printf '%s\n' "$line"
      return 0
    fi
  done
  printf '%s\n' "/var/log/modsec_audit.log"
}

resolve_waf_audit_log() {
  if [[ "$WAF_AUDIT_LOG_CLI" -eq 1 && -n "$WAF_AUDIT_LOG" ]]; then
    return 0
  fi
  if [[ -n "$WAF_AUDIT_LOG" ]]; then
    return 0
  fi
  WAF_AUDIT_LOG="$(detect_modsec_audit_log)"
}

need_root() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  [[ "$(id -u)" -eq 0 ]] || die "run as root (or pass --dry-run)"
}

b64_decode() {
  if command -v base64 >/dev/null 2>&1; then
    base64 -d
  else
    python3 -c 'import sys,base64; sys.stdout.buffer.write(base64.b64decode(sys.stdin.read()))'
  fi
}

write_b64_file() {
  local dest="$1"
  local mode="$2"
  local data="$3"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: write ${dest} (mode ${mode})"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  printf '%s' "$data" | tr -d '\n' | b64_decode >"$dest"
  chmod "$mode" "$dest"
}

_yn() {
  local ans="$1"
  [[ "$ans" == "y" || "$ans" == "Y" || "$ans" == "yes" || "$ans" == "YES" ]]
}

helper_already_configured() {
  [[ -f "$ENV_PATH" && -x "$LIB_DIR/sinexis_host_scan.py" ]]
}

wazuh_already_present() {
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet wazuh-agent 2>/dev/null; then
    return 0
  fi
  command -v wazuh-agentd >/dev/null 2>&1 && return 0
  [[ -x /var/ossec/bin/wazuh-agentd || -x /var/ossec/bin/ossec-agentd ]] && return 0
  return 1
}

waf_snippet_present() {
  [[ -f "$WAF_SNIPPET_PATH" ]]
}

waf_include_present() {
  local vhost="${1:-}"
  [[ -n "$vhost" && -f "$vhost" ]] || return 1
  grep -qF "$WAF_SNIPPET_PATH" "$vhost"
}

list_waf_include_files() {
  local d f base
  for d in /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d; do
    [[ -d "$d" ]] || continue
    shopt -s nullglob
    for f in "$d"/*; do
      [[ -f "$f" ]] || continue
      base="$(basename "$f")"
      case "$base" in
        *sinexis.app*|*vs.appmedia.id*) continue ;;
      esac
      if grep -qF "$WAF_SNIPPET_PATH" "$f" 2>/dev/null; then
        printf '%s\n' "$f"
      fi
    done
    shopt -u nullglob
  done
}

print_setup_status() {
  local w="missing" h="missing" s="missing" m="unknown" inc="none"
  local -a inc_files=()
  if wazuh_already_present; then
    w="present"
  fi
  if helper_already_configured; then
    h="present (env + helper binary; token not printed)"
  elif [[ -f "$ENV_PATH" ]]; then
    h="partial (env file exists, helper binary missing)"
  elif [[ -x "$LIB_DIR/sinexis_host_scan.py" ]]; then
    h="partial (helper binary exists, env missing)"
  fi
  if waf_snippet_present; then
    s="present (${WAF_SNIPPET_PATH})"
  fi
  if nginx_has_modsecurity; then
    m="detected"
  else
    m="not detected"
  fi
  mapfile -t inc_files < <(list_waf_include_files)
  if [[ ${#inc_files[@]} -gt 0 ]]; then
    inc="present in ${#inc_files[@]} site file(s)"
  elif waf_snippet_present; then
    inc="snippet on disk, not included in any site under /etc/nginx/sites-enabled|sites-available|conf.d (menu 5 / --apply-waf-vhost PATH)"
  fi
  log "Setup status (no tokens):"
  log "  wazuh-agent: ${w}"
  log "  Host Protect helper: ${h}"
  log "  WAF snippet file: ${s}"
  log "  nginx ModSecurity module: ${m}"
  log "  WAF include in site vhost: ${inc}"
  if [[ ${#inc_files[@]} -gt 0 ]]; then
    local f
    for f in "${inc_files[@]}"; do
      log "    ${f}"
    done
  fi
  local sid="missing" alog="missing"
  if [[ -f "$ENV_PATH" ]]; then
    sid="$(awk -F= '/^SINEXIS_WAF_SITE_ID=/{print $2; exit}' "$ENV_PATH" || true)"
    alog="$(awk -F= '/^SINEXIS_WAF_AUDIT_LOG=/{print $2; exit}' "$ENV_PATH" || true)"
  fi
  if [[ -n "${sid}" ]]; then
    log "  WAF ingest site UUID: set (not printed in full: ${sid:0:8}…)"
  else
    log "  WAF ingest site UUID: missing (menu 7 / --configure-waf-ingest --waf-site-id UUID from SPA /host)"
  fi
  if [[ -n "${alog}" ]]; then
    if [[ -f "$alog" ]]; then
      log "  WAF audit log: ${alog} (file present)"
    else
      log "  WAF audit log: ${alog} (path in env; file not found yet)"
    fi
  else
    log "  WAF audit log: not in env (helper auto-detects nginx SecAuditLog or /var/log/modsec_audit.log)"
  fi
  print_waf_audit_cursor_status "${alog}"
  log "  Re-run a step: TTY will ask, or pass --force"
}

print_waf_audit_cursor_status() {
  local alog="${1:-}"
  local aid="" cursor="" size="" unread="" parsed=""
  if [[ -z "$alog" ]]; then
    alog="$(detect_modsec_audit_log)"
  fi
  load_agent_id_from_env || true
  aid="${AGENT_ID:-}"
  if [[ -n "$alog" && -f "$alog" ]]; then
    size="$(stat -c '%s' "$alog" 2>/dev/null || echo "?")"
    log "  WAF audit log size: ${size} bytes"
  else
    log "  WAF audit log size: (file missing)"
    return 0
  fi
  if ! is_uuid "${aid}"; then
    log "  WAF audit cursor: missing agent UUID (env or --agent-id)"
    return 0
  fi
  cursor="/var/lib/sinexis/waf-audit-${aid}.cursor"
  if [[ -f "$cursor" ]]; then
    unread="$(awk -v sz="$size" '{off=$0+0; if (sz ~ /^[0-9]+$/ && off <= sz+0) print (sz+0)-off; else print "?"}' "$cursor" 2>/dev/null || echo "?")"
    log "  WAF audit cursor: present (offset not printed; unread ${unread} bytes)"
  else
    log "  WAF audit cursor: missing (next poll reads from start of file — large logs may skip the tail)"
  fi
  if [[ -f "$LIB_DIR/sinexis_host_scan.py" ]]; then
    parsed="$(
      python3 - "$LIB_DIR/sinexis_host_scan.py" "$alog" <<'PY' 2>/dev/null || true
import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("s", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
if not hasattr(mod, "parse_modsec_audit_events"):
    print("helper binary too old (no WAF parser) — re-run --poll-once to refresh")
    raise SystemExit(0)
text = Path(sys.argv[2]).read_bytes()[-2000:].decode("utf-8", "replace")
rows = mod.parse_modsec_audit_events(text)
bits = []
for ev in rows[:5]:
    rid = str(ev.get("rule_id") or "?")[:32]
    path = str(ev.get("path") or "/")[:64]
    bits.append(f"{rid}:{path}")
print(f"{len(rows)} last-2k events" + (f" ({'; '.join(bits)})" if bits else ""))
PY
    )"
    if [[ -n "$parsed" ]]; then
      log "  WAF audit parse (last 2k, no request body): ${parsed}"
    else
      log "  WAF audit parse (last 2k): helper parse failed (do not cat the log)"
    fi
  fi
}

confirm_rerun() {
  local what="$1"
  if [[ "$FORCE_SETUP" -eq 1 ]]; then
    log "re-run: ${what} (--force)"
    return 0
  fi
  if [[ -t 0 ]]; then
    local ans=""
    read -r -p "${what} already set up. Re-run? [y/N]: " ans || true
    if _yn "$ans"; then
      return 0
    fi
    log "skip: ${what} (already set up)"
    return 1
  fi
  log "skip: ${what} already set up (pass --force to re-run)"
  return 1
}

wazuh_ok() {
  if [[ "$SKIP_WAZUH_CHECK" -eq 1 ]]; then
    log "skip wazuh-agent check (--skip-wazuh-check)"
    return 0
  fi
  if command -v systemctl >/dev/null 2>&1; then
    if systemctl is-active --quiet wazuh-agent 2>/dev/null; then
      return 0
    fi
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: would require wazuh-agent.service active"
    return 0
  fi
  die "wazuh-agent is not active. Choose menu option 1 first, or --install-wazuh-agent."
}

install_wazuh_agent() {
  if wazuh_already_present; then
    confirm_rerun "wazuh-agent" || return 0
  fi
  if [[ -z "$MANAGER_HOST" ]]; then
    if [[ -t 0 ]]; then
      read -r -p "Wazuh Manager host (from Guard enroll response): " MANAGER_HOST
    fi
  fi
  [[ -n "$MANAGER_HOST" ]] || die "missing --manager-host (from enroll manager_host; do not guess lab IPs)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: install wazuh-agent; set Manager ${MANAGER_HOST}"
    return 0
  fi
  need_root
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y curl gnupg apt-transport-https
    curl -sSL https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --dearmor -o /usr/share/keyrings/wazuh.gpg
    echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" >/etc/apt/sources.list.d/wazuh.list
    apt-get update
    apt-get install -y wazuh-agent
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl
    rpm --import https://packages.wazuh.com/key/GPG-KEY-WAZUH
    printf '%s\n' "[wazuh]" "gpgcheck=1" "gpgkey=https://packages.wazuh.com/key/GPG-KEY-WAZUH" "enabled=1" "name=Wazuh repository" "baseurl=https://packages.wazuh.com/4.x/yum/" "protect=1" >/etc/yum.repos.d/wazuh.repo
    dnf install -y wazuh-agent
  elif command -v zypper >/dev/null 2>&1; then
    zypper refresh
    zypper install -y curl wazuh-agent
  else
    die "no apt-get/dnf/zypper — install wazuh-agent via install_hint from Guard enroll"
  fi
  if [[ -f /var/ossec/etc/ossec.conf ]]; then
    sed -i "s|<address>.*</address>|<address>${MANAGER_HOST}</address>|g" /var/ossec/etc/ossec.conf
  fi
  log "import agent_key with /var/ossec/bin/manage_agents (from Guard enroll). Token not printed."
  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
    systemctl enable --now wazuh-agent || true
  fi
}

read_token() {
  if [[ -n "$TOKEN_VALUE" ]]; then
    return 0
  fi
  if [[ -z "$TOKEN_FILE" ]]; then
    die "missing --token-file (do not pass the token on the command line)"
  fi
  [[ -f "$TOKEN_FILE" ]] || die "token file not found"
  TOKEN_VALUE="$(tr -d '\r\n' <"$TOKEN_FILE")"
  [[ -n "$TOKEN_VALUE" ]] || die "token file empty"
}

prompt_interactive() {
  [[ -t 0 ]] || die "--interactive requires a TTY"
  if [[ -z "$AGENT_ID" ]]; then
    read -r -p "Guard agent UUID: " AGENT_ID
  fi
  if [[ -z "$TOKEN_FILE" && -z "$TOKEN_VALUE" ]]; then
    read -r -s -p "Host agent token (hidden): " TOKEN_VALUE
    echo >&2
  fi
  read -r -p "API base [${API_BASE}]: " _ab
  if [[ -n "${_ab}" ]]; then
    API_BASE="$_ab"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

copy_tree() {
  local dest_lib="$1"
  local dest_unit="$2"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: copy helper tree -> ${dest_lib}"
    log "dry-run: copy systemd units -> ${dest_unit}"
    return 0
  fi
  mkdir -p "$dest_lib/rules" "$dest_unit" /etc/sinexis /var/lib/sinexis/quarantine /var/www /srv/www
  chmod 700 /var/lib/sinexis /var/lib/sinexis/quarantine /etc/sinexis
  install -m 755 "$SCRIPT_DIR/sinexis_host_scan.py" "$dest_lib/sinexis_host_scan.py"
  install -m 644 "$SCRIPT_DIR/rules/php_webshell.yar" "$dest_lib/rules/php_webshell.yar"
  install -m 644 "$SCRIPT_DIR/systemd/sinexis-host-protect@.service" "$dest_unit/sinexis-host-protect@.service"
  install -m 644 "$SCRIPT_DIR/systemd/sinexis-host-protect@.timer" "$dest_unit/sinexis-host-protect@.timer"
}

install_embedded() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: copy helper tree -> ${LIB_DIR}"
    log "dry-run: copy systemd units -> ${UNIT_DST}"
    return 0
  fi
  mkdir -p "$LIB_DIR/rules" "$UNIT_DST" /etc/sinexis /var/lib/sinexis/quarantine /var/www /srv/www
  chmod 700 /var/lib/sinexis /var/lib/sinexis/quarantine /etc/sinexis
  write_b64_file "$LIB_DIR/sinexis_host_scan.py" 755 "$SINEXIS_B64_SCAN"
  write_b64_file "$LIB_DIR/rules/php_webshell.yar" 644 "$SINEXIS_B64_YAR"
  write_b64_file "$UNIT_DST/sinexis-host-protect@.service" 644 "$SINEXIS_B64_SVC"
  write_b64_file "$UNIT_DST/sinexis-host-protect@.timer" 644 "$SINEXIS_B64_TMR"
}

install_deb() {
  [[ -f "$DEB_PATH" ]] || die "deb not found: $DEB_PATH"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: dpkg -i $DEB_PATH"
    return 0
  fi
  dpkg -i "$DEB_PATH"
}

write_env() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: write ${ENV_PATH} (mode 600); token not printed"
    upsert_env_waf_keys
    return 0
  fi
  umask 077
  cat >"$ENV_PATH" <<EOF
SINEXIS_API_BASE=${API_BASE}
SINEXIS_HOST_AGENT_TOKEN=${TOKEN_VALUE}
SINEXIS_AGENT_ID=${AGENT_ID}
SINEXIS_QUARANTINE_ROOT=${QUARANTINE_ROOT}
EOF
  chmod 600 "$ENV_PATH"
  upsert_env_waf_keys
}

env_upsert_key() {
  local key="$1"
  local val="$2"
  local tmp
  [[ -f "$ENV_PATH" ]] || die "missing ${ENV_PATH} (configure helper first)"
  tmp="$(mktemp)"
  umask 077
  grep -v "^${key}=" "$ENV_PATH" >"$tmp" || true
  printf '%s=%s\n' "$key" "$val" >>"$tmp"
  cat "$tmp" >"$ENV_PATH"
  rm -f "$tmp"
  chmod 600 "$ENV_PATH"
}

upsert_env_waf_keys() {
  [[ -n "$WAF_SITE_ID" ]] || return 0
  is_uuid "$WAF_SITE_ID" || die "invalid --waf-site-id (Host Protect site UUID from SPA /host)"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: set SINEXIS_WAF_SITE_ID in ${ENV_PATH} (UUID not printed in full)"
    return 0
  fi
  need_root
  env_upsert_key "SINEXIS_WAF_SITE_ID" "$WAF_SITE_ID"
  env_upsert_key "SINEXIS_WAF_AUDIT_LOG" "$WAF_AUDIT_LOG"
  log "ok: WAF ingest keys written (token not printed)"
}

load_agent_id_from_env() {
  if [[ -n "$AGENT_ID" ]]; then
    return 0
  fi
  [[ -f "$ENV_PATH" ]] || return 1
  AGENT_ID="$(awk -F= '/^SINEXIS_AGENT_ID=/{print $2; exit}' "$ENV_PATH" || true)"
}

refresh_helper_binaries() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: refresh helper binary under ${LIB_DIR} (env/token unchanged)"
    return 0
  fi
  if [[ "$FROM_TREE" -eq 1 && -f "$SCRIPT_DIR/sinexis_host_scan.py" ]]; then
    copy_tree "$LIB_DIR" "$UNIT_DST"
  else
    install_embedded
  fi
  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
  fi
  log "ok: helper binary refreshed (token not printed)"
}

poll_helper_once() {
  load_agent_id_from_env || true
  is_uuid "${AGENT_ID:-}" || die "missing agent UUID (env or --agent-id) to poll"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: refresh helper binary then systemctl start sinexis-host-protect@${AGENT_ID}.service (no journal dump)"
    return 0
  fi
  need_root
  command -v systemctl >/dev/null 2>&1 || die "systemctl not found"
  refresh_helper_binaries
  systemctl start "sinexis-host-protect@${AGENT_ID}.service" || die "poll unit failed (do not journalctl — token in env)"
  log "ok: started helper poll once for agent ${AGENT_ID} (token not printed; wait for SPA /host WAF tab)"
}

configure_waf_ingest() {
  if [[ -z "$WAF_SITE_ID" && -t 0 ]]; then
    read -r -p "Host Protect site UUID from SPA /host (not Guard agent id): " WAF_SITE_ID
  fi
  [[ -n "$WAF_SITE_ID" ]] || die "missing --waf-site-id UUID"
  resolve_waf_audit_log
  if [[ -t 0 ]]; then
    local _al=""
    read -r -p "ModSecurity audit log [${WAF_AUDIT_LOG}]: " _al || true
    if [[ -n "${_al}" ]]; then
      WAF_AUDIT_LOG="$_al"
    fi
  fi
  upsert_env_waf_keys
  poll_helper_once
}

enable_timer() {
  if [[ "$ENABLE_TIMER" -ne 1 ]]; then
    log "skip timer"
    return 0
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: systemctl enable --now sinexis-host-protect@${AGENT_ID}.timer"
    return 0
  fi
  command -v systemctl >/dev/null 2>&1 || die "systemctl not found"
  systemctl daemon-reload
  systemctl enable --now "sinexis-host-protect@${AGENT_ID}.timer"
  systemctl start "sinexis-host-protect@${AGENT_ID}.service" || true
}

configure_host_protect() {
  if helper_already_configured; then
    confirm_rerun "Host Protect helper" || return 0
  fi
  if [[ "$INTERACTIVE" -eq 1 ]]; then
    prompt_interactive
  fi
  is_uuid "$AGENT_ID" || die "invalid --agent-id (need Guard UUID)"
  [[ "$API_BASE" == https://* ]] || die "api-base must be https://"
  read_token
  need_root
  wazuh_ok
  if [[ -n "$DEB_PATH" ]]; then
    install_deb
  elif [[ "$FROM_TREE" -eq 1 && -f "$SCRIPT_DIR/sinexis_host_scan.py" ]]; then
    copy_tree "$LIB_DIR" "$UNIT_DST"
  else
    install_embedded
  fi
  write_env
  enable_timer
  log "ok: helper configured for agent ${AGENT_ID} (token not printed)"
}

nginx_has_modsecurity() {
  if command -v nginx >/dev/null 2>&1; then
    if nginx -V 2>&1 | grep -qiE 'modsecurity|modsec|ngx_http_modsecurity'; then
      return 0
    fi
  fi
  if [[ -d /etc/nginx/modules-enabled ]] && grep -RqiE 'modsecurity|modsec' /etc/nginx/modules-enabled 2>/dev/null; then
    return 0
  fi
  if [[ -f /etc/nginx/nginx.conf ]] && grep -qiE 'modsecurity|load_module.*modsec' /etc/nginx/nginx.conf; then
    return 0
  fi
  return 1
}

refuse_edge_vhost() {
  local path="$1"
  local base
  base="$(basename "$path")"
  case "$base" in
    *sinexis.app*|*vs.appmedia.id*)
      die "refusing Sinexis edge vhost (${base}). Host WAF is on-box only."
      ;;
  esac
  if [[ -f "$path" ]] && grep -qiE 'server_name[[:space:]].*(sinexis\.app|vs\.appmedia\.id)' "$path"; then
    die "refusing vhost whose server_name is Sinexis edge. Pick the customer site file."
  fi
}

insert_waf_include() {
  local vhost="$1"
  local snippet="$2"
  SNIPPET_PATH="$snippet" VHOST_PATH="$vhost" python3 - <<'PY'
import os
from pathlib import Path

vhost = Path(os.environ["VHOST_PATH"])
snippet = os.environ["SNIPPET_PATH"]
line = f"    include {snippet};"
text = vhost.read_text(encoding="utf-8")
lines = text.splitlines(True)


def is_server_open(raw: str) -> bool:
    s = raw.strip()
    if "{" not in s:
        return False
    token = s.split("{", 1)[0].split()
    return bool(token) and token[0] == "server"


starts = [i for i, raw in enumerate(lines) if is_server_open(raw)]
if not starts:
    if snippet in text:
        print("already-included")
        raise SystemExit(0)
    vhost.write_text(text + ("\n" if text and not text.endswith("\n") else "") + line + "\n", encoding="utf-8")
    print("inserted-1")
    raise SystemExit(0)

added = 0
out: list[str] = list(lines[: starts[0]])
for n, start in enumerate(starts):
    end = starts[n + 1] if n + 1 < len(starts) else len(lines)
    chunk = lines[start:end]
    body = "".join(chunk)
    if snippet in body:
        out.extend(chunk)
        continue
    out.append(chunk[0])
    out.append(line + "\n")
    out.extend(chunk[1:])
    added += 1
if added == 0:
    print("already-included")
    raise SystemExit(0)
vhost.write_text("".join(out), encoding="utf-8")
print(f"inserted-{added}")
PY
}

apply_waf_vhost() {
  local vhost="$WAF_VHOST_PATH"
  if [[ -z "$vhost" && -t 0 ]]; then
    echo "List site files (example): ls /etc/nginx/sites-enabled" >&2
    read -r -p "Absolute path of the CUSTOMER site vhost to patch: " vhost
  fi
  WAF_VHOST_PATH="$vhost"
  [[ -n "$vhost" ]] || die "missing vhost path (menu 5 / --apply-waf-vhost PATH). Will not guess."
  [[ "$vhost" == /* ]] || die "vhost path must be absolute"
  case "$vhost" in
    /etc/nginx/*) ;;
    *) die "vhost path must be under /etc/nginx" ;;
  esac
  refuse_edge_vhost "$vhost"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: write ${WAF_SNIPPET_PATH}; include in ${vhost}; nginx -t; reload (not sinexis.app edge)"
    return 0
  fi
  [[ -f "$vhost" ]] || die "vhost file not found (will not create a new site)"
  SKIP_SNIPPET_CONFIRM=1
  write_waf_snippet
  if ! nginx_has_modsecurity; then
    die "nginx ModSecurity module not detected. Install libnginx-mod-http-modsecurity (or equivalent) before include. Snippet file was written; vhost not patched."
  fi
  need_root
  local backup="${vhost}.sinexis.bak"
  cp -a "$vhost" "$backup"
  insert_waf_include "$vhost" "$WAF_SNIPPET_PATH"
  if ! nginx -t; then
    cp -a "$backup" "$vhost"
    die "nginx -t failed after include. Restored ${vhost} from ${backup}. Snippet file is still on disk; nginx not reloaded."
  fi
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx
  else
    nginx -s reload
  fi
  log "ok: included ${WAF_SNIPPET_PATH} in every server{} block of the named vhost and reloaded nginx. Not sinexis.app edge."
}

write_waf_snippet() {
  local dest="$WAF_SNIPPET_PATH"
  if [[ "${SKIP_SNIPPET_CONFIRM:-0}" -ne 1 ]] && waf_snippet_present; then
    confirm_rerun "WAF snippet file" || return 0
  fi
  if [[ "$dest" == /etc/* ]]; then
    need_root
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: write ${dest} (WAF snippet; no include, no nginx reload)"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  cat >"$dest" <<'EOF'
# Sinexis Host WAF starter snippet — customer VPS only.
# Do not paste onto sinexis.app edge nginx.
# This installer does not add an include, run nginx -t, or reload nginx.
# Ops: add  include /etc/nginx/sinexis-waf.snippet.conf;  to the site that
# serves the Host Protect document root, then nginx -t && reload yourself.
# Requires nginx + ModSecurity (or Coraza spoa) on this tenant host.
# SaaS Simulate request is a fake UI row; it does not hit this file.

modsecurity on;
modsecurity_rules '
SecRuleEngine DetectionOnly
SecRequestBodyAccess Off
SecResponseBodyAccess Off
SecRule REQUEST_URI "@beginsWith /xmlrpc.php" "id:1001,phase:1,t:none,deny,status:403,msg:\'mock.xmlrpc\'"
SecRule ARGS "@rx (?i)(union\\s+select|or\\s+1=1)" "id:1002,phase:2,t:none,deny,status:403,msg:\'mock.sqli.1\'"
SecRule REQUEST_URI "@rx \\.\\./" "id:1003,phase:1,t:none,deny,status:403,msg:\'mock.rce.path\'"
';
EOF
  chmod 644 "$dest"
  log "ok: wrote ${dest}. Include it in the customer site vhost yourself. No nginx reload."
}

show_menu() {
  [[ -t 0 ]] || die "no flags and no TTY — pass --status, --install-wazuh-agent, --configure-host-protect, --write-waf-snippet, and/or --apply-waf-vhost"
  print_setup_status
  echo "Sinexis installer"
  echo "  1) Install wazuh-agent"
  echo "  2) Configure Host Protect helper"
  echo "  3) Both (1+2)"
  echo "  4) Write Host WAF nginx snippet (file only; no include/reload)"
  echo "  5) Write snippet AND include in every server{} of a vhost you name (nginx -t + reload)"
  echo "  6) Show setup status only"
  echo "  7) Set WAF ingest (site UUID + audit log; token not printed) and poll once"
  echo "  8) Poll helper once (POST WAF events if site UUID is set)"
  echo "  9) Quit"
  read -r -p "Choice [1-9]: " _c
  case "$_c" in
    1) DO_WAZUH=1 ;;
    2) DO_HELPER=1; INTERACTIVE=1 ;;
    3) DO_WAZUH=1; DO_HELPER=1; INTERACTIVE=1 ;;
    4) DO_WAF_SNIPPET=1 ;;
    5) DO_WAF_APPLY=1 ;;
    6) DO_STATUS=1 ;;
    7) DO_WAF_INGEST=1 ;;
    8) DO_WAF_POLL=1 ;;
    9) exit 0 ;;
    *) die "invalid choice" ;;
  esac
}


SINEXIS_B64_SCAN='IyEvdXNyL2Jpbi9lbnYgcHl0aG9uMwoiIiJPbi1ib3ggSG9zdCBQcm90ZWN0IGhlbHBlciAoUzEw
KTogbmVlZGxlcy9ZQVJBIHdhbGsgaW4gamFpbCwgUE9TVCBKU09OIHRvIFNhYVMuCgpOb3QgYSBz
ZWNvbmQgZW5yb2xsIGRhZW1vbi4gRGVwZW5kcyB3YXp1aC1hZ2VudCBhdCBwYWNrYWdlIGxldmVs
LgpDSSBtdXN0IHBhc3Mgd2l0aG91dCBjbGFtc2NhbiBvciB5YXJhIENMSS4KIiIiCmZyb20gX19m
dXR1cmVfXyBpbXBvcnQgYW5ub3RhdGlvbnMKCmltcG9ydCBhcmdwYXJzZQppbXBvcnQgZmNudGwK
aW1wb3J0IGhhc2hsaWIKaW1wb3J0IGpzb24KaW1wb3J0IG9zCmltcG9ydCByZQppbXBvcnQgc2h1
dGlsCmltcG9ydCBzdWJwcm9jZXNzCmltcG9ydCBzeXMKaW1wb3J0IHRpbWUKaW1wb3J0IHVybGxp
Yi5lcnJvcgppbXBvcnQgdXJsbGliLnBhcnNlCmltcG9ydCB1cmxsaWIucmVxdWVzdApmcm9tIHBh
dGhsaWIgaW1wb3J0IFBhdGgKCkFMTE9XRURfUFJFRklYRVMgPSAoIi92YXIvd3d3IiwgIi9zcnYv
d3d3IiwgIi9ob21lIikKX1NLSVBfRElSUyA9IHsiLmdpdCIsICJub2RlX21vZHVsZXMiLCAiX19w
eWNhY2hlX18iLCAiLnF1YXJhbnRpbmUifQpfTUFYX0ZJTEVTID0gNTAwCl9NQVhfQllURVMgPSAx
XzA0OF81NzYKX1JVTEVfUkUgPSByZS5jb21waWxlKHIicnVsZVxzK1x3K1xzKlx7KC4qPylcblx9
IiwgcmUuRE9UQUxMKQpfTUVUQV9JRCA9IHJlLmNvbXBpbGUocidpZFxzKj1ccyoiKFteIl0rKSIn
KQpfTUVUQV9DTEFTUyA9IHJlLmNvbXBpbGUocidoaXRfY2xhc3Nccyo9XHMqIihbXiJdKykiJykK
X1NUUiA9IHJlLmNvbXBpbGUocidcJFx3K1xzKj1ccyoiKCg/OlxcLnxbXiJcXF0pKikiJykKX1BB
VEhfQ0hBUlMgPSByZS5jb21waWxlKHIiXltcdy4vXC1dKyQiKQpfTlVMID0gIlx4MDAiCgpIRVJF
ID0gUGF0aChfX2ZpbGVfXykucmVzb2x2ZSgpLnBhcmVudApERUZBVUxUX1JVTEVTID0gSEVSRSAv
ICJydWxlcyIKVVNFUl9BR0VOVCA9ICJTaW5leGlzSG9zdFByb3RlY3QvMSIKCgpkZWYgX2FnZW50
X2hlYWRlcnModG9rZW46IHN0ciwgKiwganNvbl9ib2R5OiBib29sID0gRmFsc2UpIC0+IGRpY3Rb
c3RyLCBzdHJdOgogICAgaGVhZGVycyA9IHsiVXNlci1BZ2VudCI6IFVTRVJfQUdFTlQsICJYLUhv
c3QtQWdlbnQtVG9rZW4iOiB0b2tlbn0KICAgIGlmIGpzb25fYm9keToKICAgICAgICBoZWFkZXJz
WyJDb250ZW50LVR5cGUiXSA9ICJhcHBsaWNhdGlvbi9qc29uIgogICAgcmV0dXJuIGhlYWRlcnMK
CgpkZWYgdmFsaWRhdGVfcm9vdF9wYXRoKHJhdzogc3RyKSAtPiBzdHI6CiAgICBwYXRoID0gKHJh
dyBvciAiIikuc3RyaXAoKQogICAgaWYgbm90IHBhdGggb3IgX05VTCBpbiBwYXRoOgogICAgICAg
IHJhaXNlIFZhbHVlRXJyb3IoIkludmFsaWQgcm9vdCBwYXRoIikKICAgIGlmIG5vdCBwYXRoLnN0
YXJ0c3dpdGgoIi8iKToKICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJyb290X3BhdGggbXVzdCBi
ZSBhYnNvbHV0ZSIpCiAgICBpZiAiLi4iIGluIHBhdGg6CiAgICAgICAgcmFpc2UgVmFsdWVFcnJv
cigicGF0aCB0cmF2ZXJzYWwgaXMgbm90IGFsbG93ZWQiKQogICAgaWYgbm90IF9QQVRIX0NIQVJT
Lm1hdGNoKHBhdGgpOgogICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoInJvb3RfcGF0aCBjb250YWlu
cyBpbnZhbGlkIGNoYXJhY3RlcnMiKQogICAgbm9ybWFsaXplZCA9IG9zLnBhdGgubm9ybXBhdGgo
cGF0aCkKICAgIGlmICIuLiIgaW4gbm9ybWFsaXplZC5zcGxpdCgiLyIpOgogICAgICAgIHJhaXNl
IFZhbHVlRXJyb3IoInBhdGggdHJhdmVyc2FsIGlzIG5vdCBhbGxvd2VkIikKICAgIGlmIG5vdCBh
bnkobm9ybWFsaXplZCA9PSBwIG9yIG5vcm1hbGl6ZWQuc3RhcnRzd2l0aChwICsgIi8iKSBmb3Ig
cCBpbiBBTExPV0VEX1BSRUZJWEVTKToKICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJyb290X3Bh
dGggaXMgb3V0c2lkZSB0aGUgYWxsb3dsaXN0IikKICAgIHJldHVybiBub3JtYWxpemVkCgoKZGVm
IGxvYWRfc2lnbmF0dXJlX3BhY2socnVsZXNfZGlyOiBQYXRoKSAtPiBsaXN0W2RpY3Rbc3RyLCBv
YmplY3RdXToKICAgIHBhY2s6IGxpc3RbZGljdFtzdHIsIG9iamVjdF1dID0gW10KICAgIGlmIG5v
dCBydWxlc19kaXIuaXNfZGlyKCk6CiAgICAgICAgcmV0dXJuIHBhY2sKICAgIGZvciBwYXRoIGlu
IHNvcnRlZChydWxlc19kaXIuZ2xvYigiKi55YXIiKSk6CiAgICAgICAgdGV4dCA9IHBhdGgucmVh
ZF90ZXh0KGVuY29kaW5nPSJ1dGYtOCIpCiAgICAgICAgZm9yIGJvZHkgaW4gX1JVTEVfUkUuZmlu
ZGFsbCh0ZXh0KToKICAgICAgICAgICAgaWRfbSA9IF9NRVRBX0lELnNlYXJjaChib2R5KQogICAg
ICAgICAgICBjbGFzc19tID0gX01FVEFfQ0xBU1Muc2VhcmNoKGJvZHkpCiAgICAgICAgICAgIGlm
IGlkX20gaXMgTm9uZToKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIG5lZWRs
ZXMgPSBbYnl0ZXMoX3VuZXNjYXBlKHMpLCAidXRmLTgiKSBmb3IgcyBpbiBfU1RSLmZpbmRhbGwo
Ym9keSldCiAgICAgICAgICAgIGlmIG5vdCBuZWVkbGVzOgogICAgICAgICAgICAgICAgY29udGlu
dWUKICAgICAgICAgICAgcGFjay5hcHBlbmQoCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAg
ICAgICAgICAgInJ1bGVfaWQiOiBpZF9tLmdyb3VwKDEpLAogICAgICAgICAgICAgICAgICAgICJo
aXRfY2xhc3MiOiBjbGFzc19tLmdyb3VwKDEpIGlmIGNsYXNzX20gaXMgbm90IE5vbmUgZWxzZSAi
c3VzcGljaW91cyIsCiAgICAgICAgICAgICAgICAgICAgIm5lZWRsZXMiOiBuZWVkbGVzLAogICAg
ICAgICAgICAgICAgfQogICAgICAgICAgICApCiAgICByZXR1cm4gcGFjawoKCmRlZiBfdW5lc2Nh
cGUocmF3OiBzdHIpIC0+IHN0cjoKICAgIHJldHVybiByYXcucmVwbGFjZSgnXFwiJywgJyInKS5y
ZXBsYWNlKCJcXFxcIiwgIlxcIikKCgpkZWYgX3NoYTI1Nl9maWxlKHBhdGg6IHN0cikgLT4gc3Ry
OgogICAgaCA9IGhhc2hsaWIuc2hhMjU2KCkKICAgIHdpdGggb3BlbihwYXRoLCAicmIiKSBhcyBm
aDoKICAgICAgICB3aGlsZSBUcnVlOgogICAgICAgICAgICBjaHVuayA9IGZoLnJlYWQoNjU1MzYp
CiAgICAgICAgICAgIGlmIG5vdCBjaHVuazoKICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAg
ICAgIGgudXBkYXRlKGNodW5rKQogICAgcmV0dXJuIGguaGV4ZGlnZXN0KCkKCgpkZWYgc2Nhbl9u
ZWVkbGVzKHJvb3Q6IHN0ciwgcGFjazogbGlzdFtkaWN0W3N0ciwgb2JqZWN0XV0pIC0+IGxpc3Rb
ZGljdFtzdHIsIHN0cl1dOgogICAgaGl0czogbGlzdFtkaWN0W3N0ciwgc3RyXV0gPSBbXQogICAg
c2Vlbjogc2V0W3R1cGxlW3N0ciwgc3RyXV0gPSBzZXQoKQogICAgbmZpbGVzID0gMAogICAgZm9y
IGRpcnBhdGgsIGRpcm5hbWVzLCBmaWxlbmFtZXMgaW4gb3Mud2Fsayhyb290LCBmb2xsb3dsaW5r
cz1GYWxzZSk6CiAgICAgICAgZGlybmFtZXNbOl0gPSBbZCBmb3IgZCBpbiBkaXJuYW1lcyBpZiBk
IG5vdCBpbiBfU0tJUF9ESVJTIGFuZCAiLi4iIG5vdCBpbiBkXQogICAgICAgIGZvciBuYW1lIGlu
IGZpbGVuYW1lczoKICAgICAgICAgICAgbmZpbGVzICs9IDEKICAgICAgICAgICAgaWYgbmZpbGVz
ID4gX01BWF9GSUxFUzoKICAgICAgICAgICAgICAgIHJldHVybiBoaXRzCiAgICAgICAgICAgIGZ1
bGwgPSBvcy5wYXRoLmpvaW4oZGlycGF0aCwgbmFtZSkKICAgICAgICAgICAgcmVsID0gb3MucGF0
aC5yZWxwYXRoKGZ1bGwsIHJvb3QpLnJlcGxhY2Uob3Muc2VwLCAiLyIpCiAgICAgICAgICAgIGlm
ICIuLiIgaW4gcmVsLnNwbGl0KCIvIikgb3IgX05VTCBpbiByZWw6CiAgICAgICAgICAgICAgICBj
b250aW51ZQogICAgICAgICAgICB0cnk6CiAgICAgICAgICAgICAgICBzaXplID0gb3MucGF0aC5n
ZXRzaXplKGZ1bGwpCiAgICAgICAgICAgIGV4Y2VwdCBPU0Vycm9yOgogICAgICAgICAgICAgICAg
Y29udGludWUKICAgICAgICAgICAgaWYgc2l6ZSA+IF9NQVhfQllURVMgb3Igc2l6ZSA9PSAwOgog
ICAgICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAg
d2l0aCBvcGVuKGZ1bGwsICJyYiIpIGFzIGZoOgogICAgICAgICAgICAgICAgICAgIGJsb2IgPSBm
aC5yZWFkKF9NQVhfQllURVMpCiAgICAgICAgICAgIGV4Y2VwdCBPU0Vycm9yOgogICAgICAgICAg
ICAgICAgY29udGludWUKICAgICAgICAgICAgZGlnZXN0ID0gaGFzaGxpYi5zaGEyNTYoYmxvYiku
aGV4ZGlnZXN0KCkgaWYgc2l6ZSA8PSBfTUFYX0JZVEVTIGVsc2UgX3NoYTI1Nl9maWxlKGZ1bGwp
CiAgICAgICAgICAgIGZvciBzcGVjIGluIHBhY2s6CiAgICAgICAgICAgICAgICBuZWVkbGVzID0g
c3BlY1sibmVlZGxlcyJdCiAgICAgICAgICAgICAgICBpZiBub3QgaXNpbnN0YW5jZShuZWVkbGVz
LCBsaXN0KToKICAgICAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICAgICAgaWYg
YW55KG4gaW4gYmxvYiBmb3IgbiBpbiBuZWVkbGVzIGlmIGlzaW5zdGFuY2UobiwgKGJ5dGVzLCBi
eXRlYXJyYXkpKSk6CiAgICAgICAgICAgICAgICAgICAga2V5ID0gKHJlbCwgc3RyKHNwZWNbInJ1
bGVfaWQiXSkpCiAgICAgICAgICAgICAgICAgICAgaWYga2V5IGluIHNlZW46CiAgICAgICAgICAg
ICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgICAgICAgICAgc2Vlbi5hZGQoa2V5KQog
ICAgICAgICAgICAgICAgICAgIGhpdHMuYXBwZW5kKAogICAgICAgICAgICAgICAgICAgICAgICB7
CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAicmVsX3BhdGgiOiByZWwsCiAgICAgICAgICAg
ICAgICAgICAgICAgICAgICAiY2xhc3MiOiBzdHIoc3BlY1siaGl0X2NsYXNzIl0pLAogICAgICAg
ICAgICAgICAgICAgICAgICAgICAgInJ1bGVfaWQiOiBzdHIoc3BlY1sicnVsZV9pZCJdKSwKICAg
ICAgICAgICAgICAgICAgICAgICAgICAgICJzaGEyNTYiOiBkaWdlc3QsCiAgICAgICAgICAgICAg
ICAgICAgICAgIH0KICAgICAgICAgICAgICAgICAgICApCiAgICByZXR1cm4gaGl0cwoKCmRlZiB5
YXJhX2F2YWlsYWJsZSgpIC0+IGJvb2w6CiAgICByZXR1cm4gc2h1dGlsLndoaWNoKCJ5YXJhIikg
aXMgbm90IE5vbmUKCgpkZWYgY2xhbV9iaW5hcnkoKSAtPiBzdHIgfCBOb25lOgogICAgcmV0dXJu
IHNodXRpbC53aGljaCgiY2xhbWRzY2FuIikgb3Igc2h1dGlsLndoaWNoKCJjbGFtc2NhbiIpCgoK
ZGVmIHNjYW5fY2xhbShyb290OiBzdHIsIHRpbWVvdXQ6IGludCA9IDEyMCkgLT4gbGlzdFtkaWN0
W3N0ciwgc3RyXV06CiAgICBiaW5hcnkgPSBjbGFtX2JpbmFyeSgpCiAgICBpZiBiaW5hcnkgaXMg
Tm9uZToKICAgICAgICByZXR1cm4gW10KICAgIGNtZCA9IFtiaW5hcnksICItLW5vLXN1bW1hcnki
LCAiLXIiLCByb290XQogICAgaWYgb3MucGF0aC5iYXNlbmFtZShiaW5hcnkpID09ICJjbGFtZHNj
YW4iOgogICAgICAgIGNtZC5pbnNlcnQoMSwgIi0tZmRwYXNzIikKICAgIHRyeToKICAgICAgICBw
cm9jID0gc3VicHJvY2Vzcy5ydW4oCiAgICAgICAgICAgIGNtZCwKICAgICAgICAgICAgY2FwdHVy
ZV9vdXRwdXQ9VHJ1ZSwKICAgICAgICAgICAgdGV4dD1UcnVlLAogICAgICAgICAgICB0aW1lb3V0
PXRpbWVvdXQsCiAgICAgICAgICAgIGNoZWNrPUZhbHNlLAogICAgICAgICkKICAgIGV4Y2VwdCAo
T1NFcnJvciwgc3VicHJvY2Vzcy5UaW1lb3V0RXhwaXJlZCk6CiAgICAgICAgcmV0dXJuIFtdCiAg
ICBoaXRzOiBsaXN0W2RpY3Rbc3RyLCBzdHJdXSA9IFtdCiAgICBzZWVuOiBzZXRbc3RyXSA9IHNl
dCgpCiAgICBmb3IgbGluZSBpbiAocHJvYy5zdGRvdXQgb3IgIiIpLnNwbGl0bGluZXMoKToKICAg
ICAgICBpZiBub3QgbGluZS5lbmRzd2l0aCgiIEZPVU5EIik6CiAgICAgICAgICAgIGNvbnRpbnVl
CiAgICAgICAgbGVmdCwgXywgc2lnID0gbGluZS5ycGFydGl0aW9uKCI6IikKICAgICAgICBwYXRo
ID0gbGVmdC5zdHJpcCgpCiAgICAgICAgcnVsZSA9IHNpZy5zdHJpcCgpLnJlbW92ZXN1ZmZpeCgi
IEZPVU5EIikuc3RyaXAoKQogICAgICAgIGlmIG5vdCBwYXRoLnN0YXJ0c3dpdGgocm9vdCArIG9z
LnNlcCkgYW5kIHBhdGggIT0gcm9vdDoKICAgICAgICAgICAgY29udGludWUKICAgICAgICByZWwg
PSBvcy5wYXRoLnJlbHBhdGgocGF0aCwgcm9vdCkucmVwbGFjZShvcy5zZXAsICIvIikKICAgICAg
ICBpZiAiLi4iIGluIHJlbC5zcGxpdCgiLyIpIG9yIF9OVUwgaW4gcmVsOgogICAgICAgICAgICBj
b250aW51ZQogICAgICAgIGlmIHJlbCBpbiBzZWVuOgogICAgICAgICAgICBjb250aW51ZQogICAg
ICAgIHNlZW4uYWRkKHJlbCkKICAgICAgICBzYWZlX3J1bGUgPSByZS5zdWIociJbXlx3LlwtXSsi
LCAiXyIsIHJ1bGUpWzo4MF0gb3IgImhpdCIKICAgICAgICBkaWdlc3QgPSAiIgogICAgICAgIHRy
eToKICAgICAgICAgICAgZGlnZXN0ID0gX3NoYTI1Nl9maWxlKHBhdGgpCiAgICAgICAgZXhjZXB0
IE9TRXJyb3I6CiAgICAgICAgICAgIGRpZ2VzdCA9ICIiCiAgICAgICAgaXRlbSA9IHsKICAgICAg
ICAgICAgInJlbF9wYXRoIjogcmVsLAogICAgICAgICAgICAiY2xhc3MiOiAibWFsd2FyZSIsCiAg
ICAgICAgICAgICJydWxlX2lkIjogZiJjbGFtLntzYWZlX3J1bGV9IiwKICAgICAgICB9CiAgICAg
ICAgaWYgZGlnZXN0OgogICAgICAgICAgICBpdGVtWyJzaGEyNTYiXSA9IGRpZ2VzdAogICAgICAg
IGhpdHMuYXBwZW5kKGl0ZW0pCiAgICByZXR1cm4gaGl0cwoKCmRlZiBwYXJzZV9hcmdzKGFyZ3Y6
IGxpc3Rbc3RyXSB8IE5vbmUgPSBOb25lKSAtPiBhcmdwYXJzZS5OYW1lc3BhY2U6CiAgICBwID0g
YXJncGFyc2UuQXJndW1lbnRQYXJzZXIoZGVzY3JpcHRpb249IlNpbmV4aXMgSG9zdCBQcm90ZWN0
IG9uLWJveCBzY2FuIGhlbHBlciIpCiAgICBwLmFkZF9hcmd1bWVudCgKICAgICAgICAiYWN0aW9u
IiwKICAgICAgICBuYXJncz0iPyIsCiAgICAgICAgZGVmYXVsdD0ic2NhbiIsCiAgICAgICAgY2hv
aWNlcz0oInNjYW4iLCAicG9sbCIsICJxdWFyYW50aW5lIiwgInJlc3RvcmUiKSwKICAgICkKICAg
IHAuYWRkX2FyZ3VtZW50KCItLXJvb3QiLCBkZWZhdWx0PSIiLCBoZWxwPSJBYnNvbHV0ZSB3ZWIg
cm9vdCBvbiB0aGlzIFZNIikKICAgIHAuYWRkX2FyZ3VtZW50KCItLXNjYW4taWQiLCBkZWZhdWx0
PSIiKQogICAgcC5hZGRfYXJndW1lbnQoIi0tYWdlbnQtaWQiLCBkZWZhdWx0PW9zLmVudmlyb24u
Z2V0KCJTSU5FWElTX0FHRU5UX0lEIiwgIiIpKQogICAgcC5hZGRfYXJndW1lbnQoIi0tcmVsLXBh
dGgiLCBkZWZhdWx0PSIiKQogICAgcC5hZGRfYXJndW1lbnQoIi0tc2l0ZS1pZCIsIGRlZmF1bHQ9
IiIpCiAgICBwLmFkZF9hcmd1bWVudCgiLS1oaXQtaWQiLCBkZWZhdWx0PSIiKQogICAgcC5hZGRf
YXJndW1lbnQoIi0tZGVzdC1iYXNlbmFtZSIsIGRlZmF1bHQ9IiIpCiAgICBwLmFkZF9hcmd1bWVu
dCgKICAgICAgICAiLS1xdWFyYW50aW5lLXJvb3QiLAogICAgICAgIGRlZmF1bHQ9b3MuZW52aXJv
bi5nZXQoIlNJTkVYSVNfUVVBUkFOVElORV9ST09UIiwgIi92YXIvbGliL3NpbmV4aXMvcXVhcmFu
dGluZSIpLAogICAgKQogICAgcC5hZGRfYXJndW1lbnQoIi0tYXBpLWJhc2UiLCBkZWZhdWx0PW9z
LmVudmlyb24uZ2V0KCJTSU5FWElTX0FQSV9CQVNFIiwgIiIpKQogICAgcC5hZGRfYXJndW1lbnQo
Ii0tdG9rZW4iLCBkZWZhdWx0PW9zLmVudmlyb24uZ2V0KCJTSU5FWElTX0hPU1RfQUdFTlRfVE9L
RU4iLCAiIikpCiAgICBwLmFkZF9hcmd1bWVudCgiLS1ydWxlcy1kaXIiLCBkZWZhdWx0PXN0cihE
RUZBVUxUX1JVTEVTKSkKICAgIHAuYWRkX2FyZ3VtZW50KCItLXRpbWVvdXQiLCB0eXBlPWludCwg
ZGVmYXVsdD0xMjApCiAgICBwLmFkZF9hcmd1bWVudCgiLS1kcnktcnVuIiwgYWN0aW9uPSJzdG9y
ZV90cnVlIiwgaGVscD0iU2NhbiBvbmx5OyBkbyBub3QgUE9TVCIpCiAgICBwLmFkZF9hcmd1bWVu
dCgiLS1qc29uLW91dCIsIGRlZmF1bHQ9IiIsIGhlbHA9IldyaXRlIGZpbmRpbmdzIEpTT04gdG8g
cGF0aCIpCiAgICByZXR1cm4gcC5wYXJzZV9hcmdzKGFyZ3YpCgoKZGVmIF9qYWlsX3JlbChyb290
OiBzdHIsIHJlbDogc3RyKSAtPiBzdHI6CiAgICByZWwgPSAocmVsIG9yICIiKS5zdHJpcCgpLmxz
dHJpcCgiLyIpCiAgICBpZiBub3QgcmVsIG9yIF9OVUwgaW4gcmVsIG9yICIuLiIgaW4gcmVsLnNw
bGl0KCIvIik6CiAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigiYmFkIHJlbCIpCiAgICBqb2luZWQg
PSBvcy5wYXRoLm5vcm1wYXRoKG9zLnBhdGguam9pbihyb290LCByZWwpKQogICAgaWYgam9pbmVk
ICE9IHJvb3QgYW5kIG5vdCBqb2luZWQuc3RhcnRzd2l0aChyb290ICsgIi8iKToKICAgICAgICBy
YWlzZSBWYWx1ZUVycm9yKCJlc2NhcGUiKQogICAgcmV0dXJuIGpvaW5lZAoKCmRlZiBfcWRpcihz
aXRlX2lkOiBzdHIsIHFyb290OiBzdHIpIC0+IHN0cjoKICAgIHJvb3QgPSBvcy5wYXRoLm5vcm1w
YXRoKHFyb290KQogICAgaWYgbm90IHJvb3Quc3RhcnRzd2l0aCgiLyIpIG9yICIuLiIgaW4gcm9v
dC5zcGxpdCgiLyIpOgogICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoImJhZCBxcm9vdCIpCiAgICBp
ZiBhbnkocm9vdCA9PSBwIG9yIHJvb3Quc3RhcnRzd2l0aChwICsgIi8iKSBmb3IgcCBpbiBBTExP
V0VEX1BSRUZJWEVTKToKICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJxcm9vdCB1bmRlciB3ZWIi
KQogICAgc2lkID0gKHNpdGVfaWQgb3IgIiIpLnN0cmlwKCkKICAgIGlmIG5vdCByZS5tYXRjaChy
Il5bXHdcLV0rJCIsIHNpZCk6CiAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigiYmFkIHNpdGUiKQog
ICAgZGVzdCA9IG9zLnBhdGgubm9ybXBhdGgob3MucGF0aC5qb2luKHJvb3QsIHNpZCkpCiAgICBp
ZiBkZXN0ICE9IHJvb3QgYW5kIG5vdCBkZXN0LnN0YXJ0c3dpdGgocm9vdCArICIvIik6CiAgICAg
ICAgcmFpc2UgVmFsdWVFcnJvcigiZXNjYXBlIikKICAgIHJldHVybiBkZXN0CgoKZGVmIF9iYXNl
bmFtZV9vayhuYW1lOiBzdHIpIC0+IGJvb2w6CiAgICByZXR1cm4gYm9vbChyZS5tYXRjaChyIl5b
XHcuXC1dKyQiLCBuYW1lIG9yICIiKSkgYW5kICIvIiBub3QgaW4gbmFtZQoKCmRlZiBydW5fcXVh
cmFudGluZShhcmdzOiBhcmdwYXJzZS5OYW1lc3BhY2UpIC0+IGludDoKICAgIHRyeToKICAgICAg
ICByb290ID0gdmFsaWRhdGVfcm9vdF9wYXRoKGFyZ3Mucm9vdCkKICAgICAgICBzcmMgPSBfamFp
bF9yZWwocm9vdCwgYXJncy5yZWxfcGF0aCkKICAgICAgICBkZXN0X2RpciA9IF9xZGlyKGFyZ3Mu
c2l0ZV9pZCwgYXJncy5xdWFyYW50aW5lX3Jvb3QpCiAgICAgICAgZGVzdF9ibiA9IGFyZ3MuZGVz
dF9iYXNlbmFtZSBvciAiIgogICAgICAgIGlmIG5vdCBfYmFzZW5hbWVfb2soZGVzdF9ibik6CiAg
ICAgICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoImJhZCBkZXN0IikKICAgIGV4Y2VwdCBWYWx1ZUVy
cm9yOgogICAgICAgIHJldHVybiAyCiAgICBkZXN0ID0gb3MucGF0aC5qb2luKGRlc3RfZGlyLCBk
ZXN0X2JuKQogICAgaWYgb3MucGF0aC5pc2ZpbGUoZGVzdCkgYW5kIG5vdCBvcy5wYXRoLmlzZmls
ZShzcmMpOgogICAgICAgIHJldHVybiAwCiAgICBpZiBvcy5wYXRoLmlzZmlsZShkZXN0KSBhbmQg
b3MucGF0aC5pc2ZpbGUoc3JjKToKICAgICAgICByZXR1cm4gNgogICAgaWYgbm90IG9zLnBhdGgu
aXNmaWxlKHNyYyk6CiAgICAgICAgcmV0dXJuIDYKICAgIHRyeToKICAgICAgICBvcy5tYWtlZGly
cyhkZXN0X2RpciwgbW9kZT0wbzcwMCwgZXhpc3Rfb2s9VHJ1ZSkKICAgICAgICBvcy5jaG1vZChk
ZXN0X2RpciwgMG83MDApCiAgICAgICAgaWYgb3MucGF0aC5sZXhpc3RzKGRlc3QpOgogICAgICAg
ICAgICByZXR1cm4gNgogICAgICAgIHNodXRpbC5tb3ZlKHNyYywgZGVzdCkKICAgIGV4Y2VwdCBP
U0Vycm9yOgogICAgICAgIHJldHVybiA2CiAgICByZXR1cm4gMAoKCmRlZiBydW5fcmVzdG9yZShh
cmdzOiBhcmdwYXJzZS5OYW1lc3BhY2UpIC0+IGludDoKICAgIHRyeToKICAgICAgICByb290ID0g
dmFsaWRhdGVfcm9vdF9wYXRoKGFyZ3Mucm9vdCkKICAgICAgICBvcmlnaW5hbCA9IF9qYWlsX3Jl
bChyb290LCBhcmdzLnJlbF9wYXRoKQogICAgICAgIGRlc3RfZGlyID0gX3FkaXIoYXJncy5zaXRl
X2lkLCBhcmdzLnF1YXJhbnRpbmVfcm9vdCkKICAgICAgICBkZXN0X2JuID0gYXJncy5kZXN0X2Jh
c2VuYW1lIG9yICIiCiAgICAgICAgaWYgbm90IF9iYXNlbmFtZV9vayhkZXN0X2JuKToKICAgICAg
ICAgICAgcmFpc2UgVmFsdWVFcnJvcigiYmFkIGRlc3QiKQogICAgZXhjZXB0IFZhbHVlRXJyb3I6
CiAgICAgICAgcmV0dXJuIDIKICAgIHNyYyA9IG9zLnBhdGguam9pbihkZXN0X2RpciwgZGVzdF9i
bikKICAgIGlmIG9zLnBhdGguaXNmaWxlKG9yaWdpbmFsKSBhbmQgbm90IG9zLnBhdGguaXNmaWxl
KHNyYyk6CiAgICAgICAgcmV0dXJuIDAKICAgIGlmIG9zLnBhdGguaXNmaWxlKG9yaWdpbmFsKSBh
bmQgb3MucGF0aC5pc2ZpbGUoc3JjKToKICAgICAgICByZXR1cm4gNgogICAgaWYgbm90IG9zLnBh
dGguaXNmaWxlKHNyYyk6CiAgICAgICAgcmV0dXJuIDYKICAgIHRyeToKICAgICAgICBvcy5tYWtl
ZGlycyhvcy5wYXRoLmRpcm5hbWUob3JpZ2luYWwpLCBleGlzdF9vaz1UcnVlKQogICAgICAgIGlm
IG9zLnBhdGgubGV4aXN0cyhvcmlnaW5hbCk6CiAgICAgICAgICAgIHJldHVybiA2CiAgICAgICAg
c2h1dGlsLm1vdmUoc3JjLCBvcmlnaW5hbCkKICAgIGV4Y2VwdCBPU0Vycm9yOgogICAgICAgIHJl
dHVybiA2CiAgICByZXR1cm4gMAoKCmRlZiBmZXRjaF9qb2JzKGFwaV9iYXNlOiBzdHIsIHRva2Vu
OiBzdHIsIGFnZW50X2lkOiBzdHIsIHRpbWVvdXQ6IGludCkgLT4gdHVwbGVbaW50LCBsaXN0W2Rp
Y3Rbc3RyLCBzdHJdXV06CiAgICB1cmwgPSBhcGlfYmFzZS5yc3RyaXAoIi8iKSArICIvYXBpL2hv
c3QvYWdlbnQvam9icz9hZ2VudF9pZD0iICsgdXJsbGliLnBhcnNlLnF1b3RlKGFnZW50X2lkKQog
ICAgcmVxID0gdXJsbGliLnJlcXVlc3QuUmVxdWVzdCgKICAgICAgICB1cmwsCiAgICAgICAgbWV0
aG9kPSJHRVQiLAogICAgICAgIGhlYWRlcnM9X2FnZW50X2hlYWRlcnModG9rZW4pLAogICAgKQog
ICAgdHJ5OgogICAgICAgIHdpdGggdXJsbGliLnJlcXVlc3QudXJsb3BlbihyZXEsIHRpbWVvdXQ9
dGltZW91dCkgYXMgcmVzcDoKICAgICAgICAgICAgYm9keSA9IGpzb24ubG9hZHMocmVzcC5yZWFk
KCkuZGVjb2RlKCJ1dGYtOCIpKQogICAgZXhjZXB0ICh1cmxsaWIuZXJyb3IuVVJMRXJyb3IsIHVy
bGxpYi5lcnJvci5IVFRQRXJyb3IsIGpzb24uSlNPTkRlY29kZUVycm9yLCBPU0Vycm9yKToKICAg
ICAgICByZXR1cm4gMCwgW10KICAgIGpvYnMgPSBib2R5LmdldCgiam9icyIpIGlmIGlzaW5zdGFu
Y2UoYm9keSwgZGljdCkgZWxzZSBOb25lCiAgICBpZiBub3QgaXNpbnN0YW5jZShqb2JzLCBsaXN0
KToKICAgICAgICByZXR1cm4gMCwgW10KICAgIG91dDogbGlzdFtkaWN0W3N0ciwgc3RyXV0gPSBb
XQogICAgZm9yIGpvYiBpbiBqb2JzOgogICAgICAgIGlmIG5vdCBpc2luc3RhbmNlKGpvYiwgZGlj
dCk6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAga2luZCA9IHN0cihqb2IuZ2V0KCJraW5k
Iikgb3IgInNjYW4iKQogICAgICAgIHJvb3QgPSBzdHIoam9iLmdldCgicm9vdF9wYXRoIikgb3Ig
IiIpCiAgICAgICAgaWYga2luZCA9PSAic2NhbiI6CiAgICAgICAgICAgIHNjYW5faWQgPSBzdHIo
am9iLmdldCgic2Nhbl9pZCIpIG9yICIiKQogICAgICAgICAgICBpZiBzY2FuX2lkIGFuZCByb290
OgogICAgICAgICAgICAgICAgb3V0LmFwcGVuZCh7ImtpbmQiOiAic2NhbiIsICJzY2FuX2lkIjog
c2Nhbl9pZCwgInJvb3RfcGF0aCI6IHJvb3R9KQogICAgICAgIGVsaWYga2luZCBpbiAoInF1YXJh
bnRpbmUiLCAicmVzdG9yZSIpOgogICAgICAgICAgICBjb21tYW5kX2lkID0gc3RyKGpvYi5nZXQo
ImNvbW1hbmRfaWQiKSBvciAiIikKICAgICAgICAgICAgcmVsX3BhdGggPSBzdHIoam9iLmdldCgi
cmVsX3BhdGgiKSBvciAiIikKICAgICAgICAgICAgZGVzdF9iYXNlbmFtZSA9IHN0cihqb2IuZ2V0
KCJkZXN0X2Jhc2VuYW1lIikgb3IgIiIpCiAgICAgICAgICAgIHNpdGVfaWQgPSBzdHIoam9iLmdl
dCgic2l0ZV9pZCIpIG9yICIiKQogICAgICAgICAgICBpZiBjb21tYW5kX2lkIGFuZCByb290IGFu
ZCByZWxfcGF0aCBhbmQgZGVzdF9iYXNlbmFtZSBhbmQgc2l0ZV9pZDoKICAgICAgICAgICAgICAg
IG91dC5hcHBlbmQoCiAgICAgICAgICAgICAgICAgICAgewogICAgICAgICAgICAgICAgICAgICAg
ICAia2luZCI6IGtpbmQsCiAgICAgICAgICAgICAgICAgICAgICAgICJjb21tYW5kX2lkIjogY29t
bWFuZF9pZCwKICAgICAgICAgICAgICAgICAgICAgICAgInJvb3RfcGF0aCI6IHJvb3QsCiAgICAg
ICAgICAgICAgICAgICAgICAgICJyZWxfcGF0aCI6IHJlbF9wYXRoLAogICAgICAgICAgICAgICAg
ICAgICAgICAiZGVzdF9iYXNlbmFtZSI6IGRlc3RfYmFzZW5hbWUsCiAgICAgICAgICAgICAgICAg
ICAgICAgICJzaXRlX2lkIjogc2l0ZV9pZCwKICAgICAgICAgICAgICAgICAgICB9CiAgICAgICAg
ICAgICAgICApCiAgICAgICAgICAgIGVsaWYgY29tbWFuZF9pZDoKICAgICAgICAgICAgICAgIHBv
c3RfY29tbWFuZF9hY2soYXBpX2Jhc2UsIHRva2VuLCBhZ2VudF9pZCwgY29tbWFuZF9pZCwgRmFs
c2UsICJpbmNvbXBsZXRlIGpvYiIsIHRpbWVvdXQpCiAgICByZXR1cm4gbGVuKGpvYnMpLCBvdXQK
CgpfV0FGX0lEX1JFID0gcmUuY29tcGlsZShyJ1xbaWRccysiKFxkKykiXF0nKQpfV0FGX1JFUV9S
RSA9IHJlLmNvbXBpbGUociJeKEdFVHxQT1NUfFBVVHxQQVRDSHxERUxFVEV8SEVBRHxPUFRJT05T
KVxzKyhcUyspIiwgcmUuTVVMVElMSU5FKQpfTUFYX1dBRl9FVkVOVFMgPSAxMDAKX1dBRl9CT09U
U1RSQVBfTUlOX0JZVEVTID0gMV8wNDhfNTc2Cl9XQUZfQk9PVFNUUkFQX1RBSUxfQllURVMgPSA2
NV81MzYKCgpkZWYgX21vZHNlY19qc29uX3Jvd3ModGV4dDogc3RyKSAtPiBsaXN0W29iamVjdF06
CiAgICBzdHJpcHBlZCA9ICh0ZXh0IG9yICIiKS5zdHJpcCgpCiAgICBpZiBub3Qgc3RyaXBwZWQ6
CiAgICAgICAgcmV0dXJuIFtdCiAgICB0cnk6CiAgICAgICAgcGFyc2VkID0ganNvbi5sb2Fkcyhz
dHJpcHBlZCkKICAgICAgICByZXR1cm4gcGFyc2VkIGlmIGlzaW5zdGFuY2UocGFyc2VkLCBsaXN0
KSBlbHNlIFtwYXJzZWRdCiAgICBleGNlcHQganNvbi5KU09ORGVjb2RlRXJyb3I6CiAgICAgICAg
cm93czogbGlzdFtvYmplY3RdID0gW10KICAgICAgICBmb3IgbGluZSBpbiBzdHJpcHBlZC5zcGxp
dGxpbmVzKCk6CiAgICAgICAgICAgIGxpbmUgPSBsaW5lLnN0cmlwKCkKICAgICAgICAgICAgaWYg
bm90IGxpbmUuc3RhcnRzd2l0aCgieyIpIGFuZCBub3QgbGluZS5zdGFydHN3aXRoKCJbIik6CiAg
ICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICB0cnk6CiAgICAgICAgICAgICAgICBw
YXJzZWQgPSBqc29uLmxvYWRzKGxpbmUpCiAgICAgICAgICAgIGV4Y2VwdCBqc29uLkpTT05EZWNv
ZGVFcnJvcjoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIGlmIGlzaW5zdGFu
Y2UocGFyc2VkLCBsaXN0KToKICAgICAgICAgICAgICAgIHJvd3MuZXh0ZW5kKHBhcnNlZCkKICAg
ICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgIHJvd3MuYXBwZW5kKHBhcnNlZCkKICAgICAg
ICByZXR1cm4gcm93cwoKCmRlZiBfbW9kc2VjX3J1bGVfaWQocm93OiBkaWN0W3N0ciwgb2JqZWN0
XSwgdHhuOiBkaWN0W3N0ciwgb2JqZWN0XSkgLT4gc3RyOgogICAgbXNncyA9IHJvdy5nZXQoIm1l
c3NhZ2VzIikgaWYgaXNpbnN0YW5jZShyb3cuZ2V0KCJtZXNzYWdlcyIpLCBsaXN0KSBlbHNlIFtd
CiAgICBpZiBub3QgbXNnczoKICAgICAgICBtc2dzID0gdHhuLmdldCgibWVzc2FnZXMiKSBpZiBp
c2luc3RhbmNlKHR4bi5nZXQoIm1lc3NhZ2VzIiksIGxpc3QpIGVsc2UgW10KICAgIGZvciBtc2cg
aW4gbXNnczoKICAgICAgICBpZiBub3QgaXNpbnN0YW5jZShtc2csIGRpY3QpOgogICAgICAgICAg
ICBjb250aW51ZQogICAgICAgIGRldGFpbHMgPSBtc2cuZ2V0KCJkZXRhaWxzIikgaWYgaXNpbnN0
YW5jZShtc2cuZ2V0KCJkZXRhaWxzIiksIGRpY3QpIGVsc2Uge30KICAgICAgICByaWQgPSBkZXRh
aWxzLmdldCgicnVsZUlkIikgb3IgZGV0YWlscy5nZXQoImlkIikKICAgICAgICBpZiByaWQ6CiAg
ICAgICAgICAgIHJldHVybiBzdHIocmlkKVs6MTI4XQogICAgcmV0dXJuICJ1bmtub3duIgoKCmRl
ZiBwYXJzZV9tb2RzZWNfYXVkaXRfZXZlbnRzKHRleHQ6IHN0cikgLT4gbGlzdFtkaWN0W3N0ciwg
b2JqZWN0XV06CiAgICBldmVudHM6IGxpc3RbZGljdFtzdHIsIG9iamVjdF1dID0gW10KICAgIHN0
cmlwcGVkID0gKHRleHQgb3IgIiIpLnN0cmlwKCkKICAgIGlmIG5vdCBzdHJpcHBlZDoKICAgICAg
ICByZXR1cm4gZXZlbnRzCiAgICBpZiBzdHJpcHBlZC5zdGFydHN3aXRoKCJ7Iikgb3Igc3RyaXBw
ZWQuc3RhcnRzd2l0aCgiWyIpIG9yICJcbnsiIGluIHN0cmlwcGVkOgogICAgICAgIHJvd3MgPSBf
bW9kc2VjX2pzb25fcm93cyhzdHJpcHBlZCkKICAgICAgICBmb3Igcm93IGluIHJvd3M6CiAgICAg
ICAgICAgIGlmIG5vdCBpc2luc3RhbmNlKHJvdywgZGljdCk6CiAgICAgICAgICAgICAgICBjb250
aW51ZQogICAgICAgICAgICB0eG4gPSByb3cuZ2V0KCJ0cmFuc2FjdGlvbiIpIGlmIGlzaW5zdGFu
Y2Uocm93LmdldCgidHJhbnNhY3Rpb24iKSwgZGljdCkgZWxzZSB7fQogICAgICAgICAgICByZXEg
PSB0eG4uZ2V0KCJyZXF1ZXN0IikgaWYgaXNpbnN0YW5jZSh0eG4uZ2V0KCJyZXF1ZXN0IiksIGRp
Y3QpIGVsc2Uge30KICAgICAgICAgICAgcmVzcCA9IHR4bi5nZXQoInJlc3BvbnNlIikgaWYgaXNp
bnN0YW5jZSh0eG4uZ2V0KCJyZXNwb25zZSIpLCBkaWN0KSBlbHNlIHt9CiAgICAgICAgICAgIHJ1
bGVfaWQgPSBfbW9kc2VjX3J1bGVfaWQocm93LCB0eG4pCiAgICAgICAgICAgIG1ldGhvZCA9IHN0
cihyZXEuZ2V0KCJtZXRob2QiKSBvciAiR0VUIikudXBwZXIoKQogICAgICAgICAgICBwYXRoID0g
c3RyKHJlcS5nZXQoInVyaSIpIG9yIHJlcS5nZXQoInVyaV9ub19xdWVyeSIpIG9yICIvIikKICAg
ICAgICAgICAgcGF0aCA9IHBhdGguc3BsaXQoIj8iLCAxKVswXVs6MjU2XSBvciAiLyIKICAgICAg
ICAgICAgc3RhdHVzX2NvZGUgPSByZXNwLmdldCgiaHR0cF9jb2RlIikgb3IgcmVzcC5nZXQoInN0
YXR1cyIpCiAgICAgICAgICAgIGh0dHBfc3RhdHVzID0gaW50KHN0YXR1c19jb2RlKSBpZiBpc2lu
c3RhbmNlKHN0YXR1c19jb2RlLCBpbnQpIGVsc2UgTm9uZQogICAgICAgICAgICBhY3Rpb24gPSAi
YmxvY2siIGlmIGh0dHBfc3RhdHVzID09IDQwMyBlbHNlICJsb2ciCiAgICAgICAgICAgIGV2ZW50
cy5hcHBlbmQoCiAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgImFjdGlvbiI6
IGFjdGlvbiwKICAgICAgICAgICAgICAgICAgICAicnVsZV9pZCI6IHJ1bGVfaWRbOjEyOF0sCiAg
ICAgICAgICAgICAgICAgICAgIm1ldGhvZCI6IG1ldGhvZFs6OF0sCiAgICAgICAgICAgICAgICAg
ICAgInBhdGgiOiBwYXRoLAogICAgICAgICAgICAgICAgICAgICJodHRwX3N0YXR1cyI6IGh0dHBf
c3RhdHVzLAogICAgICAgICAgICAgICAgfQogICAgICAgICAgICApCiAgICAgICAgICAgIGlmIGxl
bihldmVudHMpID49IF9NQVhfV0FGX0VWRU5UUzoKICAgICAgICAgICAgICAgIGJyZWFrCiAgICAg
ICAgaWYgZXZlbnRzOgogICAgICAgICAgICByZXR1cm4gZXZlbnRzCiAgICBmb3IgY2h1bmsgaW4g
cmUuc3BsaXQociJcbi0tW0EtWmEtejAtOV0rLS1bQS1aXS0tXG4iLCB0ZXh0KToKICAgICAgICBp
ZHMgPSBfV0FGX0lEX1JFLmZpbmRhbGwoY2h1bmspCiAgICAgICAgcmVxX20gPSBfV0FGX1JFUV9S
RS5zZWFyY2goY2h1bmspCiAgICAgICAgaWYgbm90IGlkcyBhbmQgbm90IHJlcV9tOgogICAgICAg
ICAgICBjb250aW51ZQogICAgICAgIG1ldGhvZCA9IChyZXFfbS5ncm91cCgxKSBpZiByZXFfbSBl
bHNlICJHRVQiKS51cHBlcigpCiAgICAgICAgcmF3X3BhdGggPSByZXFfbS5ncm91cCgyKSBpZiBy
ZXFfbSBlbHNlICIvIgogICAgICAgIHBhdGggPSByYXdfcGF0aC5zcGxpdCgiPyIsIDEpWzBdWzoy
NTZdIG9yICIvIgogICAgICAgIGh0dHBfc3RhdHVzID0gNDAzIGlmICI0MDMiIGluIGNodW5rIG9y
ICJJbnRlcmNlcHRlZCIgaW4gY2h1bmsgZWxzZSBOb25lCiAgICAgICAgZXZlbnRzLmFwcGVuZCgK
ICAgICAgICAgICAgewogICAgICAgICAgICAgICAgImFjdGlvbiI6ICJibG9jayIgaWYgaHR0cF9z
dGF0dXMgPT0gNDAzIGVsc2UgImxvZyIsCiAgICAgICAgICAgICAgICAicnVsZV9pZCI6IChpZHNb
MF0gaWYgaWRzIGVsc2UgInVua25vd24iKVs6MTI4XSwKICAgICAgICAgICAgICAgICJtZXRob2Qi
OiBtZXRob2RbOjhdLAogICAgICAgICAgICAgICAgInBhdGgiOiBwYXRoLAogICAgICAgICAgICAg
ICAgImh0dHBfc3RhdHVzIjogaHR0cF9zdGF0dXMsCiAgICAgICAgICAgIH0KICAgICAgICApCiAg
ICAgICAgaWYgbGVuKGV2ZW50cykgPj0gX01BWF9XQUZfRVZFTlRTOgogICAgICAgICAgICBicmVh
awogICAgcmV0dXJuIGV2ZW50cwoKCmRlZiBfd2FmX2N1cnNvcl9wYXRoKGFnZW50X2lkOiBzdHIp
IC0+IHN0cjoKICAgIHNhZmUgPSByZS5zdWIociJbXjAtOWEtZkEtRi1dIiwgIl8iLCBhZ2VudF9p
ZClbOjgwXSBvciAiYWdlbnQiCiAgICBsb2NrX2RpciA9IG9zLmVudmlyb24uZ2V0KCJTSU5FWElT
X1BPTExfTE9DS19ESVIiLCAiL3Zhci9saWIvc2luZXhpcyIpCiAgICByZXR1cm4gb3MucGF0aC5q
b2luKGxvY2tfZGlyLCBmIndhZi1hdWRpdC17c2FmZX0uY3Vyc29yIikKCgpkZWYgcmVhZF9uZXdf
YXVkaXRfdGV4dChwYXRoOiBzdHIsIGFnZW50X2lkOiBzdHIpIC0+IHN0cjoKICAgIGlmIG5vdCBw
YXRoIG9yIG5vdCBvcy5wYXRoLmlzZmlsZShwYXRoKToKICAgICAgICByZXR1cm4gIiIKICAgIGN1
cnNvcl9wYXRoID0gX3dhZl9jdXJzb3JfcGF0aChhZ2VudF9pZCkKICAgIG9mZnNldCA9IDAKICAg
IGhhZF9jdXJzb3IgPSBGYWxzZQogICAgdHJ5OgogICAgICAgIHdpdGggb3BlbihjdXJzb3JfcGF0
aCwgZW5jb2Rpbmc9InV0Zi04IikgYXMgZmg6CiAgICAgICAgICAgIG9mZnNldCA9IGludChmaC5y
ZWFkKCkuc3RyaXAoKSBvciAiMCIpCiAgICAgICAgaGFkX2N1cnNvciA9IFRydWUKICAgIGV4Y2Vw
dCAoT1NFcnJvciwgVmFsdWVFcnJvcik6CiAgICAgICAgb2Zmc2V0ID0gMAogICAgdHJ5OgogICAg
ICAgIHNpemUgPSBvcy5wYXRoLmdldHNpemUocGF0aCkKICAgICAgICBpZiBvZmZzZXQgPiBzaXpl
OgogICAgICAgICAgICBvZmZzZXQgPSAwCiAgICAgICAgaWYgbm90IGhhZF9jdXJzb3IgYW5kIHNp
emUgPiBfV0FGX0JPT1RTVFJBUF9NSU5fQllURVM6CiAgICAgICAgICAgIG9mZnNldCA9IG1heCgw
LCBzaXplIC0gX1dBRl9CT09UU1RSQVBfVEFJTF9CWVRFUykKICAgICAgICB3aXRoIG9wZW4ocGF0
aCwgInJiIikgYXMgZmg6CiAgICAgICAgICAgIGZoLnNlZWsob2Zmc2V0KQogICAgICAgICAgICBp
ZiBub3QgaGFkX2N1cnNvciBhbmQgc2l6ZSA+IF9XQUZfQk9PVFNUUkFQX01JTl9CWVRFUyBhbmQg
b2Zmc2V0OgogICAgICAgICAgICAgICAgZmgucmVhZGxpbmUoKQogICAgICAgICAgICBkYXRhID0g
ZmgucmVhZCgpCiAgICAgICAgICAgIG5ld19vZmZzZXQgPSBmaC50ZWxsKCkKICAgICAgICBvcy5t
YWtlZGlycyhvcy5wYXRoLmRpcm5hbWUoY3Vyc29yX3BhdGgpLCBtb2RlPTBvNzAwLCBleGlzdF9v
az1UcnVlKQogICAgICAgIHdpdGggb3BlbihjdXJzb3JfcGF0aCwgInciLCBlbmNvZGluZz0idXRm
LTgiKSBhcyBmaDoKICAgICAgICAgICAgZmgud3JpdGUoc3RyKG5ld19vZmZzZXQpKQogICAgICAg
IHJldHVybiBkYXRhLmRlY29kZSgidXRmLTgiLCBlcnJvcnM9InJlcGxhY2UiKQogICAgZXhjZXB0
IE9TRXJyb3I6CiAgICAgICAgcmV0dXJuICIiCgoKZGVmIGRlZHVwZV93YWZfZXZlbnRzKGV2ZW50
czogbGlzdFtkaWN0W3N0ciwgb2JqZWN0XV0pIC0+IGxpc3RbZGljdFtzdHIsIG9iamVjdF1dOgog
ICAgc2Vlbjogc2V0W3R1cGxlW29iamVjdCwgb2JqZWN0LCBvYmplY3QsIG9iamVjdF1dID0gc2V0
KCkKICAgIG91dDogbGlzdFtkaWN0W3N0ciwgb2JqZWN0XV0gPSBbXQogICAgZm9yIGV2ZW50IGlu
IGV2ZW50czoKICAgICAgICBrZXkgPSAoZXZlbnQuZ2V0KCJwYXRoIiksIGV2ZW50LmdldCgicnVs
ZV9pZCIpLCBldmVudC5nZXQoIm1ldGhvZCIpLCBldmVudC5nZXQoImFjdGlvbiIpKQogICAgICAg
IGlmIGtleSBpbiBzZWVuOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHNlZW4uYWRkKGtl
eSkKICAgICAgICBvdXQuYXBwZW5kKGV2ZW50KQogICAgcmV0dXJuIG91dAoKCmRlZiBwb3N0X3dh
Zl9ldmVudHMoYXBpX2Jhc2U6IHN0ciwgdG9rZW46IHN0ciwgcGF5bG9hZDogZGljdFtzdHIsIG9i
amVjdF0sIHRpbWVvdXQ6IGludCkgLT4gaW50OgogICAgdXJsID0gYXBpX2Jhc2UucnN0cmlwKCIv
IikgKyAiL2FwaS9ob3N0L2FnZW50L3dhZi1ldmVudHMiCiAgICBkYXRhID0ganNvbi5kdW1wcyhw
YXlsb2FkKS5lbmNvZGUoInV0Zi04IikKICAgIHJlcSA9IHVybGxpYi5yZXF1ZXN0LlJlcXVlc3Qo
CiAgICAgICAgdXJsLAogICAgICAgIGRhdGE9ZGF0YSwKICAgICAgICBtZXRob2Q9IlBPU1QiLAog
ICAgICAgIGhlYWRlcnM9X2FnZW50X2hlYWRlcnModG9rZW4sIGpzb25fYm9keT1UcnVlKSwKICAg
ICkKICAgIHRyeToKICAgICAgICB3aXRoIHVybGxpYi5yZXF1ZXN0LnVybG9wZW4ocmVxLCB0aW1l
b3V0PXRpbWVvdXQpIGFzIHJlc3A6CiAgICAgICAgICAgIHJldHVybiBpbnQoZ2V0YXR0cihyZXNw
LCAic3RhdHVzIiwgMjAwKSBvciAyMDApCiAgICBleGNlcHQgdXJsbGliLmVycm9yLkhUVFBFcnJv
ciBhcyBleGM6CiAgICAgICAgcmV0dXJuIGludChleGMuY29kZSkKICAgIGV4Y2VwdCAodXJsbGli
LmVycm9yLlVSTEVycm9yLCBPU0Vycm9yKToKICAgICAgICByZXR1cm4gNQoKCmRlZiBtYXliZV9w
b3N0X3dhZl9ldmVudHMoYXJnczogYXJncGFyc2UuTmFtZXNwYWNlKSAtPiBOb25lOgogICAgc2l0
ZV9pZCA9IChvcy5lbnZpcm9uLmdldCgiU0lORVhJU19XQUZfU0lURV9JRCIpIG9yICIiKS5zdHJp
cCgpCiAgICBhdWRpdCA9IChvcy5lbnZpcm9uLmdldCgiU0lORVhJU19XQUZfQVVESVRfTE9HIikg
b3IgIi92YXIvbG9nL21vZHNlY19hdWRpdC5sb2ciKS5zdHJpcCgpCiAgICBpZiBub3Qgc2l0ZV9p
ZCBvciBub3QgYXJncy5hcGlfYmFzZSBvciBub3QgYXJncy50b2tlbiBvciBub3QgYXJncy5hZ2Vu
dF9pZDoKICAgICAgICByZXR1cm4KICAgIHRleHQgPSByZWFkX25ld19hdWRpdF90ZXh0KGF1ZGl0
LCBhcmdzLmFnZW50X2lkKQogICAgZXZlbnRzID0gZGVkdXBlX3dhZl9ldmVudHMocGFyc2VfbW9k
c2VjX2F1ZGl0X2V2ZW50cyh0ZXh0KSkKICAgIGlmIG5vdCBldmVudHM6CiAgICAgICAgcmV0dXJu
CiAgICBwb3N0X3dhZl9ldmVudHMoCiAgICAgICAgYXJncy5hcGlfYmFzZSwKICAgICAgICBhcmdz
LnRva2VuLAogICAgICAgIHsiYWdlbnRfaWQiOiBhcmdzLmFnZW50X2lkLCAic2l0ZV9pZCI6IHNp
dGVfaWQsICJldmVudHMiOiBldmVudHN9LAogICAgICAgIGFyZ3MudGltZW91dCwKICAgICkKCgpk
ZWYgcG9zdF9yZXN1bHRzKGFwaV9iYXNlOiBzdHIsIHRva2VuOiBzdHIsIHBheWxvYWQ6IGRpY3Rb
c3RyLCBvYmplY3RdLCB0aW1lb3V0OiBpbnQpIC0+IGludDoKICAgIHVybCA9IGFwaV9iYXNlLnJz
dHJpcCgiLyIpICsgIi9hcGkvaG9zdC9hZ2VudC9yZXN1bHRzIgogICAgZGF0YSA9IGpzb24uZHVt
cHMocGF5bG9hZCkuZW5jb2RlKCJ1dGYtOCIpCiAgICByZXEgPSB1cmxsaWIucmVxdWVzdC5SZXF1
ZXN0KAogICAgICAgIHVybCwKICAgICAgICBkYXRhPWRhdGEsCiAgICAgICAgbWV0aG9kPSJQT1NU
IiwKICAgICAgICBoZWFkZXJzPV9hZ2VudF9oZWFkZXJzKHRva2VuLCBqc29uX2JvZHk9VHJ1ZSks
CiAgICApCiAgICB0cnk6CiAgICAgICAgd2l0aCB1cmxsaWIucmVxdWVzdC51cmxvcGVuKHJlcSwg
dGltZW91dD10aW1lb3V0KSBhcyByZXNwOgogICAgICAgICAgICByZXR1cm4gaW50KGdldGF0dHIo
cmVzcCwgInN0YXR1cyIsIDIwMCkgb3IgMjAwKQogICAgZXhjZXB0IHVybGxpYi5lcnJvci5IVFRQ
RXJyb3IgYXMgZXhjOgogICAgICAgIHJldHVybiBpbnQoZXhjLmNvZGUpCgoKZGVmIHBvc3RfY29t
bWFuZF9hY2soCiAgICBhcGlfYmFzZTogc3RyLCB0b2tlbjogc3RyLCBhZ2VudF9pZDogc3RyLCBj
b21tYW5kX2lkOiBzdHIsIG9rOiBib29sLCBlcnJvcjogc3RyLCB0aW1lb3V0OiBpbnQKKSAtPiBp
bnQ6CiAgICB1cmwgPSBhcGlfYmFzZS5yc3RyaXAoIi8iKSArICIvYXBpL2hvc3QvYWdlbnQvY29t
bWFuZHMvYWNrIgogICAgcGF5bG9hZCA9IHsiY29tbWFuZF9pZCI6IGNvbW1hbmRfaWQsICJhZ2Vu
dF9pZCI6IGFnZW50X2lkLCAib2siOiBvaywgImVycm9yIjogZXJyb3Igb3IgTm9uZX0KICAgIGRh
dGEgPSBqc29uLmR1bXBzKHBheWxvYWQpLmVuY29kZSgidXRmLTgiKQogICAgcmVxID0gdXJsbGli
LnJlcXVlc3QuUmVxdWVzdCgKICAgICAgICB1cmwsCiAgICAgICAgZGF0YT1kYXRhLAogICAgICAg
IG1ldGhvZD0iUE9TVCIsCiAgICAgICAgaGVhZGVycz1fYWdlbnRfaGVhZGVycyh0b2tlbiwganNv
bl9ib2R5PVRydWUpLAogICAgKQogICAgdHJ5OgogICAgICAgIHdpdGggdXJsbGliLnJlcXVlc3Qu
dXJsb3BlbihyZXEsIHRpbWVvdXQ9dGltZW91dCkgYXMgcmVzcDoKICAgICAgICAgICAgcmV0dXJu
IGludChnZXRhdHRyKHJlc3AsICJzdGF0dXMiLCAyMDApIG9yIDIwMCkKICAgIGV4Y2VwdCB1cmxs
aWIuZXJyb3IuSFRUUEVycm9yIGFzIGV4YzoKICAgICAgICByZXR1cm4gaW50KGV4Yy5jb2RlKQog
ICAgZXhjZXB0ICh1cmxsaWIuZXJyb3IuVVJMRXJyb3IsIE9TRXJyb3IpOgogICAgICAgIHJldHVy
biA1CgoKZGVmIF9wb2xsX2xvY2tfcGF0aChhZ2VudF9pZDogc3RyKSAtPiBzdHI6CiAgICBzYWZl
ID0gcmUuc3ViKHIiW14wLTlhLWZBLUYtXSIsICJfIiwgYWdlbnRfaWQpWzo4MF0gb3IgImFnZW50
IgogICAgbG9ja19kaXIgPSBvcy5lbnZpcm9uLmdldCgiU0lORVhJU19QT0xMX0xPQ0tfRElSIiwg
Ii92YXIvbGliL3NpbmV4aXMiKQogICAgcmV0dXJuIG9zLnBhdGguam9pbihsb2NrX2RpciwgZiJo
b3N0LXByb3RlY3QtcG9sbC17c2FmZX0ubG9jayIpCgoKZGVmIHJ1bl9wb2xsKGFyZ3M6IGFyZ3Bh
cnNlLk5hbWVzcGFjZSkgLT4gaW50OgogICAgaWYgbm90IGFyZ3MuYXBpX2Jhc2Ugb3Igbm90IGFy
Z3MudG9rZW4gb3Igbm90IGFyZ3MuYWdlbnRfaWQ6CiAgICAgICAgcmV0dXJuIDQKICAgIGZldGNo
X2pvYnMoYXJncy5hcGlfYmFzZSwgYXJncy50b2tlbiwgYXJncy5hZ2VudF9pZCwgYXJncy50aW1l
b3V0KQogICAgbG9ja19wYXRoID0gX3BvbGxfbG9ja19wYXRoKGFyZ3MuYWdlbnRfaWQpCiAgICB0
cnk6CiAgICAgICAgb3MubWFrZWRpcnMob3MucGF0aC5kaXJuYW1lKGxvY2tfcGF0aCksIG1vZGU9
MG83MDAsIGV4aXN0X29rPVRydWUpCiAgICAgICAgbG9ja19mZCA9IG9zLm9wZW4obG9ja19wYXRo
LCBvcy5PX0NSRUFUIHwgb3MuT19SRFdSLCAwbzYwMCkKICAgIGV4Y2VwdCBPU0Vycm9yOgogICAg
ICAgIGxvY2tfZmQgPSBOb25lCiAgICBpZiBsb2NrX2ZkIGlzIG5vdCBOb25lOgogICAgICAgIHRy
eToKICAgICAgICAgICAgZmNudGwuZmxvY2sobG9ja19mZCwgZmNudGwuTE9DS19FWCB8IGZjbnRs
LkxPQ0tfTkIpCiAgICAgICAgZXhjZXB0IE9TRXJyb3I6CiAgICAgICAgICAgIG9zLmNsb3NlKGxv
Y2tfZmQpCiAgICAgICAgICAgIHJldHVybiAwCiAgICB0cnk6CiAgICAgICAgZGVhZGxpbmUgPSB0
aW1lLm1vbm90b25pYygpICsgOTAKICAgICAgICBmb3IgXyBpbiByYW5nZSg0MCk6CiAgICAgICAg
ICAgIG5fcmF3LCBfcmMgPSBfcnVuX3BvbGxfam9icyhhcmdzKQogICAgICAgICAgICBpZiBuX3Jh
dyA8IDUgb3IgdGltZS5tb25vdG9uaWMoKSA+PSBkZWFkbGluZToKICAgICAgICAgICAgICAgIGJy
ZWFrCiAgICAgICAgbWF5YmVfcG9zdF93YWZfZXZlbnRzKGFyZ3MpCiAgICAgICAgcmV0dXJuIDAK
ICAgIGZpbmFsbHk6CiAgICAgICAgaWYgbG9ja19mZCBpcyBub3QgTm9uZToKICAgICAgICAgICAg
dHJ5OgogICAgICAgICAgICAgICAgZmNudGwuZmxvY2sobG9ja19mZCwgZmNudGwuTE9DS19VTikK
ICAgICAgICAgICAgZXhjZXB0IE9TRXJyb3I6CiAgICAgICAgICAgICAgICBwYXNzCiAgICAgICAg
ICAgIG9zLmNsb3NlKGxvY2tfZmQpCgoKZGVmIF9ydW5fcG9sbF9qb2JzKGFyZ3M6IGFyZ3BhcnNl
Lk5hbWVzcGFjZSkgLT4gdHVwbGVbaW50LCBpbnRdOgogICAgbl9yYXcsIGpvYnMgPSBmZXRjaF9q
b2JzKGFyZ3MuYXBpX2Jhc2UsIGFyZ3MudG9rZW4sIGFyZ3MuYWdlbnRfaWQsIGFyZ3MudGltZW91
dCkKICAgIGpvYnMuc29ydChrZXk9bGFtYmRhIGo6IDAgaWYgKGouZ2V0KCJraW5kIikgb3IgIiIp
IGluICgicXVhcmFudGluZSIsICJyZXN0b3JlIikgZWxzZSAxKQogICAgd29yc3QgPSAwCiAgICBm
b3Igam9iIGluIGpvYnM6CiAgICAgICAga2luZCA9IGpvYi5nZXQoImtpbmQiKSBvciAic2NhbiIK
ICAgICAgICBpZiBraW5kID09ICJzY2FuIjoKICAgICAgICAgICAgcmMgPSBydW4oCiAgICAgICAg
ICAgICAgICBbCiAgICAgICAgICAgICAgICAgICAgInNjYW4iLAogICAgICAgICAgICAgICAgICAg
ICItLXJvb3QiLAogICAgICAgICAgICAgICAgICAgIGpvYlsicm9vdF9wYXRoIl0sCiAgICAgICAg
ICAgICAgICAgICAgIi0tc2Nhbi1pZCIsCiAgICAgICAgICAgICAgICAgICAgam9iWyJzY2FuX2lk
Il0sCiAgICAgICAgICAgICAgICAgICAgIi0tYWdlbnQtaWQiLAogICAgICAgICAgICAgICAgICAg
IGFyZ3MuYWdlbnRfaWQsCiAgICAgICAgICAgICAgICAgICAgIi0tYXBpLWJhc2UiLAogICAgICAg
ICAgICAgICAgICAgIGFyZ3MuYXBpX2Jhc2UsCiAgICAgICAgICAgICAgICAgICAgIi0tdG9rZW4i
LAogICAgICAgICAgICAgICAgICAgIGFyZ3MudG9rZW4sCiAgICAgICAgICAgICAgICAgICAgIi0t
cnVsZXMtZGlyIiwKICAgICAgICAgICAgICAgICAgICBhcmdzLnJ1bGVzX2RpciwKICAgICAgICAg
ICAgICAgICAgICAiLS10aW1lb3V0IiwKICAgICAgICAgICAgICAgICAgICBzdHIoYXJncy50aW1l
b3V0KSwKICAgICAgICAgICAgICAgIF0KICAgICAgICAgICAgKQogICAgICAgIGVsc2U6CiAgICAg
ICAgICAgIGFyZ3YgPSBbCiAgICAgICAgICAgICAgICBraW5kLAogICAgICAgICAgICAgICAgIi0t
cm9vdCIsCiAgICAgICAgICAgICAgICBqb2JbInJvb3RfcGF0aCJdLAogICAgICAgICAgICAgICAg
Ii0tcmVsLXBhdGgiLAogICAgICAgICAgICAgICAgam9iWyJyZWxfcGF0aCJdLAogICAgICAgICAg
ICAgICAgIi0tc2l0ZS1pZCIsCiAgICAgICAgICAgICAgICBqb2JbInNpdGVfaWQiXSwKICAgICAg
ICAgICAgICAgICItLWRlc3QtYmFzZW5hbWUiLAogICAgICAgICAgICAgICAgam9iWyJkZXN0X2Jh
c2VuYW1lIl0sCiAgICAgICAgICAgICAgICAiLS1xdWFyYW50aW5lLXJvb3QiLAogICAgICAgICAg
ICAgICAgYXJncy5xdWFyYW50aW5lX3Jvb3QsCiAgICAgICAgICAgIF0KICAgICAgICAgICAgcmMg
PSBydW4oYXJndikKICAgICAgICAgICAgYWNrX29rID0gcmMgPT0gMAogICAgICAgICAgICBlcnIg
PSAiIiBpZiBhY2tfb2sgZWxzZSBmImhlbHBlciBleGl0IHtyY30iCiAgICAgICAgICAgIHBvc3Rf
Y29tbWFuZF9hY2soCiAgICAgICAgICAgICAgICBhcmdzLmFwaV9iYXNlLCBhcmdzLnRva2VuLCBh
cmdzLmFnZW50X2lkLCBqb2JbImNvbW1hbmRfaWQiXSwgYWNrX29rLCBlcnIsIGFyZ3MudGltZW91
dAogICAgICAgICAgICApCiAgICAgICAgaWYgcmMgIT0gMDoKICAgICAgICAgICAgd29yc3QgPSBy
YwogICAgcmV0dXJuIG5fcmF3LCB3b3JzdAoKCmRlZiBydW4oYXJndjogbGlzdFtzdHJdIHwgTm9u
ZSA9IE5vbmUpIC0+IGludDoKICAgIGFyZ3MgPSBwYXJzZV9hcmdzKGFyZ3YpCiAgICBpZiBhcmdz
LmFjdGlvbiA9PSAicXVhcmFudGluZSI6CiAgICAgICAgcmV0dXJuIHJ1bl9xdWFyYW50aW5lKGFy
Z3MpCiAgICBpZiBhcmdzLmFjdGlvbiA9PSAicmVzdG9yZSI6CiAgICAgICAgcmV0dXJuIHJ1bl9y
ZXN0b3JlKGFyZ3MpCiAgICBpZiBhcmdzLmFjdGlvbiA9PSAicG9sbCI6CiAgICAgICAgcmV0dXJu
IHJ1bl9wb2xsKGFyZ3MpCiAgICBpZiBub3QgYXJncy5zY2FuX2lkIG9yIG5vdCBhcmdzLmFnZW50
X2lkOgogICAgICAgIHJldHVybiA0CiAgICB0cnk6CiAgICAgICAgcm9vdCA9IHZhbGlkYXRlX3Jv
b3RfcGF0aChhcmdzLnJvb3QpCiAgICBleGNlcHQgVmFsdWVFcnJvcjoKICAgICAgICByZXR1cm4g
MgogICAgaWYgbm90IG9zLnBhdGguaXNkaXIocm9vdCk6CiAgICAgICAgcmV0dXJuIDMKICAgIHBh
Y2sgPSBsb2FkX3NpZ25hdHVyZV9wYWNrKFBhdGgoYXJncy5ydWxlc19kaXIpKQogICAgZmluZGlu
Z3MgPSBzY2FuX25lZWRsZXMocm9vdCwgcGFjaykKICAgIGVuZ2luZSA9ICJ5YXJhIiBpZiB5YXJh
X2F2YWlsYWJsZSgpIGVsc2UgIm5lZWRsZXMiCiAgICBjbGFtX2hpdHMgPSBzY2FuX2NsYW0ocm9v
dCwgYXJncy50aW1lb3V0KQogICAgcGF5bG9hZCA9IHsKICAgICAgICAic2Nhbl9pZCI6IGFyZ3Mu
c2Nhbl9pZCwKICAgICAgICAiYWdlbnRfaWQiOiBhcmdzLmFnZW50X2lkLAogICAgICAgICJlbmdp
bmUiOiBlbmdpbmUsCiAgICAgICAgImZpbmRpbmdzIjogZmluZGluZ3MsCiAgICB9CiAgICBjbGFt
X3BheWxvYWQgPSB7CiAgICAgICAgInNjYW5faWQiOiBhcmdzLnNjYW5faWQsCiAgICAgICAgImFn
ZW50X2lkIjogYXJncy5hZ2VudF9pZCwKICAgICAgICAiZW5naW5lIjogImNsYW0iLAogICAgICAg
ICJmaW5kaW5ncyI6IGNsYW1faGl0cywKICAgIH0KICAgIGlmIGFyZ3MuanNvbl9vdXQ6CiAgICAg
ICAgZHVtcCA9IGRpY3QocGF5bG9hZCkKICAgICAgICBpZiBjbGFtX2hpdHM6CiAgICAgICAgICAg
IGR1bXBbImNsYW1fZmluZGluZ3MiXSA9IGNsYW1faGl0cwogICAgICAgIFBhdGgoYXJncy5qc29u
X291dCkud3JpdGVfdGV4dChqc29uLmR1bXBzKGR1bXApLCBlbmNvZGluZz0idXRmLTgiKQogICAg
aWYgYXJncy5kcnlfcnVuOgogICAgICAgIHJldHVybiAwCiAgICBpZiBub3QgYXJncy5hcGlfYmFz
ZSBvciBub3QgYXJncy50b2tlbjoKICAgICAgICByZXR1cm4gNAogICAgc3RhdHVzID0gcG9zdF9y
ZXN1bHRzKGFyZ3MuYXBpX2Jhc2UsIGFyZ3MudG9rZW4sIHBheWxvYWQsIGFyZ3MudGltZW91dCkK
ICAgIGlmIHN0YXR1cyA+PSA0MDA6CiAgICAgICAgcmV0dXJuIDUKICAgIGlmIGNsYW1faGl0czoK
ICAgICAgICBjc3RhdHVzID0gcG9zdF9yZXN1bHRzKGFyZ3MuYXBpX2Jhc2UsIGFyZ3MudG9rZW4s
IGNsYW1fcGF5bG9hZCwgYXJncy50aW1lb3V0KQogICAgICAgIGlmIGNzdGF0dXMgPj0gNDAwOgog
ICAgICAgICAgICByZXR1cm4gNQogICAgcmV0dXJuIDAKCgpkZWYgbWFpbigpIC0+IE5vbmU6CiAg
ICBuaWNlID0gc2h1dGlsLndoaWNoKCJuaWNlIikKICAgIGlmIG5pY2UgYW5kIG9zLmVudmlyb24u
Z2V0KCJTSU5FWElTX0hPU1RfU0NBTl9OSUNFIiwgIjEiKSA9PSAiMSIgYW5kICJTSU5FWElTX0hP
U1RfU0NBTl9JTk5FUiIgbm90IGluIG9zLmVudmlyb246CiAgICAgICAgZW52ID0gb3MuZW52aXJv
bi5jb3B5KCkKICAgICAgICBlbnZbIlNJTkVYSVNfSE9TVF9TQ0FOX0lOTkVSIl0gPSAiMSIKICAg
ICAgICByYWlzZSBTeXN0ZW1FeGl0KAogICAgICAgICAgICBzdWJwcm9jZXNzLmNhbGwoCiAgICAg
ICAgICAgICAgICBbbmljZSwgIi1uIiwgIjE1Iiwgc3lzLmV4ZWN1dGFibGUsIHN0cihQYXRoKF9f
ZmlsZV9fKS5yZXNvbHZlKCkpLCAqc3lzLmFyZ3ZbMTpdXSwKICAgICAgICAgICAgICAgIGVudj1l
bnYsCiAgICAgICAgICAgICkKICAgICAgICApCiAgICByYWlzZSBTeXN0ZW1FeGl0KHJ1bigpKQoK
CmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICBtYWluKCkK'
SINEXIS_B64_YAR='cnVsZSBzaW5leGlzX3BocF9ldmFsX3Bvc3QKewogICAgbWV0YToKICAgICAgICBpZCA9ICJzaW5l
eGlzLnBocC5ldmFsX3Bvc3QiCiAgICAgICAgaGl0X2NsYXNzID0gIndlYnNoZWxsIgogICAgc3Ry
aW5nczoKICAgICAgICAkYSA9ICJldmFsKCRfUE9TVCIKICAgICAgICAkYiA9ICJldmFsKCRfR0VU
IgogICAgICAgICRjID0gImV2YWwoJF9SRVFVRVNUIgogICAgY29uZGl0aW9uOgogICAgICAgIGFu
eSBvZiB0aGVtCn0KCnJ1bGUgc2luZXhpc19waHBfc3lzdGVtX2dldAp7CiAgICBtZXRhOgogICAg
ICAgIGlkID0gInNpbmV4aXMucGhwLnN5c3RlbV9nZXQiCiAgICAgICAgaGl0X2NsYXNzID0gImJh
Y2tkb29yIgogICAgc3RyaW5nczoKICAgICAgICAkYSA9ICJzeXN0ZW0oJF9HRVQiCiAgICAgICAg
JGIgPSAicGFzc3RocnUoJF9HRVQiCiAgICAgICAgJGMgPSAic2hlbGxfZXhlYygkX0dFVCIKICAg
IGNvbmRpdGlvbjoKICAgICAgICBhbnkgb2YgdGhlbQp9Cg=='
SINEXIS_B64_SVC='W1VuaXRdCkRlc2NyaXB0aW9uPVNpbmV4aXMgSG9zdCBQcm90ZWN0IG9uLWJveCBwb2xsICglaSkK
UmVxdWlyZXM9d2F6dWgtYWdlbnQuc2VydmljZQpBZnRlcj13YXp1aC1hZ2VudC5zZXJ2aWNlCiMg
U3RhcnRMaW1pdCogaXMgYSBbVW5pdF0ga2V5LiBJbiBbU2VydmljZV0gaXQgaXMgaWdub3JlZCBh
bmQgdGhlIGRlZmF1bHQgNS8xMHMgcmVtYWlucy4KU3RhcnRMaW1pdEludGVydmFsU2VjPTAKCltT
ZXJ2aWNlXQpUeXBlPW9uZXNob3QKTmljZT0xNQpUaW1lb3V0U3RhcnRTZWM9MTgwClN1Y2Nlc3NF
eGl0U3RhdHVzPTYKRW52aXJvbm1lbnRGaWxlPS0vZXRjL3NpbmV4aXMvaG9zdC1wcm90ZWN0LmVu
dgpFeGVjU3RhcnQ9L3Vzci9iaW4vcHl0aG9uMyAvdXNyL2xpYi9zaW5leGlzL2hvc3QtcHJvdGVj
dC9zaW5leGlzX2hvc3Rfc2Nhbi5weSBwb2xsIC0tYWdlbnQtaWQgJWkKVXNlcj1yb290Ck5vTmV3
UHJpdmlsZWdlcz10cnVlClByb3RlY3RTeXN0ZW09c3RyaWN0CiMgUXVhcmFudGluZSBkZXN0ICsg
YWxsb3dsaXN0ZWQgd2ViIHJvb3RzIChTMTAgamFpbCkuIFdpdGhvdXQgdGhlc2UsIG9zLnJlbmFt
ZSBmYWlscyBjbG9zZWQuCiMgTGVhZGluZyAnLScgPSBpZ25vcmUgbWlzc2luZyBwYXRoIChzeXN0
ZW1kIDIyNi9OQU1FU1BBQ0UgaWYgL3Nydi93d3cgYWJzZW50KS4KUmVhZFdyaXRlUGF0aHM9L3Zh
ci9saWIvc2luZXhpcyAvdmFyL3d3dyAtL3Nydi93d3cgL2hvbWUKIyBMYWIvY3VzdG9tZXIgV0FG
IGluZ2VzdDogaGVscGVyIHRhaWxzIE1vZFNlY3VyaXR5IEpTT04gYXVkaXQgKG5vIHJlcXVlc3Qg
Ym9kaWVzKS4KIyBMZWFkaW5nICctJyA9IGlnbm9yZSBtaXNzaW5nIHBhdGguIG5naW54L2xpYm1v
ZHNlY3VyaXR5IG9mdGVuIHdyaXRlIHVuZGVyIC92YXIvbG9nL25naW54Ly4KUmVhZE9ubHlQYXRo
cz0tL3Zhci9sb2cvbW9kc2VjX2F1ZGl0LmxvZyAtL3Zhci9sb2cvbmdpbngvbW9kc2VjX2F1ZGl0
X2xvZyAtL3Zhci9sb2cvbmdpbngvbW9kc2VjX2F1ZGl0LmxvZwpQcml2YXRlVG1wPXRydWUKUHJp
dmF0ZURldmljZXM9dHJ1ZQpQcm90ZWN0S2VybmVsVHVuYWJsZXM9dHJ1ZQpQcm90ZWN0Q29udHJv
bEdyb3Vwcz10cnVlClJlc3RyaWN0U1VJRFNHSUQ9dHJ1ZQpMb2NrUGVyc29uYWxpdHk9dHJ1ZQpS
ZXN0cmljdFJlYWx0aW1lPXRydWUKUmVzdHJpY3RBZGRyZXNzRmFtaWxpZXM9QUZfVU5JWCBBRl9J
TkVUIEFGX0lORVQ2ClN5c3RlbUNhbGxBcmNoaXRlY3R1cmVzPW5hdGl2ZQoKW0luc3RhbGxdCldh
bnRlZEJ5PW11bHRpLXVzZXIudGFyZ2V0Cg==
'
SINEXIS_B64_TMR='W1VuaXRdCkRlc2NyaXB0aW9uPVNpbmV4aXMgSG9zdCBQcm90ZWN0IHBvbGwgKCVpKQpSZXF1aXJl
cz13YXp1aC1hZ2VudC5zZXJ2aWNlCgpbVGltZXJdCk9uQm9vdFNlYz0ybWluCk9uVW5pdEFjdGl2
ZVNlYz01bWluClBlcnNpc3RlbnQ9dHJ1ZQoKW0luc3RhbGxdCldhbnRlZEJ5PXRpbWVycy50YXJn
ZXQK'


while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent-id)
      AGENT_ID="${2:-}"
      shift 2
      ;;
    --token-file)
      TOKEN_FILE="${2:-}"
      MENU=0
      DO_HELPER=1
      shift 2
      ;;
    --api-base)
      API_BASE="${2:-}"
      shift 2
      ;;
    --deb)
      DEB_PATH="${2:-}"
      FROM_TREE=0
      MENU=0
      DO_HELPER=1
      shift 2
      ;;
    --from-tree)
      FROM_TREE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --interactive)
      INTERACTIVE=1
      MENU=0
      DO_HELPER=1
      shift
      ;;
    --no-timer)
      ENABLE_TIMER=0
      shift
      ;;
    --skip-wazuh-check)
      SKIP_WAZUH_CHECK=1
      shift
      ;;
    --install-wazuh-agent)
      DO_WAZUH=1
      MENU=0
      shift
      ;;
    --configure-host-protect)
      DO_HELPER=1
      MENU=0
      shift
      ;;
    --manager-host)
      MANAGER_HOST="${2:-}"
      shift 2
      ;;
    --status)
      DO_STATUS=1
      MENU=0
      shift
      ;;
    --force)
      FORCE_SETUP=1
      shift
      ;;
    --write-waf-snippet)
      DO_WAF_SNIPPET=1
      MENU=0
      shift
      ;;
    --apply-waf-vhost)
      WAF_VHOST_PATH="${2:-}"
      [[ -n "$WAF_VHOST_PATH" ]] || die "missing --apply-waf-vhost PATH"
      DO_WAF_APPLY=1
      MENU=0
      shift 2
      ;;
    --waf-snippet-path)
      WAF_SNIPPET_PATH="${2:-}"
      [[ -n "$WAF_SNIPPET_PATH" ]] || die "missing --waf-snippet-path"
      shift 2
      ;;
    --waf-site-id)
      WAF_SITE_ID="${2:-}"
      [[ -n "$WAF_SITE_ID" ]] || die "missing --waf-site-id UUID"
      shift 2
      ;;
    --waf-audit-log)
      WAF_AUDIT_LOG="${2:-}"
      [[ -n "$WAF_AUDIT_LOG" ]] || die "missing --waf-audit-log PATH"
      WAF_AUDIT_LOG_CLI=1
      shift 2
      ;;
    --configure-waf-ingest)
      DO_WAF_INGEST=1
      MENU=0
      shift
      ;;
    --poll-once)
      DO_WAF_POLL=1
      MENU=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

if [[ "$MENU" -eq 1 ]]; then
  show_menu
fi

if [[ "$DO_STATUS" -eq 1 ]]; then
  print_setup_status
  if [[ "$DO_WAZUH" -eq 0 && "$DO_HELPER" -eq 0 && "$DO_WAF_SNIPPET" -eq 0 && "$DO_WAF_APPLY" -eq 0 && "$DO_WAF_INGEST" -eq 0 && "$DO_WAF_POLL" -eq 0 ]]; then
    exit 0
  fi
fi

if [[ "$DO_WAZUH" -eq 1 ]]; then
  install_wazuh_agent
fi
if [[ "$DO_HELPER" -eq 1 ]]; then
  configure_host_protect
fi
if [[ "$DO_WAF_APPLY" -eq 1 ]]; then
  apply_waf_vhost
elif [[ "$DO_WAF_SNIPPET" -eq 1 ]]; then
  write_waf_snippet
fi
if [[ "$DO_WAF_INGEST" -eq 1 ]]; then
  configure_waf_ingest
elif [[ "$DO_WAF_POLL" -eq 1 ]]; then
  poll_helper_once
fi
if [[ "$DO_WAZUH" -eq 0 && "$DO_HELPER" -eq 0 && "$DO_WAF_SNIPPET" -eq 0 && "$DO_WAF_APPLY" -eq 0 && "$DO_WAF_INGEST" -eq 0 && "$DO_WAF_POLL" -eq 0 ]]; then
  usage
  exit 1
fi
exit 0
