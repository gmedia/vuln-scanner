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
  --poll-once              Start sinexis-host-protect@AGENT.service once (no journal dump)

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
  install -m 644 "$SCRIPT_DIR/systemd/sinexis-host-watch@.service" "$dest_unit/sinexis-host-watch@.service"
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
  write_b64_file "$UNIT_DST/sinexis-host-watch@.service" 644 "$SINEXIS_B64_WATCH"
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

poll_helper_once() {
  load_agent_id_from_env || true
  is_uuid "${AGENT_ID:-}" || die "missing agent UUID (env or --agent-id) to poll"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "dry-run: systemctl start sinexis-host-protect@${AGENT_ID}.service (no journal dump)"
    return 0
  fi
  need_root
  command -v systemctl >/dev/null 2>&1 || die "systemctl not found"
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
SecRule REQUEST_URI "@beginsWith /xmlrpc.php" "id:1001,phase:1,t:none,deny,status:403,msg:\'sinexis.xmlrpc\'"
SecRule ARGS "@rx (?i)(union\\s+select|or\\s+1=1)" "id:1002,phase:2,t:none,deny,status:403,msg:\'sinexis.sqli\'"
SecRule REQUEST_URI "@rx \\.\\./" "id:1003,phase:1,t:none,deny,status:403,msg:\'sinexis.path.traversal\'"
SecRule REQUEST_URI "@beginsWith /wp-login.php" "id:1005,phase:1,t:none,deny,status:403,msg:\'sinexis.wplogin.payload\',chain"
SecRule REQUEST_METHOD "@streq POST" "t:none,chain"
SecRule ARGS "@rx (?i)(union\\s+select|or\\s+1=1|eval\\s*\\(|base64_decode\\s*\\()" "t:none"
SecRule REQUEST_URI "@rx (?i)(eval\\s*\\(|base64_decode\\s*\\()" "id:1006,phase:1,t:none,deny,status:403,msg:\'sinexis.php.wrapper\'"
SecRule REQUEST_URI "@beginsWith /wp-cron.php" "id:1007,phase:1,t:none,deny,status:403,msg:\'sinexis.wpcron\'"
SecRule REQUEST_URI "@rx (?i)(php://|data://)" "id:1008,phase:1,t:none,deny,status:403,msg:\'sinexis.uri.wrapper\'"
SecRule REQUEST_URI "@rx (?i)/\\.(env|git)(/|$)" "id:1009,phase:1,t:none,deny,status:403,msg:\'sinexis.dotfile\'"
SecRule REQUEST_URI "@rx (?i)/phpinfo\\.php" "id:1010,phase:1,t:none,deny,status:403,msg:\'sinexis.phpinfo\'"
SecRule REQUEST_URI "@rx (?i)/wp-config\\.php" "id:1011,phase:1,t:none,deny,status:403,msg:\'sinexis.wpconfig\'"
SecRule REQUEST_URI "@rx (?i)/\\.htaccess" "id:1012,phase:1,t:none,deny,status:403,msg:\'sinexis.htaccess\'"
SecRule REQUEST_URI "@rx (?i)/composer\\.json" "id:1013,phase:1,t:none,deny,status:403,msg:\'sinexis.composerjson\'"
SecRule REQUEST_URI "@rx (?i)\\.(sql|sql\\.gz)$" "id:1014,phase:1,t:none,deny,status:403,msg:\'sinexis.sqldump\'"
SecRule REQUEST_URI "@rx (?i)/uploads/.+\\.(php|phtml|phar)([/?]|$)" "id:1015,phase:1,t:none,deny,status:403,msg:\'sinexis.php.upload\'"
SecRule REQUEST_METHOD "@rx (?i)^(PUT|DELETE|PATCH|TRACE|CONNECT)$" "id:1016,phase:1,t:none,deny,status:403,msg:\'sinexis.method.unusual\'"
SecRule REQUEST_HEADERS:X-Forwarded-For "@rx (^|,\\s*)127\\.0\\.0\\.1" "id:1017,phase:1,t:none,deny,status:403,msg:\'sinexis.xff.loopback\'"
SecRule REQUEST_URI "@rx (?i)/phpmyadmin" "id:1018,phase:1,t:none,deny,status:403,msg:\'sinexis.phpmyadmin\'"
SecRule REQUEST_URI "@rx (?i)/cgi-bin/" "id:1019,phase:1,t:none,deny,status:403,msg:\'sinexis.cgibin\'"
SecRule REQUEST_HEADERS:User-Agent "@rx \(\)\s*\{" "id:1020,phase:1,t:none,deny,status:403,msg:\'sinexis.ua.shellshock\'"
SecRule REQUEST_URI "@rx (?i)/wp-content/debug\\.log" "id:1021,phase:1,t:none,deny,status:403,msg:\'sinexis.debug.log\'"
SecRule REQUEST_URI "@rx (?i)/server-status" "id:1022,phase:1,t:none,deny,status:403,msg:\'sinexis.server.status\'"
SecRule REQUEST_URI "@rx (?i)/vendor/phpunit" "id:1023,phase:1,t:none,deny,status:403,msg:\'sinexis.phpunit\'"
SecRule REQUEST_URI "@rx (?i)/timthumb\\.php" "id:1024,phase:1,t:none,deny,status:403,msg:\'sinexis.timthumb\'"
SecRule REQUEST_URI "@rx (?i)/actuator(/|$)" "id:1025,phase:1,t:none,deny,status:403,msg:\'sinexis.actuator\'"
SecRule REQUEST_URI "@rx (?i)/telescope(/|$)" "id:1026,phase:1,t:none,deny,status:403,msg:\'sinexis.telescope\'"
SecRule REQUEST_URI "@rx (?i)/\\.DS_Store" "id:1027,phase:1,t:none,deny,status:403,msg:\'sinexis.dsstore\'"
SecRule REQUEST_URI "@rx (?i)/wlwmanifest\\.xml" "id:1028,phase:1,t:none,deny,status:403,msg:\'sinexis.wlwmanifest\'"
';
modsecurity_rules '
SecRule REQUEST_URI "@rx (?i)/wp-json/wp/v2/users" "id:1029,phase:1,t:none,deny,status:403,msg:\'sinexis.wpjson.users\'"
SecRule REQUEST_URI "@rx (?i)/adminer\\.php" "id:1030,phase:1,t:none,deny,status:403,msg:\'sinexis.adminer\'"
SecRule REQUEST_URI "@rx (?i)/elmah\\.axd" "id:1031,phase:1,t:none,deny,status:403,msg:\'sinexis.elmah\'"
SecRule REQUEST_URI "@rx (?i)/manager/html" "id:1032,phase:1,t:none,deny,status:403,msg:\'sinexis.tomcat.manager\'"
SecRule REQUEST_URI "@rx (?i)/solr/admin" "id:1033,phase:1,t:none,deny,status:403,msg:\'sinexis.solr.admin\'"
SecRule REQUEST_URI "@rx (?i)/jenkins(/|$)" "id:1034,phase:1,t:none,deny,status:403,msg:\'sinexis.jenkins\'"
SecRule REQUEST_URI "@rx (?i)/jmx-console" "id:1035,phase:1,t:none,deny,status:403,msg:\'sinexis.jmx.console\'"
SecRule REQUEST_URI "@rx (?i)/trace\\.axd" "id:1036,phase:1,t:none,deny,status:403,msg:\'sinexis.trace.axd\'"
SecRule REQUEST_URI "@rx (?i)/\\.svn/entries" "id:1037,phase:1,t:none,deny,status:403,msg:\'sinexis.svn.entries\'"
SecRule REQUEST_URI "@rx (?i)/invoker/JMXInvokerServlet" "id:1038,phase:1,t:none,deny,status:403,msg:\'sinexis.jmx.invoker\'"
SecRule REQUEST_URI "@rx (?i)/web\\.config" "id:1039,phase:1,t:none,deny,status:403,msg:\'sinexis.web.config\'"
SecRule REQUEST_URI "@rx (?i)/server-info" "id:1040,phase:1,t:none,deny,status:403,msg:\'sinexis.server.info\'"
SecRule REQUEST_URI "@rx (?i)/axis2/axis2-admin" "id:1041,phase:1,t:none,deny,status:403,msg:\'sinexis.axis2.admin\'"
SecRule REQUEST_URI "@rx (?i)/console(/|$)" "id:1042,phase:1,t:none,deny,status:403,msg:\'sinexis.weblogic.console\'"
SecRule REQUEST_URI "@rx (?i)/CFIDE/administrator" "id:1043,phase:1,t:none,deny,status:403,msg:\'sinexis.cfide.admin\'"
SecRule REQUEST_URI "@rx (?i)/_profiler(/|$)" "id:1044,phase:1,t:none,deny,status:403,msg:\'sinexis.symfony.profiler\'"
SecRule REQUEST_URI "@rx (?i)/crossdomain\\.xml" "id:1045,phase:1,t:none,deny,status:403,msg:\'sinexis.crossdomain\'"
SecRule REQUEST_URI "@rx (?i)/clientaccesspolicy\\.xml" "id:1046,phase:1,t:none,deny,status:403,msg:\'sinexis.clientaccesspolicy\'"
SecRule REQUEST_URI "@rx (?i)/debug/default/view" "id:1047,phase:1,t:none,deny,status:403,msg:\'sinexis.django.debug\'"
SecRule REQUEST_URI "@rx (?i)/actuator/heapdump" "id:1048,phase:1,t:none,deny,status:403,msg:\'sinexis.actuator.heapdump\'"
SecRule REQUEST_URI "@rx (?i)/elmah\\.axd" "id:1049,phase:1,t:none,deny,status:403,msg:\'sinexis.elmah\'"
SecRule REQUEST_URI "@rx (?i)/trace\\.axd" "id:1050,phase:1,t:none,deny,status:403,msg:\'sinexis.trace.axd\'"
SecRule REQUEST_URI "@rx (?i)/\\.hg/store" "id:1051,phase:1,t:none,deny,status:403,msg:\'sinexis.hg.store\'"
SecRule REQUEST_URI "@rx (?i)/\\.bzr/branch" "id:1052,phase:1,t:none,deny,status:403,msg:\'sinexis.bzr.branch\'"
SecRule REQUEST_URI "@rx (?i)/web\\.config\\.bak" "id:1053,phase:1,t:none,deny,status:403,msg:\'sinexis.webconfig.bak\'"
SecRule REQUEST_URI "@rx (?i)/backup\\.zip" "id:1054,phase:1,t:none,deny,status:403,msg:\'sinexis.backup.zip\'"
SecRule REQUEST_URI "@rx (?i)/wp-config\\.php\\.bak" "id:1055,phase:1,t:none,deny,status:403,msg:\'sinexis.wpconfig.bak\'"
SecRule REQUEST_URI "@rx (?i)/pma(/|$)" "id:1056,phase:1,t:none,deny,status:403,msg:\'sinexis.pma\'"
SecRule REQUEST_URI "@rx (?i)/myadmin(/|$)" "id:1057,phase:1,t:none,deny,status:403,msg:\'sinexis.myadmin\'"
SecRule REQUEST_URI "@rx (?i)/administrator(/|$)" "id:1058,phase:1,t:none,deny,status:403,msg:\'sinexis.joomla.admin\'"
';
modsecurity_rules '
SecRule REQUEST_URI "@rx (?i)/user/login" "id:1059,phase:1,t:none,deny,status:403,msg:\'sinexis.drupal.login\'"
SecRule REQUEST_URI "@rx (?i)/__debug__/" "id:1060,phase:1,t:none,deny,status:403,msg:\'sinexis.flask.debug\'"
SecRule REQUEST_URI "@rx (?i)/rails/info/properties" "id:1061,phase:1,t:none,deny,status:403,msg:\'sinexis.rails.info\'"
SecRule REQUEST_URI "@rx (?i)/_ignition" "id:1062,phase:1,t:none,deny,status:403,msg:\'sinexis.ignition\'"
SecRule REQUEST_URI "@rx (?i)/horizon(/|$)" "id:1063,phase:1,t:none,deny,status:403,msg:\'sinexis.horizon\'"
SecRule REQUEST_URI "@rx (?i)/nova(/|$)" "id:1064,phase:1,t:none,deny,status:403,msg:\'sinexis.nova\'"
SecRule REQUEST_URI "@rx (?i)/jolokia" "id:1065,phase:1,t:none,deny,status:403,msg:\'sinexis.jolokia\'"
SecRule REQUEST_URI "@rx (?i)/hawtio" "id:1066,phase:1,t:none,deny,status:403,msg:\'sinexis.hawtio\'"
SecRule REQUEST_URI "@rx (?i)/web-console" "id:1067,phase:1,t:none,deny,status:403,msg:\'sinexis.web.console\'"
SecRule REQUEST_URI "@rx (?i)/\\.aws/credentials" "id:1068,phase:1,t:none,deny,status:403,msg:\'sinexis.aws.credentials\'"
SecRule REQUEST_URI "@rx (?i)/id_rsa" "id:1069,phase:1,t:none,deny,status:403,msg:\'sinexis.id.rsa\'"
SecRule REQUEST_URI "@rx (?i)/\\.ssh/" "id:1070,phase:1,t:none,deny,status:403,msg:\'sinexis.dotssh\'"
SecRule REQUEST_URI "@rx (?i)/aspnet_client/" "id:1071,phase:1,t:none,deny,status:403,msg:\'sinexis.aspnet.client\'"
SecRule REQUEST_URI "@rx (?i)/php\\.ini" "id:1072,phase:1,t:none,deny,status:403,msg:\'sinexis.php.ini\'"
SecRule REQUEST_URI "@rx (?i)/config\\.php\\.bak" "id:1073,phase:1,t:none,deny,status:403,msg:\'sinexis.config.bak\'"
SecRule REQUEST_URI "@rx (?i)/backup\\.tar\\.gz" "id:1074,phase:1,t:none,deny,status:403,msg:\'sinexis.backup.tgz\'"
SecRule REQUEST_URI "@rx (?i)/sftp-config\\.json" "id:1075,phase:1,t:none,deny,status:403,msg:\'sinexis.sftp.config\'"
SecRule REQUEST_URI "@rx (?i)/Thumbs\\.db" "id:1076,phase:1,t:none,deny,status:403,msg:\'sinexis.thumbs.db\'"
SecRule REQUEST_URI "@rx (?i)/CVS/Root" "id:1077,phase:1,t:none,deny,status:403,msg:\'sinexis.cvs.root\'"
SecRule REQUEST_URI "@rx (?i)/WEB-INF/web\\.xml" "id:1078,phase:1,t:none,deny,status:403,msg:\'sinexis.webinf.webxml\'"
SecRule REQUEST_URI "@rx (?i)/META-INF/context\\.xml" "id:1079,phase:1,t:none,deny,status:403,msg:\'sinexis.metainf.context\'"
SecRule REQUEST_URI "@rx (?i)/struts2-rest-showcase" "id:1080,phase:1,t:none,deny,status:403,msg:\'sinexis.struts.showcase\'"
SecRule REQUEST_URI "@rx (?i)/resin-admin" "id:1081,phase:1,t:none,deny,status:403,msg:\'sinexis.resin.admin\'"
SecRule REQUEST_URI "@rx (?i)/_debugbar" "id:1082,phase:1,t:none,deny,status:403,msg:\'sinexis.debugbar\'"
SecRule REQUEST_URI "@rx (?i)/phpminiadmin" "id:1083,phase:1,t:none,deny,status:403,msg:\'sinexis.phpminiadmin\'"
SecRule REQUEST_URI "@rx (?i)/sqlbuddy" "id:1084,phase:1,t:none,deny,status:403,msg:\'sinexis.sqlbuddy\'"
SecRule REQUEST_URI "@rx (?i)/docker-compose\\.yml" "id:1085,phase:1,t:none,deny,status:403,msg:\'sinexis.docker.compose\'"
SecRule REQUEST_URI "@rx (?i)/\\.dockerignore" "id:1086,phase:1,t:none,deny,status:403,msg:\'sinexis.dockerignore\'"
SecRule REQUEST_URI "@rx (?i)/id_dsa" "id:1087,phase:1,t:none,deny,status:403,msg:\'sinexis.id.dsa\'"
SecRule REQUEST_URI "@rx (?i)/authorized_keys" "id:1088,phase:1,t:none,deny,status:403,msg:\'sinexis.authorized.keys\'"
';
modsecurity_rules '
SecRule REQUEST_URI "@rx (?i)/wp-config\\.php\\.old" "id:1089,phase:1,t:none,deny,status:403,msg:\'sinexis.wpconfig.old\'"
SecRule REQUEST_URI "@rx (?i)/settings\\.py" "id:1090,phase:1,t:none,deny,status:403,msg:\'sinexis.settings.py\'"
SecRule REQUEST_URI "@rx (?i)/application\\.yml" "id:1091,phase:1,t:none,deny,status:403,msg:\'sinexis.application.yml\'"
SecRule REQUEST_URI "@rx (?i)/localsettings\\.php" "id:1092,phase:1,t:none,deny,status:403,msg:\'sinexis.localsettings\'"
SecRule REQUEST_URI "@rx (?i)/sites/default/settings\\.php" "id:1093,phase:1,t:none,deny,status:403,msg:\'sinexis.drupal.settings\'"
SecRule REQUEST_URI "@rx (?i)/\\.hgignore" "id:1094,phase:1,t:none,deny,status:403,msg:\'sinexis.hgignore\'"
SecRule REQUEST_URI "@rx (?i)/glassfish" "id:1095,phase:1,t:none,deny,status:403,msg:\'sinexis.glassfish\'"
SecRule REQUEST_URI "@rx (?i)/solr/select" "id:1096,phase:1,t:none,deny,status:403,msg:\'sinexis.solr.select\'"
SecRule REQUEST_URI "@rx (?i)/host-manager/html" "id:1097,phase:1,t:none,deny,status:403,msg:\'sinexis.tomcat.hostmanager\'"
SecRule REQUEST_URI "@rx (?i)/jmxrmi" "id:1098,phase:1,t:none,deny,status:403,msg:\'sinexis.jmxrmi\'"
SecRule REQUEST_URI "@rx (?i)/manager/status" "id:1099,phase:1,t:none,deny,status:403,msg:\'sinexis.tomcat.status\'"
SecRule REQUEST_URI "@rx (?i)/nginx_status" "id:1100,phase:1,t:none,deny,status:403,msg:\'sinexis.nginx.status\'"
SecRule REQUEST_URI "@rx (?i)/fckeditor" "id:1101,phase:1,t:none,deny,status:403,msg:\'sinexis.fckeditor\'"
SecRule REQUEST_URI "@rx (?i)/ckfinder" "id:1102,phase:1,t:none,deny,status:403,msg:\'sinexis.ckfinder\'"
SecRule REQUEST_URI "@rx (?i)/tiny_mce(/|$|[?])" "id:1103,phase:1,t:none,deny,status:403,msg:\'sinexis.tinymce\'"
SecRule REQUEST_URI "@rx (?i)/xmlrpc\\.php\\.bak" "id:1104,phase:1,t:none,deny,status:403,msg:\'sinexis.xmlrpc.bak\'"
SecRule REQUEST_URI "@rx (?i)/config\\.json($|[?])" "id:1105,phase:1,t:none,deny,status:403,msg:\'sinexis.config.json\'"
SecRule REQUEST_URI "@rx (?i)/secrets\\.yml" "id:1106,phase:1,t:none,deny,status:403,msg:\'sinexis.secrets.yml\'"
SecRule REQUEST_URI "@rx (?i)/database\\.yml" "id:1107,phase:1,t:none,deny,status:403,msg:\'sinexis.database.yml\'"
SecRule REQUEST_URI "@rx (?i)/\\.npmrc" "id:1108,phase:1,t:none,deny,status:403,msg:\'sinexis.npmrc\'"
SecRule REQUEST_URI "@rx (?i)/\\.yarnrc" "id:1109,phase:1,t:none,deny,status:403,msg:\'sinexis.yarnrc\'"
SecRule REQUEST_URI "@rx (?i)/package-lock\\.json" "id:1110,phase:1,t:none,deny,status:403,msg:\'sinexis.packagelock\'"
SecRule REQUEST_URI "@rx (?i)/yarn\\.lock" "id:1111,phase:1,t:none,deny,status:403,msg:\'sinexis.yarn.lock\'"
SecRule REQUEST_URI "@rx (?i)/Gemfile($|[/?])" "id:1112,phase:1,t:none,deny,status:403,msg:\'sinexis.gemfile\'"
SecRule REQUEST_URI "@rx (?i)/Procfile" "id:1113,phase:1,t:none,deny,status:403,msg:\'sinexis.procfile\'"
SecRule REQUEST_URI "@rx (?i)/\\.travis\\.yml" "id:1114,phase:1,t:none,deny,status:403,msg:\'sinexis.travis\'"
SecRule REQUEST_URI "@rx (?i)/\\.gitlab-ci\\.yml" "id:1115,phase:1,t:none,deny,status:403,msg:\'sinexis.gitlabci\'"
SecRule REQUEST_URI "@rx (?i)/bitbucket-pipelines\\.yml" "id:1116,phase:1,t:none,deny,status:403,msg:\'sinexis.bitbucket.pipelines\'"
SecRule REQUEST_URI "@rx (?i)/error_log($|[/?])" "id:1117,phase:1,t:none,deny,status:403,msg:\'sinexis.error.log\'"
SecRule REQUEST_URI "@rx (?i)/php_error\\.log" "id:1118,phase:1,t:none,deny,status:403,msg:\'sinexis.php.errorlog\'"
';
modsecurity_rules '
SecRule REQUEST_URI "@rx (?i)/storage/logs/laravel\\.log" "id:1119,phase:1,t:none,deny,status:403,msg:\'sinexis.laravel.log\'"
SecRule REQUEST_URI "@rx (?i)/webmail(/|$)" "id:1120,phase:1,t:none,deny,status:403,msg:\'sinexis.webmail\'"
SecRule REQUEST_URI "@rx (?i)/roundcube(/|$|[?])" "id:1121,phase:1,t:none,deny,status:403,msg:\'sinexis.roundcube\'"
SecRule REQUEST_URI "@rx (?i)/squirrelmail(/|$|[?])" "id:1122,phase:1,t:none,deny,status:403,msg:\'sinexis.squirrelmail\'"
SecRule REQUEST_URI "@rx (?i)/zabbix(/|$)" "id:1123,phase:1,t:none,deny,status:403,msg:\'sinexis.zabbix\'"
SecRule REQUEST_URI "@rx (?i)/nagios(/|$)" "id:1124,phase:1,t:none,deny,status:403,msg:\'sinexis.nagios\'"
SecRule REQUEST_URI "@rx (?i)/grafana(/|$)" "id:1125,phase:1,t:none,deny,status:403,msg:\'sinexis.grafana\'"
SecRule REQUEST_URI "@rx (?i)/prometheus(/|$)" "id:1126,phase:1,t:none,deny,status:403,msg:\'sinexis.prometheus\'"
SecRule REQUEST_URI "@rx (?i)/kibana(/|$)" "id:1127,phase:1,t:none,deny,status:403,msg:\'sinexis.kibana\'"
SecRule REQUEST_URI "@rx (?i)/_cat/indices" "id:1128,phase:1,t:none,deny,status:403,msg:\'sinexis.es.cat\'"
SecRule REQUEST_URI "@rx (?i)/minio(/|$)" "id:1129,phase:1,t:none,deny,status:403,msg:\'sinexis.minio\'"
SecRule REQUEST_URI "@rx (?i)/portainer" "id:1130,phase:1,t:none,deny,status:403,msg:\'sinexis.portainer\'"
SecRule REQUEST_URI "@rx (?i)/consul(/|$)" "id:1131,phase:1,t:none,deny,status:403,msg:\'sinexis.consul\'"
SecRule REQUEST_URI "@rx (?i)/vault/ui" "id:1132,phase:1,t:none,deny,status:403,msg:\'sinexis.vault.ui\'"
SecRule REQUEST_URI "@rx (?i)/\\.kube/config" "id:1133,phase:1,t:none,deny,status:403,msg:\'sinexis.kube.config\'"
SecRule REQUEST_URI "@rx (?i)/\\.docker/config\\.json" "id:1134,phase:1,t:none,deny,status:403,msg:\'sinexis.docker.config\'"
';
modsecurity_rules '
SecRule REQUEST_URI "@rx (?i)/wp-content/uploads/dump\\.sql" "id:1135,phase:1,t:none,deny,status:403,msg:\'sinexis.wp.dump\'"
SecRule REQUEST_URI "@rx (?i)/backup\\.sql\\.gz" "id:1136,phase:1,t:none,deny,status:403,msg:\'sinexis.backup.sqlgz\'"
SecRule REQUEST_URI "@rx (?i)/phpmyadmin/setup" "id:1137,phase:1,t:none,deny,status:403,msg:\'sinexis.pma.setup\'"
SecRule REQUEST_URI "@rx (?i)/setup\\.php($|[?])" "id:1138,phase:1,t:none,deny,status:403,msg:\'sinexis.setup.php\'"
SecRule REQUEST_URI "@rx (?i)/install\\.php($|[?])" "id:1139,phase:1,t:none,deny,status:403,msg:\'sinexis.install.php\'"
SecRule REQUEST_URI "@rx (?i)/solr/update" "id:1140,phase:1,t:none,deny,status:403,msg:\'sinexis.solr.update\'"
SecRule REQUEST_URI "@rx (?i)/\\.env\\.local" "id:1141,phase:1,t:none,deny,status:403,msg:\'sinexis.env.local\'"
SecRule REQUEST_URI "@rx (?i)/web\\.config($|[/?])" "id:1142,phase:1,t:none,deny,status:403,msg:\'sinexis.web.config\'"
SecRule REQUEST_URI "@rx (?i)/configuration\\.php($|[?])" "id:1143,phase:1,t:none,deny,status:403,msg:\'sinexis.joomla.config\'"
SecRule REQUEST_URI "@rx (?i)/\\.env\\.production" "id:1144,phase:1,t:none,deny,status:403,msg:\'sinexis.env.production\'"
SecRule REQUEST_URI "@rx (?i)/wp-config\\.php\\.save" "id:1145,phase:1,t:none,deny,status:403,msg:\'sinexis.wp.config.save\'"
SecRule REQUEST_URI "@rx (?i)/app/etc/local\\.xml" "id:1146,phase:1,t:none,deny,status:403,msg:\'sinexis.mage.localxml\'"
SecRule REQUEST_URI "@rx (?i)/boaform/admin/formLogin" "id:1147,phase:1,t:none,deny,status:403,msg:\'sinexis.boaform.login\'"
SecRule REQUEST_URI "@rx (?i)/GponForm/diag_Form" "id:1148,phase:1,t:none,deny,status:403,msg:\'sinexis.gpon.diag\'"
SecRule REQUEST_URI "@rx (?i)/\\.env\\.bak($|[/?])" "id:1149,phase:1,t:none,deny,status:403,msg:\'sinexis.env.bak\'"
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
aW1wb3J0IGhhc2hsaWIKaW1wb3J0IGpzb24KaW1wb3J0IG9zCmltcG9ydCByZQppbXBvcnQgc2Vs
ZWN0CmltcG9ydCBzaHV0aWwKaW1wb3J0IHN1YnByb2Nlc3MKaW1wb3J0IHN5cwppbXBvcnQgdGlt
ZQppbXBvcnQgdXJsbGliLmVycm9yCmltcG9ydCB1cmxsaWIucGFyc2UKaW1wb3J0IHVybGxpYi5y
ZXF1ZXN0CmZyb20gcGF0aGxpYiBpbXBvcnQgUGF0aAoKQUxMT1dFRF9QUkVGSVhFUyA9ICgiL3Zh
ci93d3ciLCAiL3Nydi93d3ciLCAiL2hvbWUiKQpfU0tJUF9ESVJTID0geyIuZ2l0IiwgIm5vZGVf
bW9kdWxlcyIsICJfX3B5Y2FjaGVfXyIsICIucXVhcmFudGluZSJ9Cl9NQVhfRklMRVMgPSA1MDAK
X01BWF9CWVRFUyA9IDFfMDQ4XzU3NgpfUlVMRV9SRSA9IHJlLmNvbXBpbGUociJydWxlXHMrKFx3
KylccypceyguKj8pXG5cfSIsIHJlLkRPVEFMTCkKX0lOR0VTVF9ISVRfQ0xBU1MgPSB7CiAgICAi
d2Vic2hlbGwiOiAid2Vic2hlbGwiLAogICAgImJhY2tkb29yIjogImJhY2tkb29yIiwKICAgICJt
YWx3YXJlIjogIm1hbHdhcmUiLAogICAgInNwYW1fc2VvIjogInNwYW1fc2VvIiwKICAgICJzdXNw
aWNpb3VzIjogInN1c3BpY2lvdXMiLAogICAgImFkbWluZXIiOiAic3VzcGljaW91cyIsCiAgICAi
ZHJvcHBlciI6ICJtYWx3YXJlIiwKfQpfWUFSQV9DSFVOSyA9IDQwCl9NRVRBX0lEID0gcmUuY29t
cGlsZShyJ2lkXHMqPVxzKiIoW14iXSspIicpCl9NRVRBX0NMQVNTID0gcmUuY29tcGlsZShyJ2hp
dF9jbGFzc1xzKj1ccyoiKFteIl0rKSInKQpfU1RSID0gcmUuY29tcGlsZShyJ1wkXHcrXHMqPVxz
KiIoKD86XFwufFteIlxcXSkqKSInKQpfUEFUSF9DSEFSUyA9IHJlLmNvbXBpbGUociJeW1x3Li9c
LV0rJCIpCl9OVUwgPSAiXHgwMCIKX1dBVENIX01USU1FX1NXRUVQX1NFQ09ORFMgPSAzMC4wCl9X
QVRDSF9NVElNRV9NQVhfREVQVEhfRklMRVMgPSBfTUFYX0ZJTEVTCl9XQVRDSF9JTk9USUZZX0VW
RU5UUyA9ICJjbG9zZV93cml0ZSxtb3ZlZF90byxjcmVhdGUiCgpIRVJFID0gUGF0aChfX2ZpbGVf
XykucmVzb2x2ZSgpLnBhcmVudApERUZBVUxUX1JVTEVTID0gSEVSRSAvICJydWxlcyIKVVNFUl9B
R0VOVCA9ICJTaW5leGlzSG9zdFByb3RlY3QvMSIKCgpkZWYgX2FnZW50X2hlYWRlcnModG9rZW46
IHN0ciwgKiwganNvbl9ib2R5OiBib29sID0gRmFsc2UpIC0+IGRpY3Rbc3RyLCBzdHJdOgogICAg
aGVhZGVycyA9IHsiVXNlci1BZ2VudCI6IFVTRVJfQUdFTlQsICJYLUhvc3QtQWdlbnQtVG9rZW4i
OiB0b2tlbn0KICAgIGlmIGpzb25fYm9keToKICAgICAgICBoZWFkZXJzWyJDb250ZW50LVR5cGUi
XSA9ICJhcHBsaWNhdGlvbi9qc29uIgogICAgcmV0dXJuIGhlYWRlcnMKCgpkZWYgdmFsaWRhdGVf
cm9vdF9wYXRoKHJhdzogc3RyKSAtPiBzdHI6CiAgICBwYXRoID0gKHJhdyBvciAiIikuc3RyaXAo
KQogICAgaWYgbm90IHBhdGggb3IgX05VTCBpbiBwYXRoOgogICAgICAgIHJhaXNlIFZhbHVlRXJy
b3IoIkludmFsaWQgcm9vdCBwYXRoIikKICAgIGlmIG5vdCBwYXRoLnN0YXJ0c3dpdGgoIi8iKToK
ICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJyb290X3BhdGggbXVzdCBiZSBhYnNvbHV0ZSIpCiAg
ICBpZiAiLi4iIGluIHBhdGg6CiAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigicGF0aCB0cmF2ZXJz
YWwgaXMgbm90IGFsbG93ZWQiKQogICAgaWYgbm90IF9QQVRIX0NIQVJTLm1hdGNoKHBhdGgpOgog
ICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoInJvb3RfcGF0aCBjb250YWlucyBpbnZhbGlkIGNoYXJh
Y3RlcnMiKQogICAgbm9ybWFsaXplZCA9IG9zLnBhdGgubm9ybXBhdGgocGF0aCkKICAgIGlmICIu
LiIgaW4gbm9ybWFsaXplZC5zcGxpdCgiLyIpOgogICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoInBh
dGggdHJhdmVyc2FsIGlzIG5vdCBhbGxvd2VkIikKICAgIGlmIG5vdCBhbnkobm9ybWFsaXplZCA9
PSBwIG9yIG5vcm1hbGl6ZWQuc3RhcnRzd2l0aChwICsgIi8iKSBmb3IgcCBpbiBBTExPV0VEX1BS
RUZJWEVTKToKICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJyb290X3BhdGggaXMgb3V0c2lkZSB0
aGUgYWxsb3dsaXN0IikKICAgIHJldHVybiBub3JtYWxpemVkCgoKZGVmIGxvYWRfc2lnbmF0dXJl
X3BhY2socnVsZXNfZGlyOiBQYXRoKSAtPiBsaXN0W2RpY3Rbc3RyLCBvYmplY3RdXToKICAgIHBh
Y2s6IGxpc3RbZGljdFtzdHIsIG9iamVjdF1dID0gW10KICAgIGlmIG5vdCBydWxlc19kaXIuaXNf
ZGlyKCk6CiAgICAgICAgcmV0dXJuIHBhY2sKICAgIGZvciBwYXRoIGluIHNvcnRlZChydWxlc19k
aXIuZ2xvYigiKi55YXIiKSk6CiAgICAgICAgdGV4dCA9IHBhdGgucmVhZF90ZXh0KGVuY29kaW5n
PSJ1dGYtOCIpCiAgICAgICAgZm9yIGlkZW50LCBib2R5IGluIF9SVUxFX1JFLmZpbmRhbGwodGV4
dCk6CiAgICAgICAgICAgIGlkX20gPSBfTUVUQV9JRC5zZWFyY2goYm9keSkKICAgICAgICAgICAg
Y2xhc3NfbSA9IF9NRVRBX0NMQVNTLnNlYXJjaChib2R5KQogICAgICAgICAgICBpZiBpZF9tIGlz
IE5vbmU6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBuZWVkbGVzID0gW2J5
dGVzKF91bmVzY2FwZShzKSwgInV0Zi04IikgZm9yIHMgaW4gX1NUUi5maW5kYWxsKGJvZHkpXQog
ICAgICAgICAgICBpZiBub3QgbmVlZGxlczoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAg
ICAgICAgIHJhd19jbGFzcyA9IGNsYXNzX20uZ3JvdXAoMSkgaWYgY2xhc3NfbSBpcyBub3QgTm9u
ZSBlbHNlICJzdXNwaWNpb3VzIgogICAgICAgICAgICBwYWNrLmFwcGVuZCgKICAgICAgICAgICAg
ICAgIHsKICAgICAgICAgICAgICAgICAgICAiaWRlbnQiOiBpZGVudCwKICAgICAgICAgICAgICAg
ICAgICAicnVsZV9pZCI6IGlkX20uZ3JvdXAoMSksCiAgICAgICAgICAgICAgICAgICAgImhpdF9j
bGFzcyI6IF9JTkdFU1RfSElUX0NMQVNTLmdldChyYXdfY2xhc3MsICJzdXNwaWNpb3VzIiksCiAg
ICAgICAgICAgICAgICAgICAgIm5lZWRsZXMiOiBuZWVkbGVzLAogICAgICAgICAgICAgICAgfQog
ICAgICAgICAgICApCiAgICByZXR1cm4gcGFjawoKCmRlZiBfdW5lc2NhcGUocmF3OiBzdHIpIC0+
IHN0cjoKICAgIHJldHVybiByYXcucmVwbGFjZSgnXFwiJywgJyInKS5yZXBsYWNlKCJcXFxcIiwg
IlxcIikKCgpkZWYgX3NoYTI1Nl9maWxlKHBhdGg6IHN0cikgLT4gc3RyOgogICAgaCA9IGhhc2hs
aWIuc2hhMjU2KCkKICAgIHdpdGggb3BlbihwYXRoLCAicmIiKSBhcyBmaDoKICAgICAgICB3aGls
ZSBUcnVlOgogICAgICAgICAgICBjaHVuayA9IGZoLnJlYWQoNjU1MzYpCiAgICAgICAgICAgIGlm
IG5vdCBjaHVuazoKICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgICAgIGgudXBkYXRlKGNo
dW5rKQogICAgcmV0dXJuIGguaGV4ZGlnZXN0KCkKCgpkZWYgc2Nhbl9uZWVkbGVzKHJvb3Q6IHN0
ciwgcGFjazogbGlzdFtkaWN0W3N0ciwgb2JqZWN0XV0pIC0+IGxpc3RbZGljdFtzdHIsIHN0cl1d
OgogICAgaGl0czogbGlzdFtkaWN0W3N0ciwgc3RyXV0gPSBbXQogICAgc2Vlbjogc2V0W3R1cGxl
W3N0ciwgc3RyXV0gPSBzZXQoKQogICAgbmZpbGVzID0gMAogICAgZm9yIGRpcnBhdGgsIGRpcm5h
bWVzLCBmaWxlbmFtZXMgaW4gb3Mud2Fsayhyb290LCBmb2xsb3dsaW5rcz1GYWxzZSk6CiAgICAg
ICAgZGlybmFtZXNbOl0gPSBbZCBmb3IgZCBpbiBkaXJuYW1lcyBpZiBkIG5vdCBpbiBfU0tJUF9E
SVJTIGFuZCAiLi4iIG5vdCBpbiBkXQogICAgICAgIGZvciBuYW1lIGluIGZpbGVuYW1lczoKICAg
ICAgICAgICAgbmZpbGVzICs9IDEKICAgICAgICAgICAgaWYgbmZpbGVzID4gX01BWF9GSUxFUzoK
ICAgICAgICAgICAgICAgIHJldHVybiBoaXRzCiAgICAgICAgICAgIGZ1bGwgPSBvcy5wYXRoLmpv
aW4oZGlycGF0aCwgbmFtZSkKICAgICAgICAgICAgcmVsID0gb3MucGF0aC5yZWxwYXRoKGZ1bGws
IHJvb3QpLnJlcGxhY2Uob3Muc2VwLCAiLyIpCiAgICAgICAgICAgIGlmICIuLiIgaW4gcmVsLnNw
bGl0KCIvIikgb3IgX05VTCBpbiByZWw6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAg
ICAgICB0cnk6CiAgICAgICAgICAgICAgICBzaXplID0gb3MucGF0aC5nZXRzaXplKGZ1bGwpCiAg
ICAgICAgICAgIGV4Y2VwdCBPU0Vycm9yOgogICAgICAgICAgICAgICAgY29udGludWUKICAgICAg
ICAgICAgaWYgc2l6ZSA+IF9NQVhfQllURVMgb3Igc2l6ZSA9PSAwOgogICAgICAgICAgICAgICAg
Y29udGludWUKICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAgd2l0aCBvcGVuKGZ1bGws
ICJyYiIpIGFzIGZoOgogICAgICAgICAgICAgICAgICAgIGJsb2IgPSBmaC5yZWFkKF9NQVhfQllU
RVMpCiAgICAgICAgICAgIGV4Y2VwdCBPU0Vycm9yOgogICAgICAgICAgICAgICAgY29udGludWUK
ICAgICAgICAgICAgZGlnZXN0ID0gaGFzaGxpYi5zaGEyNTYoYmxvYikuaGV4ZGlnZXN0KCkgaWYg
c2l6ZSA8PSBfTUFYX0JZVEVTIGVsc2UgX3NoYTI1Nl9maWxlKGZ1bGwpCiAgICAgICAgICAgIGZv
ciBzcGVjIGluIHBhY2s6CiAgICAgICAgICAgICAgICBuZWVkbGVzID0gc3BlY1sibmVlZGxlcyJd
CiAgICAgICAgICAgICAgICBpZiBub3QgaXNpbnN0YW5jZShuZWVkbGVzLCBsaXN0KToKICAgICAg
ICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICAgICAgaWYgYW55KG4gaW4gYmxvYiBm
b3IgbiBpbiBuZWVkbGVzIGlmIGlzaW5zdGFuY2UobiwgKGJ5dGVzLCBieXRlYXJyYXkpKSk6CiAg
ICAgICAgICAgICAgICAgICAga2V5ID0gKHJlbCwgc3RyKHNwZWNbInJ1bGVfaWQiXSkpCiAgICAg
ICAgICAgICAgICAgICAgaWYga2V5IGluIHNlZW46CiAgICAgICAgICAgICAgICAgICAgICAgIGNv
bnRpbnVlCiAgICAgICAgICAgICAgICAgICAgc2Vlbi5hZGQoa2V5KQogICAgICAgICAgICAgICAg
ICAgIGhpdHMuYXBwZW5kKAogICAgICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAg
ICAgICAgICAgICAgICAicmVsX3BhdGgiOiByZWwsCiAgICAgICAgICAgICAgICAgICAgICAgICAg
ICAiY2xhc3MiOiBzdHIoc3BlY1siaGl0X2NsYXNzIl0pLAogICAgICAgICAgICAgICAgICAgICAg
ICAgICAgInJ1bGVfaWQiOiBzdHIoc3BlY1sicnVsZV9pZCJdKSwKICAgICAgICAgICAgICAgICAg
ICAgICAgICAgICJzaGEyNTYiOiBkaWdlc3QsCiAgICAgICAgICAgICAgICAgICAgICAgIH0KICAg
ICAgICAgICAgICAgICAgICApCiAgICByZXR1cm4gaGl0cwoKCmRlZiB5YXJhX2F2YWlsYWJsZSgp
IC0+IGJvb2w6CiAgICByZXR1cm4gc2h1dGlsLndoaWNoKCJ5YXJhIikgaXMgbm90IE5vbmUKCgpk
ZWYgX2l0ZXJfc2Nhbl9maWxlcyhyb290OiBzdHIpIC0+IGxpc3Rbc3RyXToKICAgIGZpbGVzOiBs
aXN0W3N0cl0gPSBbXQogICAgbmZpbGVzID0gMAogICAgZm9yIGRpcnBhdGgsIGRpcm5hbWVzLCBm
aWxlbmFtZXMgaW4gb3Mud2Fsayhyb290LCBmb2xsb3dsaW5rcz1GYWxzZSk6CiAgICAgICAgZGly
bmFtZXNbOl0gPSBbZCBmb3IgZCBpbiBkaXJuYW1lcyBpZiBkIG5vdCBpbiBfU0tJUF9ESVJTIGFu
ZCAiLi4iIG5vdCBpbiBkXQogICAgICAgIGZvciBuYW1lIGluIGZpbGVuYW1lczoKICAgICAgICAg
ICAgbmZpbGVzICs9IDEKICAgICAgICAgICAgaWYgbmZpbGVzID4gX01BWF9GSUxFUzoKICAgICAg
ICAgICAgICAgIHJldHVybiBmaWxlcwogICAgICAgICAgICBmdWxsID0gb3MucGF0aC5qb2luKGRp
cnBhdGgsIG5hbWUpCiAgICAgICAgICAgIHJlbCA9IG9zLnBhdGgucmVscGF0aChmdWxsLCByb290
KS5yZXBsYWNlKG9zLnNlcCwgIi8iKQogICAgICAgICAgICBpZiAiLi4iIGluIHJlbC5zcGxpdCgi
LyIpIG9yIF9OVUwgaW4gcmVsOgogICAgICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAg
dHJ5OgogICAgICAgICAgICAgICAgc2l6ZSA9IG9zLnBhdGguZ2V0c2l6ZShmdWxsKQogICAgICAg
ICAgICBleGNlcHQgT1NFcnJvcjoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAg
IGlmIHNpemUgPiBfTUFYX0JZVEVTIG9yIHNpemUgPT0gMDoKICAgICAgICAgICAgICAgIGNvbnRp
bnVlCiAgICAgICAgICAgIGZpbGVzLmFwcGVuZChmdWxsKQogICAgcmV0dXJuIGZpbGVzCgoKZGVm
IF95YXJhX2NvbXBpbGVfb2socGFja19wYXRoOiBQYXRoLCB0aW1lb3V0OiBpbnQpIC0+IGJvb2w6
CiAgICBiaW5hcnkgPSBzaHV0aWwud2hpY2goInlhcmEiKQogICAgaWYgYmluYXJ5IGlzIE5vbmUg
b3Igbm90IHBhY2tfcGF0aC5pc19maWxlKCkgb3IgdGltZW91dCA8PSAwOgogICAgICAgIHJldHVy
biBGYWxzZQogICAgdHJ5OgogICAgICAgIHByb2MgPSBzdWJwcm9jZXNzLnJ1bigKICAgICAgICAg
ICAgW2JpbmFyeSwgIi13Iiwgc3RyKHBhY2tfcGF0aCksICIvZGV2L251bGwiXSwKICAgICAgICAg
ICAgY2FwdHVyZV9vdXRwdXQ9VHJ1ZSwKICAgICAgICAgICAgdGV4dD1UcnVlLAogICAgICAgICAg
ICB0aW1lb3V0PW1pbih0aW1lb3V0LCAxNSksCiAgICAgICAgICAgIGNoZWNrPUZhbHNlLAogICAg
ICAgICkKICAgIGV4Y2VwdCAoT1NFcnJvciwgc3VicHJvY2Vzcy5UaW1lb3V0RXhwaXJlZCk6CiAg
ICAgICAgcmV0dXJuIEZhbHNlCiAgICBlcnIgPSAocHJvYy5zdGRlcnIgb3IgIiIpLmxvd2VyKCkK
ICAgIGlmICJlcnJvcjoiIGluIGVyciBvciBwcm9jLnJldHVybmNvZGUgbm90IGluICgwLCAxKToK
ICAgICAgICByZXR1cm4gRmFsc2UKICAgIHJldHVybiBUcnVlCgoKZGVmIHNjYW5feWFyYV9jbGko
CiAgICByb290OiBzdHIsCiAgICBwYWNrX3BhdGg6IFBhdGgsCiAgICBpZGVudF9tYXA6IGRpY3Rb
c3RyLCB0dXBsZVtzdHIsIHN0cl1dLAogICAgdGltZW91dDogaW50LAopIC0+IGxpc3RbZGljdFtz
dHIsIHN0cl1dIHwgTm9uZToKICAgIGJpbmFyeSA9IHNodXRpbC53aGljaCgieWFyYSIpCiAgICBp
ZiBiaW5hcnkgaXMgTm9uZSBvciB0aW1lb3V0IDw9IDA6CiAgICAgICAgcmV0dXJuIE5vbmUKICAg
IGZpbGVzID0gX2l0ZXJfc2Nhbl9maWxlcyhyb290KQogICAgaGl0czogbGlzdFtkaWN0W3N0ciwg
c3RyXV0gPSBbXQogICAgc2Vlbjogc2V0W3R1cGxlW3N0ciwgc3RyXV0gPSBzZXQoKQogICAgZGVh
ZGxpbmUgPSB0aW1lLm1vbm90b25pYygpICsgdGltZW91dAogICAgaWYgbm90IGZpbGVzOgogICAg
ICAgIHJldHVybiBbXQogICAgZm9yIGkgaW4gcmFuZ2UoMCwgbGVuKGZpbGVzKSwgX1lBUkFfQ0hV
TkspOgogICAgICAgIHJlbWFpbiA9IGRlYWRsaW5lIC0gdGltZS5tb25vdG9uaWMoKQogICAgICAg
IGlmIHJlbWFpbiA8PSAwOgogICAgICAgICAgICByZXR1cm4gTm9uZQogICAgICAgIGNodW5rID0g
ZmlsZXNbaSA6IGkgKyBfWUFSQV9DSFVOS10KICAgICAgICB0cnk6CiAgICAgICAgICAgIHByb2Mg
PSBzdWJwcm9jZXNzLnJ1bigKICAgICAgICAgICAgICAgIFtiaW5hcnksICItdyIsIHN0cihwYWNr
X3BhdGgpLCAqY2h1bmtdLAogICAgICAgICAgICAgICAgY2FwdHVyZV9vdXRwdXQ9VHJ1ZSwKICAg
ICAgICAgICAgICAgIHRleHQ9VHJ1ZSwKICAgICAgICAgICAgICAgIHRpbWVvdXQ9cmVtYWluLAog
ICAgICAgICAgICAgICAgY2hlY2s9RmFsc2UsCiAgICAgICAgICAgICkKICAgICAgICBleGNlcHQg
KE9TRXJyb3IsIHN1YnByb2Nlc3MuVGltZW91dEV4cGlyZWQpOgogICAgICAgICAgICByZXR1cm4g
Tm9uZQogICAgICAgIGVyciA9IChwcm9jLnN0ZGVyciBvciAiIikubG93ZXIoKQogICAgICAgIGlm
ICJlcnJvcjoiIGluIGVycjoKICAgICAgICAgICAgcmV0dXJuIE5vbmUKICAgICAgICBpZiBwcm9j
LnJldHVybmNvZGUgbm90IGluICgwLCAxKToKICAgICAgICAgICAgcmV0dXJuIE5vbmUKICAgICAg
ICBmb3IgbGluZSBpbiAocHJvYy5zdGRvdXQgb3IgIiIpLnNwbGl0bGluZXMoKToKICAgICAgICAg
ICAgaWRlbnQsIHNlcCwgcGF0aCA9IGxpbmUucGFydGl0aW9uKCIgIikKICAgICAgICAgICAgaWYg
bm90IHNlcCBvciBub3QgaWRlbnQgb3Igbm90IHBhdGg6CiAgICAgICAgICAgICAgICBjb250aW51
ZQogICAgICAgICAgICBwYXRoID0gcGF0aC5zdHJpcCgpCiAgICAgICAgICAgIG1hcHBlZCA9IGlk
ZW50X21hcC5nZXQoaWRlbnQpCiAgICAgICAgICAgIGlmIG1hcHBlZCBpcyBOb25lOgogICAgICAg
ICAgICAgICAgY29udGludWUKICAgICAgICAgICAgcnVsZV9pZCwgaGl0X2NsYXNzID0gbWFwcGVk
CiAgICAgICAgICAgIGlmIG5vdCBwYXRoLnN0YXJ0c3dpdGgocm9vdCArIG9zLnNlcCkgYW5kIHBh
dGggIT0gcm9vdDoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIHJlbCA9IG9z
LnBhdGgucmVscGF0aChwYXRoLCByb290KS5yZXBsYWNlKG9zLnNlcCwgIi8iKQogICAgICAgICAg
ICBpZiAiLi4iIGluIHJlbC5zcGxpdCgiLyIpIG9yIF9OVUwgaW4gcmVsOgogICAgICAgICAgICAg
ICAgY29udGludWUKICAgICAgICAgICAga2V5ID0gKHJlbCwgcnVsZV9pZCkKICAgICAgICAgICAg
aWYga2V5IGluIHNlZW46CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBzZWVu
LmFkZChrZXkpCiAgICAgICAgICAgIGl0ZW0gPSB7CiAgICAgICAgICAgICAgICAicmVsX3BhdGgi
OiByZWwsCiAgICAgICAgICAgICAgICAiY2xhc3MiOiBoaXRfY2xhc3MsCiAgICAgICAgICAgICAg
ICAicnVsZV9pZCI6IHJ1bGVfaWQsCiAgICAgICAgICAgIH0KICAgICAgICAgICAgdHJ5OgogICAg
ICAgICAgICAgICAgaXRlbVsic2hhMjU2Il0gPSBfc2hhMjU2X2ZpbGUocGF0aCkKICAgICAgICAg
ICAgZXhjZXB0IE9TRXJyb3I6CiAgICAgICAgICAgICAgICBwYXNzCiAgICAgICAgICAgIGhpdHMu
YXBwZW5kKGl0ZW0pCiAgICByZXR1cm4gaGl0cwoKCmRlZiBjbGFtX2JpbmFyeSgpIC0+IHN0ciB8
IE5vbmU6CiAgICByZXR1cm4gc2h1dGlsLndoaWNoKCJjbGFtZHNjYW4iKSBvciBzaHV0aWwud2hp
Y2goImNsYW1zY2FuIikKCgpkZWYgX2NsYW1fZGFlbW9uX3VucmVhY2hhYmxlKHByb2M6IHN1YnBy
b2Nlc3MuQ29tcGxldGVkUHJvY2Vzc1tzdHJdKSAtPiBib29sOgogICAgaWYgcHJvYy5yZXR1cm5j
b2RlID09IDI6CiAgICAgICAgcmV0dXJuIFRydWUKICAgIGVyciA9IChwcm9jLnN0ZGVyciBvciAi
IikubG93ZXIoKQogICAgcmV0dXJuICJjYW4ndCBjb25uZWN0IiBpbiBlcnIgb3IgImNhbm5vdCBj
b25uZWN0IiBpbiBlcnIgb3IgInVuYWJsZSB0byBjb25uZWN0IiBpbiBlcnIKCgpkZWYgX3J1bl9j
bGFtX2NtZChjbWQ6IGxpc3Rbc3RyXSwgdGltZW91dDogaW50KSAtPiBzdWJwcm9jZXNzLkNvbXBs
ZXRlZFByb2Nlc3Nbc3RyXSB8IE5vbmU6CiAgICBpZiB0aW1lb3V0IDw9IDA6CiAgICAgICAgcmV0
dXJuIE5vbmUKICAgIHRyeToKICAgICAgICByZXR1cm4gc3VicHJvY2Vzcy5ydW4oCiAgICAgICAg
ICAgIGNtZCwKICAgICAgICAgICAgY2FwdHVyZV9vdXRwdXQ9VHJ1ZSwKICAgICAgICAgICAgdGV4
dD1UcnVlLAogICAgICAgICAgICB0aW1lb3V0PXRpbWVvdXQsCiAgICAgICAgICAgIGNoZWNrPUZh
bHNlLAogICAgICAgICkKICAgIGV4Y2VwdCAoT1NFcnJvciwgc3VicHJvY2Vzcy5UaW1lb3V0RXhw
aXJlZCk6CiAgICAgICAgcmV0dXJuIE5vbmUKCgpkZWYgc2Nhbl9jbGFtKHJvb3Q6IHN0ciwgdGlt
ZW91dDogaW50ID0gMTIwKSAtPiBsaXN0W2RpY3Rbc3RyLCBzdHJdXToKICAgIGJpbmFyeSA9IGNs
YW1fYmluYXJ5KCkKICAgIGlmIGJpbmFyeSBpcyBOb25lIG9yIHRpbWVvdXQgPD0gMDoKICAgICAg
ICByZXR1cm4gW10KICAgIGNtZCA9IFtiaW5hcnksICItLW5vLXN1bW1hcnkiLCAiLXIiLCByb290
XQogICAgaWYgb3MucGF0aC5iYXNlbmFtZShiaW5hcnkpID09ICJjbGFtZHNjYW4iOgogICAgICAg
IGNtZC5pbnNlcnQoMSwgIi0tZmRwYXNzIikKICAgIHByb2MgPSBfcnVuX2NsYW1fY21kKGNtZCwg
dGltZW91dCkKICAgIGlmIHByb2MgaXMgTm9uZToKICAgICAgICByZXR1cm4gW10KICAgIGlmIG9z
LnBhdGguYmFzZW5hbWUoYmluYXJ5KSA9PSAiY2xhbWRzY2FuIiBhbmQgX2NsYW1fZGFlbW9uX3Vu
cmVhY2hhYmxlKHByb2MpOgogICAgICAgIGZhbGxiYWNrID0gc2h1dGlsLndoaWNoKCJjbGFtc2Nh
biIpCiAgICAgICAgaWYgZmFsbGJhY2sgaXMgTm9uZToKICAgICAgICAgICAgcmV0dXJuIFtdCiAg
ICAgICAgcHJvYyA9IF9ydW5fY2xhbV9jbWQoW2ZhbGxiYWNrLCAiLS1uby1zdW1tYXJ5IiwgIi1y
Iiwgcm9vdF0sIHRpbWVvdXQpCiAgICAgICAgaWYgcHJvYyBpcyBOb25lOgogICAgICAgICAgICBy
ZXR1cm4gW10KICAgIGhpdHM6IGxpc3RbZGljdFtzdHIsIHN0cl1dID0gW10KICAgIHNlZW46IHNl
dFtzdHJdID0gc2V0KCkKICAgIGZvciBsaW5lIGluIChwcm9jLnN0ZG91dCBvciAiIikuc3BsaXRs
aW5lcygpOgogICAgICAgIGlmIG5vdCBsaW5lLmVuZHN3aXRoKCIgRk9VTkQiKToKICAgICAgICAg
ICAgY29udGludWUKICAgICAgICBsZWZ0LCBfLCBzaWcgPSBsaW5lLnJwYXJ0aXRpb24oIjoiKQog
ICAgICAgIHBhdGggPSBsZWZ0LnN0cmlwKCkKICAgICAgICBydWxlID0gc2lnLnN0cmlwKCkucmVt
b3Zlc3VmZml4KCIgRk9VTkQiKS5zdHJpcCgpCiAgICAgICAgaWYgbm90IHBhdGguc3RhcnRzd2l0
aChyb290ICsgb3Muc2VwKSBhbmQgcGF0aCAhPSByb290OgogICAgICAgICAgICBjb250aW51ZQog
ICAgICAgIHJlbCA9IG9zLnBhdGgucmVscGF0aChwYXRoLCByb290KS5yZXBsYWNlKG9zLnNlcCwg
Ii8iKQogICAgICAgIGlmICIuLiIgaW4gcmVsLnNwbGl0KCIvIikgb3IgX05VTCBpbiByZWw6CiAg
ICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgaWYgcmVsIGluIHNlZW46CiAgICAgICAgICAgIGNv
bnRpbnVlCiAgICAgICAgc2Vlbi5hZGQocmVsKQogICAgICAgIHNhZmVfcnVsZSA9IHJlLnN1Yihy
IlteXHcuXC1dKyIsICJfIiwgcnVsZSlbOjgwXSBvciAiaGl0IgogICAgICAgIGRpZ2VzdCA9ICIi
CiAgICAgICAgdHJ5OgogICAgICAgICAgICBkaWdlc3QgPSBfc2hhMjU2X2ZpbGUocGF0aCkKICAg
ICAgICBleGNlcHQgT1NFcnJvcjoKICAgICAgICAgICAgZGlnZXN0ID0gIiIKICAgICAgICBpdGVt
ID0gewogICAgICAgICAgICAicmVsX3BhdGgiOiByZWwsCiAgICAgICAgICAgICJjbGFzcyI6ICJt
YWx3YXJlIiwKICAgICAgICAgICAgInJ1bGVfaWQiOiBmImNsYW0ue3NhZmVfcnVsZX0iLAogICAg
ICAgIH0KICAgICAgICBpZiBkaWdlc3Q6CiAgICAgICAgICAgIGl0ZW1bInNoYTI1NiJdID0gZGln
ZXN0CiAgICAgICAgaGl0cy5hcHBlbmQoaXRlbSkKICAgIHJldHVybiBoaXRzCgoKZGVmIHBhcnNl
X2FyZ3MoYXJndjogbGlzdFtzdHJdIHwgTm9uZSA9IE5vbmUpIC0+IGFyZ3BhcnNlLk5hbWVzcGFj
ZToKICAgIHAgPSBhcmdwYXJzZS5Bcmd1bWVudFBhcnNlcihkZXNjcmlwdGlvbj0iU2luZXhpcyBI
b3N0IFByb3RlY3Qgb24tYm94IHNjYW4gaGVscGVyIikKICAgIHAuYWRkX2FyZ3VtZW50KAogICAg
ICAgICJhY3Rpb24iLAogICAgICAgIG5hcmdzPSI/IiwKICAgICAgICBkZWZhdWx0PSJzY2FuIiwK
ICAgICAgICBjaG9pY2VzPSgic2NhbiIsICJwb2xsIiwgIndhdGNoIiwgInF1YXJhbnRpbmUiLCAi
cmVzdG9yZSIpLAogICAgKQogICAgcC5hZGRfYXJndW1lbnQoIi0tcm9vdCIsIGRlZmF1bHQ9IiIs
IGhlbHA9IkFic29sdXRlIHdlYiByb290IG9uIHRoaXMgVk0iKQogICAgcC5hZGRfYXJndW1lbnQo
Ii0tc2Nhbi1pZCIsIGRlZmF1bHQ9IiIpCiAgICBwLmFkZF9hcmd1bWVudCgiLS1hZ2VudC1pZCIs
IGRlZmF1bHQ9b3MuZW52aXJvbi5nZXQoIlNJTkVYSVNfQUdFTlRfSUQiLCAiIikpCiAgICBwLmFk
ZF9hcmd1bWVudCgiLS1yZWwtcGF0aCIsIGRlZmF1bHQ9IiIpCiAgICBwLmFkZF9hcmd1bWVudCgi
LS1zaXRlLWlkIiwgZGVmYXVsdD0iIikKICAgIHAuYWRkX2FyZ3VtZW50KCItLWhpdC1pZCIsIGRl
ZmF1bHQ9IiIpCiAgICBwLmFkZF9hcmd1bWVudCgiLS1kZXN0LWJhc2VuYW1lIiwgZGVmYXVsdD0i
IikKICAgIHAuYWRkX2FyZ3VtZW50KAogICAgICAgICItLWRlYm91bmNlIiwKICAgICAgICB0eXBl
PWludCwKICAgICAgICBkZWZhdWx0PWludChvcy5lbnZpcm9uLmdldCgiU0lORVhJU19XQVRDSF9E
RUJPVU5DRSIsICI2MCIpKSwKICAgICAgICBoZWxwPSJRdWlldCB3aW5kb3cgaW4gc2Vjb25kcyBi
ZWZvcmUgYSBzaXRlIGZpcmVzIChkZWZhdWx0IDYwKSIsCiAgICApCiAgICBwLmFkZF9hcmd1bWVu
dCgKICAgICAgICAiLS1jb29sZG93biIsCiAgICAgICAgdHlwZT1pbnQsCiAgICAgICAgZGVmYXVs
dD1pbnQob3MuZW52aXJvbi5nZXQoIlNJTkVYSVNfV0FUQ0hfQ09PTERPV04iLCAiOTAwIikpLAog
ICAgICAgIGhlbHA9IlBlci1zaXRlIGNvb2xkb3duIGluIHNlY29uZHMgYmV0d2VlbiByZXF1ZXN0
LXNjYW4gY2FsbHMgKGRlZmF1bHQgOTAwKSIsCiAgICApCiAgICBwLmFkZF9hcmd1bWVudCgKICAg
ICAgICAiLS1yb290cyIsCiAgICAgICAgZGVmYXVsdD1vcy5lbnZpcm9uLmdldCgiU0lORVhJU19X
QVRDSF9ST09UUyIsICIiKSwKICAgICAgICBoZWxwPSJPcHRpb25hbCBjb2xvbi1zZXBhcmF0ZWQg
YWxsb3dsaXN0ZWQgcm9vdHMgdG8gd2F0Y2giLAogICAgKQogICAgcC5hZGRfYXJndW1lbnQoCiAg
ICAgICAgIi0tc3RhdGUtZGlyIiwKICAgICAgICBkZWZhdWx0PW9zLmVudmlyb24uZ2V0KCJTSU5F
WElTX1dBVENIX1NUQVRFX0RJUiIsICIvdmFyL2xpYi9zaW5leGlzL3dhdGNoIiksCiAgICAgICAg
aGVscD0iRGlyZWN0b3J5IGZvciB3YXRjaCBjb29sZG93bi9tdGltZSBzdGF0ZSBmaWxlcyIsCiAg
ICApCiAgICBwLmFkZF9hcmd1bWVudCgKICAgICAgICAiLS13YXRjaC1vbmNlIiwKICAgICAgICBh
Y3Rpb249InN0b3JlX3RydWUiLAogICAgICAgIGhlbHA9IlJ1biBvbmUgZGV0ZWN0aW9uIHBhc3Mg
YW5kIGV4aXQgKHVzZWQgYnkgdGVzdHMvdGltZXIpIiwKICAgICkKICAgIHAuYWRkX2FyZ3VtZW50
KAogICAgICAgICItLXF1YXJhbnRpbmUtcm9vdCIsCiAgICAgICAgZGVmYXVsdD1vcy5lbnZpcm9u
LmdldCgiU0lORVhJU19RVUFSQU5USU5FX1JPT1QiLCAiL3Zhci9saWIvc2luZXhpcy9xdWFyYW50
aW5lIiksCiAgICApCiAgICBwLmFkZF9hcmd1bWVudCgiLS1hcGktYmFzZSIsIGRlZmF1bHQ9b3Mu
ZW52aXJvbi5nZXQoIlNJTkVYSVNfQVBJX0JBU0UiLCAiIikpCiAgICBwLmFkZF9hcmd1bWVudCgi
LS10b2tlbiIsIGRlZmF1bHQ9b3MuZW52aXJvbi5nZXQoIlNJTkVYSVNfSE9TVF9BR0VOVF9UT0tF
TiIsICIiKSkKICAgIHAuYWRkX2FyZ3VtZW50KCItLXJ1bGVzLWRpciIsIGRlZmF1bHQ9c3RyKERF
RkFVTFRfUlVMRVMpKQogICAgcC5hZGRfYXJndW1lbnQoIi0tdGltZW91dCIsIHR5cGU9aW50LCBk
ZWZhdWx0PTEyMCkKICAgIHAuYWRkX2FyZ3VtZW50KCItLWRyeS1ydW4iLCBhY3Rpb249InN0b3Jl
X3RydWUiLCBoZWxwPSJTY2FuIG9ubHk7IGRvIG5vdCBQT1NUIikKICAgIHAuYWRkX2FyZ3VtZW50
KCItLWpzb24tb3V0IiwgZGVmYXVsdD0iIiwgaGVscD0iV3JpdGUgZmluZGluZ3MgSlNPTiB0byBw
YXRoIikKICAgIHJldHVybiBwLnBhcnNlX2FyZ3MoYXJndikKCgpkZWYgX2phaWxfcmVsKHJvb3Q6
IHN0ciwgcmVsOiBzdHIpIC0+IHN0cjoKICAgIHJlbCA9IChyZWwgb3IgIiIpLnN0cmlwKCkubHN0
cmlwKCIvIikKICAgIGlmIG5vdCByZWwgb3IgX05VTCBpbiByZWwgb3IgIi4uIiBpbiByZWwuc3Bs
aXQoIi8iKToKICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJiYWQgcmVsIikKICAgIGpvaW5lZCA9
IG9zLnBhdGgubm9ybXBhdGgob3MucGF0aC5qb2luKHJvb3QsIHJlbCkpCiAgICBpZiBqb2luZWQg
IT0gcm9vdCBhbmQgbm90IGpvaW5lZC5zdGFydHN3aXRoKHJvb3QgKyAiLyIpOgogICAgICAgIHJh
aXNlIFZhbHVlRXJyb3IoImVzY2FwZSIpCiAgICByZXR1cm4gam9pbmVkCgoKZGVmIF9xZGlyKHNp
dGVfaWQ6IHN0ciwgcXJvb3Q6IHN0cikgLT4gc3RyOgogICAgcm9vdCA9IG9zLnBhdGgubm9ybXBh
dGgocXJvb3QpCiAgICBpZiBub3Qgcm9vdC5zdGFydHN3aXRoKCIvIikgb3IgIi4uIiBpbiByb290
LnNwbGl0KCIvIik6CiAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigiYmFkIHFyb290IikKICAgIGlm
IGFueShyb290ID09IHAgb3Igcm9vdC5zdGFydHN3aXRoKHAgKyAiLyIpIGZvciBwIGluIEFMTE9X
RURfUFJFRklYRVMpOgogICAgICAgIHJhaXNlIFZhbHVlRXJyb3IoInFyb290IHVuZGVyIHdlYiIp
CiAgICBzaWQgPSAoc2l0ZV9pZCBvciAiIikuc3RyaXAoKQogICAgaWYgbm90IHJlLm1hdGNoKHIi
Xltcd1wtXSskIiwgc2lkKToKICAgICAgICByYWlzZSBWYWx1ZUVycm9yKCJiYWQgc2l0ZSIpCiAg
ICBkZXN0ID0gb3MucGF0aC5ub3JtcGF0aChvcy5wYXRoLmpvaW4ocm9vdCwgc2lkKSkKICAgIGlm
IGRlc3QgIT0gcm9vdCBhbmQgbm90IGRlc3Quc3RhcnRzd2l0aChyb290ICsgIi8iKToKICAgICAg
ICByYWlzZSBWYWx1ZUVycm9yKCJlc2NhcGUiKQogICAgcmV0dXJuIGRlc3QKCgpkZWYgX2Jhc2Vu
YW1lX29rKG5hbWU6IHN0cikgLT4gYm9vbDoKICAgIHJldHVybiBib29sKHJlLm1hdGNoKHIiXltc
dy5cLV0rJCIsIG5hbWUgb3IgIiIpKSBhbmQgIi8iIG5vdCBpbiBuYW1lCgoKZGVmIHJ1bl9xdWFy
YW50aW5lKGFyZ3M6IGFyZ3BhcnNlLk5hbWVzcGFjZSkgLT4gaW50OgogICAgdHJ5OgogICAgICAg
IHJvb3QgPSB2YWxpZGF0ZV9yb290X3BhdGgoYXJncy5yb290KQogICAgICAgIHNyYyA9IF9qYWls
X3JlbChyb290LCBhcmdzLnJlbF9wYXRoKQogICAgICAgIGRlc3RfZGlyID0gX3FkaXIoYXJncy5z
aXRlX2lkLCBhcmdzLnF1YXJhbnRpbmVfcm9vdCkKICAgICAgICBkZXN0X2JuID0gYXJncy5kZXN0
X2Jhc2VuYW1lIG9yICIiCiAgICAgICAgaWYgbm90IF9iYXNlbmFtZV9vayhkZXN0X2JuKToKICAg
ICAgICAgICAgcmFpc2UgVmFsdWVFcnJvcigiYmFkIGRlc3QiKQogICAgZXhjZXB0IFZhbHVlRXJy
b3I6CiAgICAgICAgcmV0dXJuIDIKICAgIGRlc3QgPSBvcy5wYXRoLmpvaW4oZGVzdF9kaXIsIGRl
c3RfYm4pCiAgICBpZiBvcy5wYXRoLmlzZmlsZShkZXN0KSBhbmQgbm90IG9zLnBhdGguaXNmaWxl
KHNyYyk6CiAgICAgICAgcmV0dXJuIDAKICAgIGlmIG9zLnBhdGguaXNmaWxlKGRlc3QpIGFuZCBv
cy5wYXRoLmlzZmlsZShzcmMpOgogICAgICAgIHJldHVybiA2CiAgICBpZiBub3Qgb3MucGF0aC5p
c2ZpbGUoc3JjKToKICAgICAgICByZXR1cm4gNgogICAgdHJ5OgogICAgICAgIG9zLm1ha2VkaXJz
KGRlc3RfZGlyLCBtb2RlPTBvNzAwLCBleGlzdF9vaz1UcnVlKQogICAgICAgIG9zLmNobW9kKGRl
c3RfZGlyLCAwbzcwMCkKICAgICAgICBpZiBvcy5wYXRoLmxleGlzdHMoZGVzdCk6CiAgICAgICAg
ICAgIHJldHVybiA2CiAgICAgICAgc2h1dGlsLm1vdmUoc3JjLCBkZXN0KQogICAgZXhjZXB0IE9T
RXJyb3I6CiAgICAgICAgcmV0dXJuIDYKICAgIHJldHVybiAwCgoKZGVmIHJ1bl9yZXN0b3JlKGFy
Z3M6IGFyZ3BhcnNlLk5hbWVzcGFjZSkgLT4gaW50OgogICAgdHJ5OgogICAgICAgIHJvb3QgPSB2
YWxpZGF0ZV9yb290X3BhdGgoYXJncy5yb290KQogICAgICAgIG9yaWdpbmFsID0gX2phaWxfcmVs
KHJvb3QsIGFyZ3MucmVsX3BhdGgpCiAgICAgICAgZGVzdF9kaXIgPSBfcWRpcihhcmdzLnNpdGVf
aWQsIGFyZ3MucXVhcmFudGluZV9yb290KQogICAgICAgIGRlc3RfYm4gPSBhcmdzLmRlc3RfYmFz
ZW5hbWUgb3IgIiIKICAgICAgICBpZiBub3QgX2Jhc2VuYW1lX29rKGRlc3RfYm4pOgogICAgICAg
ICAgICByYWlzZSBWYWx1ZUVycm9yKCJiYWQgZGVzdCIpCiAgICBleGNlcHQgVmFsdWVFcnJvcjoK
ICAgICAgICByZXR1cm4gMgogICAgc3JjID0gb3MucGF0aC5qb2luKGRlc3RfZGlyLCBkZXN0X2Ju
KQogICAgaWYgb3MucGF0aC5pc2ZpbGUob3JpZ2luYWwpIGFuZCBub3Qgb3MucGF0aC5pc2ZpbGUo
c3JjKToKICAgICAgICByZXR1cm4gMAogICAgaWYgb3MucGF0aC5pc2ZpbGUob3JpZ2luYWwpIGFu
ZCBvcy5wYXRoLmlzZmlsZShzcmMpOgogICAgICAgIHJldHVybiA2CiAgICBpZiBub3Qgb3MucGF0
aC5pc2ZpbGUoc3JjKToKICAgICAgICByZXR1cm4gNgogICAgdHJ5OgogICAgICAgIG9zLm1ha2Vk
aXJzKG9zLnBhdGguZGlybmFtZShvcmlnaW5hbCksIGV4aXN0X29rPVRydWUpCiAgICAgICAgaWYg
b3MucGF0aC5sZXhpc3RzKG9yaWdpbmFsKToKICAgICAgICAgICAgcmV0dXJuIDYKICAgICAgICBz
aHV0aWwubW92ZShzcmMsIG9yaWdpbmFsKQogICAgZXhjZXB0IE9TRXJyb3I6CiAgICAgICAgcmV0
dXJuIDYKICAgIHJldHVybiAwCgoKZGVmIGZldGNoX2pvYnMoYXBpX2Jhc2U6IHN0ciwgdG9rZW46
IHN0ciwgYWdlbnRfaWQ6IHN0ciwgdGltZW91dDogaW50KSAtPiB0dXBsZVtpbnQsIGxpc3RbZGlj
dFtzdHIsIHN0cl1dXToKICAgIHVybCA9IGFwaV9iYXNlLnJzdHJpcCgiLyIpICsgIi9hcGkvaG9z
dC9hZ2VudC9qb2JzP2FnZW50X2lkPSIgKyB1cmxsaWIucGFyc2UucXVvdGUoYWdlbnRfaWQpCiAg
ICByZXEgPSB1cmxsaWIucmVxdWVzdC5SZXF1ZXN0KAogICAgICAgIHVybCwKICAgICAgICBtZXRo
b2Q9IkdFVCIsCiAgICAgICAgaGVhZGVycz1fYWdlbnRfaGVhZGVycyh0b2tlbiksCiAgICApCiAg
ICB0cnk6CiAgICAgICAgd2l0aCB1cmxsaWIucmVxdWVzdC51cmxvcGVuKHJlcSwgdGltZW91dD10
aW1lb3V0KSBhcyByZXNwOgogICAgICAgICAgICBib2R5ID0ganNvbi5sb2FkcyhyZXNwLnJlYWQo
KS5kZWNvZGUoInV0Zi04IikpCiAgICBleGNlcHQgKHVybGxpYi5lcnJvci5VUkxFcnJvciwgdXJs
bGliLmVycm9yLkhUVFBFcnJvciwganNvbi5KU09ORGVjb2RlRXJyb3IsIE9TRXJyb3IpOgogICAg
ICAgIHJldHVybiAwLCBbXQogICAgam9icyA9IGJvZHkuZ2V0KCJqb2JzIikgaWYgaXNpbnN0YW5j
ZShib2R5LCBkaWN0KSBlbHNlIE5vbmUKICAgIGlmIG5vdCBpc2luc3RhbmNlKGpvYnMsIGxpc3Qp
OgogICAgICAgIHJldHVybiAwLCBbXQogICAgb3V0OiBsaXN0W2RpY3Rbc3RyLCBzdHJdXSA9IFtd
CiAgICBmb3Igam9iIGluIGpvYnM6CiAgICAgICAgaWYgbm90IGlzaW5zdGFuY2Uoam9iLCBkaWN0
KToKICAgICAgICAgICAgY29udGludWUKICAgICAgICBraW5kID0gc3RyKGpvYi5nZXQoImtpbmQi
KSBvciAic2NhbiIpCiAgICAgICAgcm9vdCA9IHN0cihqb2IuZ2V0KCJyb290X3BhdGgiKSBvciAi
IikKICAgICAgICBpZiBraW5kID09ICJzY2FuIjoKICAgICAgICAgICAgc2Nhbl9pZCA9IHN0cihq
b2IuZ2V0KCJzY2FuX2lkIikgb3IgIiIpCiAgICAgICAgICAgIGlmIHNjYW5faWQgYW5kIHJvb3Q6
CiAgICAgICAgICAgICAgICBvdXQuYXBwZW5kKHsia2luZCI6ICJzY2FuIiwgInNjYW5faWQiOiBz
Y2FuX2lkLCAicm9vdF9wYXRoIjogcm9vdH0pCiAgICAgICAgZWxpZiBraW5kIGluICgicXVhcmFu
dGluZSIsICJyZXN0b3JlIik6CiAgICAgICAgICAgIGNvbW1hbmRfaWQgPSBzdHIoam9iLmdldCgi
Y29tbWFuZF9pZCIpIG9yICIiKQogICAgICAgICAgICByZWxfcGF0aCA9IHN0cihqb2IuZ2V0KCJy
ZWxfcGF0aCIpIG9yICIiKQogICAgICAgICAgICBkZXN0X2Jhc2VuYW1lID0gc3RyKGpvYi5nZXQo
ImRlc3RfYmFzZW5hbWUiKSBvciAiIikKICAgICAgICAgICAgc2l0ZV9pZCA9IHN0cihqb2IuZ2V0
KCJzaXRlX2lkIikgb3IgIiIpCiAgICAgICAgICAgIGlmIGNvbW1hbmRfaWQgYW5kIHJvb3QgYW5k
IHJlbF9wYXRoIGFuZCBkZXN0X2Jhc2VuYW1lIGFuZCBzaXRlX2lkOgogICAgICAgICAgICAgICAg
b3V0LmFwcGVuZCgKICAgICAgICAgICAgICAgICAgICB7CiAgICAgICAgICAgICAgICAgICAgICAg
ICJraW5kIjoga2luZCwKICAgICAgICAgICAgICAgICAgICAgICAgImNvbW1hbmRfaWQiOiBjb21t
YW5kX2lkLAogICAgICAgICAgICAgICAgICAgICAgICAicm9vdF9wYXRoIjogcm9vdCwKICAgICAg
ICAgICAgICAgICAgICAgICAgInJlbF9wYXRoIjogcmVsX3BhdGgsCiAgICAgICAgICAgICAgICAg
ICAgICAgICJkZXN0X2Jhc2VuYW1lIjogZGVzdF9iYXNlbmFtZSwKICAgICAgICAgICAgICAgICAg
ICAgICAgInNpdGVfaWQiOiBzaXRlX2lkLAogICAgICAgICAgICAgICAgICAgIH0KICAgICAgICAg
ICAgICAgICkKICAgICAgICAgICAgZWxpZiBjb21tYW5kX2lkOgogICAgICAgICAgICAgICAgcG9z
dF9jb21tYW5kX2FjayhhcGlfYmFzZSwgdG9rZW4sIGFnZW50X2lkLCBjb21tYW5kX2lkLCBGYWxz
ZSwgImluY29tcGxldGUgam9iIiwgdGltZW91dCkKICAgIHJldHVybiBsZW4oam9icyksIG91dAoK
Cl9XQUZfSURfUkUgPSByZS5jb21waWxlKHInXFtpZFxzKyIoXGQrKSJcXScpCl9XQUZfUkVRX1JF
ID0gcmUuY29tcGlsZShyIl4oR0VUfFBPU1R8UFVUfFBBVENIfERFTEVURXxIRUFEfE9QVElPTlMp
XHMrKFxTKykiLCByZS5NVUxUSUxJTkUpCl9NQVhfV0FGX0VWRU5UUyA9IDEwMApfV0FGX1NUQVJU
RVJfSURTID0gZnJvemVuc2V0KHsiMTAwMSIsICIxMDAyIiwgIjEwMDMiLCAiMTAwNCJ9KQpfV0FG
X1NUQVRJQ19QQVRIX1JFID0gcmUuY29tcGlsZSgKICAgIHIiXC4oPzpqc3xjc3N8bWFwfHdvZmYy
P3xwbmd8anBlP2d8Z2lmfHN2Z3xpY298dHRmfGVvdCkoPzokfFw/KSIsCiAgICByZS5JR05PUkVD
QVNFLAopCgoKZGVmIF9tb2RzZWNfanNvbl9yb3dzKHRleHQ6IHN0cikgLT4gbGlzdFtvYmplY3Rd
OgogICAgc3RyaXBwZWQgPSAodGV4dCBvciAiIikuc3RyaXAoKQogICAgaWYgbm90IHN0cmlwcGVk
OgogICAgICAgIHJldHVybiBbXQogICAgdHJ5OgogICAgICAgIHBhcnNlZCA9IGpzb24ubG9hZHMo
c3RyaXBwZWQpCiAgICAgICAgcmV0dXJuIHBhcnNlZCBpZiBpc2luc3RhbmNlKHBhcnNlZCwgbGlz
dCkgZWxzZSBbcGFyc2VkXQogICAgZXhjZXB0IGpzb24uSlNPTkRlY29kZUVycm9yOgogICAgICAg
IHJvd3M6IGxpc3Rbb2JqZWN0XSA9IFtdCiAgICAgICAgZm9yIGxpbmUgaW4gc3RyaXBwZWQuc3Bs
aXRsaW5lcygpOgogICAgICAgICAgICBsaW5lID0gbGluZS5zdHJpcCgpCiAgICAgICAgICAgIGlm
IG5vdCBsaW5lLnN0YXJ0c3dpdGgoInsiKSBhbmQgbm90IGxpbmUuc3RhcnRzd2l0aCgiWyIpOgog
ICAgICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAg
cGFyc2VkID0ganNvbi5sb2FkcyhsaW5lKQogICAgICAgICAgICBleGNlcHQganNvbi5KU09ORGVj
b2RlRXJyb3I6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBpZiBpc2luc3Rh
bmNlKHBhcnNlZCwgbGlzdCk6CiAgICAgICAgICAgICAgICByb3dzLmV4dGVuZChwYXJzZWQpCiAg
ICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICByb3dzLmFwcGVuZChwYXJzZWQpCiAgICAg
ICAgcmV0dXJuIHJvd3MKCgpkZWYgX21vZHNlY19ydWxlX2lkcyhyb3c6IGRpY3Rbc3RyLCBvYmpl
Y3RdLCB0eG46IGRpY3Rbc3RyLCBvYmplY3RdKSAtPiBsaXN0W3N0cl06CiAgICBtc2dzID0gcm93
LmdldCgibWVzc2FnZXMiKSBpZiBpc2luc3RhbmNlKHJvdy5nZXQoIm1lc3NhZ2VzIiksIGxpc3Qp
IGVsc2UgW10KICAgIGlmIG5vdCBtc2dzOgogICAgICAgIG1zZ3MgPSB0eG4uZ2V0KCJtZXNzYWdl
cyIpIGlmIGlzaW5zdGFuY2UodHhuLmdldCgibWVzc2FnZXMiKSwgbGlzdCkgZWxzZSBbXQogICAg
aWRzOiBsaXN0W3N0cl0gPSBbXQogICAgZm9yIG1zZyBpbiBtc2dzOgogICAgICAgIGlmIG5vdCBp
c2luc3RhbmNlKG1zZywgZGljdCk6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgZGV0YWls
cyA9IG1zZy5nZXQoImRldGFpbHMiKSBpZiBpc2luc3RhbmNlKG1zZy5nZXQoImRldGFpbHMiKSwg
ZGljdCkgZWxzZSB7fQogICAgICAgIHJpZCA9IGRldGFpbHMuZ2V0KCJydWxlSWQiKSBvciBkZXRh
aWxzLmdldCgiaWQiKQogICAgICAgIGlmIHJpZDoKICAgICAgICAgICAgaWRzLmFwcGVuZChzdHIo
cmlkKVs6MTI4XSkKICAgIHJldHVybiBpZHMKCgpkZWYgX21vZHNlY19ydWxlX2lkKHJvdzogZGlj
dFtzdHIsIG9iamVjdF0sIHR4bjogZGljdFtzdHIsIG9iamVjdF0pIC0+IHN0cjoKICAgIGlkcyA9
IF9tb2RzZWNfcnVsZV9pZHMocm93LCB0eG4pCiAgICBmb3IgcmlkIGluIGlkczoKICAgICAgICBp
ZiByaWQgaW4gX1dBRl9TVEFSVEVSX0lEUzoKICAgICAgICAgICAgcmV0dXJuIHJpZAogICAgcmV0
dXJuIGlkc1swXSBpZiBpZHMgZWxzZSAidW5rbm93biIKCgpkZWYga2VlcF93YWZfZXZlbnQocnVs
ZV9pZDogc3RyLCBwYXRoOiBzdHIpIC0+IGJvb2w6CiAgICBpZiBydWxlX2lkIG5vdCBpbiBfV0FG
X1NUQVJURVJfSURTOgogICAgICAgIHJldHVybiBGYWxzZQogICAgaWYgX1dBRl9TVEFUSUNfUEFU
SF9SRS5zZWFyY2gocGF0aCBvciAiIik6CiAgICAgICAgcmV0dXJuIEZhbHNlCiAgICByZXR1cm4g
VHJ1ZQoKCmRlZiBwYXJzZV9tb2RzZWNfYXVkaXRfZXZlbnRzKHRleHQ6IHN0cikgLT4gbGlzdFtk
aWN0W3N0ciwgb2JqZWN0XV06CiAgICBldmVudHM6IGxpc3RbZGljdFtzdHIsIG9iamVjdF1dID0g
W10KICAgIHN0cmlwcGVkID0gKHRleHQgb3IgIiIpLnN0cmlwKCkKICAgIGlmIG5vdCBzdHJpcHBl
ZDoKICAgICAgICByZXR1cm4gZXZlbnRzCiAgICBpZiBzdHJpcHBlZC5zdGFydHN3aXRoKCJ7Iikg
b3Igc3RyaXBwZWQuc3RhcnRzd2l0aCgiWyIpIG9yICJcbnsiIGluIHN0cmlwcGVkOgogICAgICAg
IHJvd3MgPSBfbW9kc2VjX2pzb25fcm93cyhzdHJpcHBlZCkKICAgICAgICBmb3Igcm93IGluIHJv
d3M6CiAgICAgICAgICAgIGlmIG5vdCBpc2luc3RhbmNlKHJvdywgZGljdCk6CiAgICAgICAgICAg
ICAgICBjb250aW51ZQogICAgICAgICAgICB0eG4gPSByb3cuZ2V0KCJ0cmFuc2FjdGlvbiIpIGlm
IGlzaW5zdGFuY2Uocm93LmdldCgidHJhbnNhY3Rpb24iKSwgZGljdCkgZWxzZSB7fQogICAgICAg
ICAgICByZXEgPSB0eG4uZ2V0KCJyZXF1ZXN0IikgaWYgaXNpbnN0YW5jZSh0eG4uZ2V0KCJyZXF1
ZXN0IiksIGRpY3QpIGVsc2Uge30KICAgICAgICAgICAgcmVzcCA9IHR4bi5nZXQoInJlc3BvbnNl
IikgaWYgaXNpbnN0YW5jZSh0eG4uZ2V0KCJyZXNwb25zZSIpLCBkaWN0KSBlbHNlIHt9CiAgICAg
ICAgICAgIHJ1bGVfaWQgPSBfbW9kc2VjX3J1bGVfaWQocm93LCB0eG4pCiAgICAgICAgICAgIG1l
dGhvZCA9IHN0cihyZXEuZ2V0KCJtZXRob2QiKSBvciAiR0VUIikudXBwZXIoKQogICAgICAgICAg
ICBwYXRoID0gc3RyKHJlcS5nZXQoInVyaSIpIG9yIHJlcS5nZXQoInVyaV9ub19xdWVyeSIpIG9y
ICIvIikKICAgICAgICAgICAgcGF0aCA9IHBhdGguc3BsaXQoIj8iLCAxKVswXVs6MjU2XSBvciAi
LyIKICAgICAgICAgICAgaWYgbm90IGtlZXBfd2FmX2V2ZW50KHJ1bGVfaWQsIHBhdGgpOgogICAg
ICAgICAgICAgICAgY29udGludWUKICAgICAgICAgICAgc3RhdHVzX2NvZGUgPSByZXNwLmdldCgi
aHR0cF9jb2RlIikgb3IgcmVzcC5nZXQoInN0YXR1cyIpCiAgICAgICAgICAgIGh0dHBfc3RhdHVz
ID0gaW50KHN0YXR1c19jb2RlKSBpZiBpc2luc3RhbmNlKHN0YXR1c19jb2RlLCBpbnQpIGVsc2Ug
Tm9uZQogICAgICAgICAgICBhY3Rpb24gPSAiYmxvY2siIGlmIGh0dHBfc3RhdHVzID09IDQwMyBl
bHNlICJsb2ciCiAgICAgICAgICAgIGV2ZW50cy5hcHBlbmQoCiAgICAgICAgICAgICAgICB7CiAg
ICAgICAgICAgICAgICAgICAgImFjdGlvbiI6IGFjdGlvbiwKICAgICAgICAgICAgICAgICAgICAi
cnVsZV9pZCI6IHJ1bGVfaWRbOjEyOF0sCiAgICAgICAgICAgICAgICAgICAgIm1ldGhvZCI6IG1l
dGhvZFs6OF0sCiAgICAgICAgICAgICAgICAgICAgInBhdGgiOiBwYXRoLAogICAgICAgICAgICAg
ICAgICAgICJodHRwX3N0YXR1cyI6IGh0dHBfc3RhdHVzLAogICAgICAgICAgICAgICAgfQogICAg
ICAgICAgICApCiAgICAgICAgICAgIGlmIGxlbihldmVudHMpID49IF9NQVhfV0FGX0VWRU5UUzoK
ICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgaWYgZXZlbnRzOgogICAgICAgICAgICByZXR1
cm4gZXZlbnRzCiAgICBmb3IgY2h1bmsgaW4gcmUuc3BsaXQociJcbi0tW0EtWmEtejAtOV0rLS1b
QS1aXS0tXG4iLCB0ZXh0KToKICAgICAgICBpZHMgPSBfV0FGX0lEX1JFLmZpbmRhbGwoY2h1bmsp
CiAgICAgICAgcmVxX20gPSBfV0FGX1JFUV9SRS5zZWFyY2goY2h1bmspCiAgICAgICAgaWYgbm90
IGlkcyBhbmQgbm90IHJlcV9tOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIG1ldGhvZCA9
IChyZXFfbS5ncm91cCgxKSBpZiByZXFfbSBlbHNlICJHRVQiKS51cHBlcigpCiAgICAgICAgcmF3
X3BhdGggPSByZXFfbS5ncm91cCgyKSBpZiByZXFfbSBlbHNlICIvIgogICAgICAgIHBhdGggPSBy
YXdfcGF0aC5zcGxpdCgiPyIsIDEpWzBdWzoyNTZdIG9yICIvIgogICAgICAgIHJ1bGVfaWQgPSBu
ZXh0KChpIGZvciBpIGluIGlkcyBpZiBpIGluIF9XQUZfU1RBUlRFUl9JRFMpLCAoaWRzWzBdIGlm
IGlkcyBlbHNlICJ1bmtub3duIikpCiAgICAgICAgaWYgbm90IGtlZXBfd2FmX2V2ZW50KHJ1bGVf
aWQsIHBhdGgpOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIGh0dHBfc3RhdHVzID0gNDAz
IGlmICI0MDMiIGluIGNodW5rIG9yICJJbnRlcmNlcHRlZCIgaW4gY2h1bmsgZWxzZSBOb25lCiAg
ICAgICAgZXZlbnRzLmFwcGVuZCgKICAgICAgICAgICAgewogICAgICAgICAgICAgICAgImFjdGlv
biI6ICJibG9jayIgaWYgaHR0cF9zdGF0dXMgPT0gNDAzIGVsc2UgImxvZyIsCiAgICAgICAgICAg
ICAgICAicnVsZV9pZCI6IHJ1bGVfaWRbOjEyOF0sCiAgICAgICAgICAgICAgICAibWV0aG9kIjog
bWV0aG9kWzo4XSwKICAgICAgICAgICAgICAgICJwYXRoIjogcGF0aCwKICAgICAgICAgICAgICAg
ICJodHRwX3N0YXR1cyI6IGh0dHBfc3RhdHVzLAogICAgICAgICAgICB9CiAgICAgICAgKQogICAg
ICAgIGlmIGxlbihldmVudHMpID49IF9NQVhfV0FGX0VWRU5UUzoKICAgICAgICAgICAgYnJlYWsK
ICAgIHJldHVybiBldmVudHMKCgpkZWYgX3dhZl9jdXJzb3JfcGF0aChhZ2VudF9pZDogc3RyKSAt
PiBzdHI6CiAgICBzYWZlID0gcmUuc3ViKHIiW14wLTlhLWZBLUYtXSIsICJfIiwgYWdlbnRfaWQp
Wzo4MF0gb3IgImFnZW50IgogICAgbG9ja19kaXIgPSBvcy5lbnZpcm9uLmdldCgiU0lORVhJU19Q
T0xMX0xPQ0tfRElSIiwgIi92YXIvbGliL3NpbmV4aXMiKQogICAgcmV0dXJuIG9zLnBhdGguam9p
bihsb2NrX2RpciwgZiJ3YWYtYXVkaXQte3NhZmV9LmN1cnNvciIpCgoKZGVmIHJlYWRfbmV3X2F1
ZGl0X3RleHQocGF0aDogc3RyLCBhZ2VudF9pZDogc3RyKSAtPiBzdHI6CiAgICBpZiBub3QgcGF0
aCBvciBub3Qgb3MucGF0aC5pc2ZpbGUocGF0aCk6CiAgICAgICAgcmV0dXJuICIiCiAgICBjdXJz
b3JfcGF0aCA9IF93YWZfY3Vyc29yX3BhdGgoYWdlbnRfaWQpCiAgICBvZmZzZXQgPSAwCiAgICB0
cnk6CiAgICAgICAgd2l0aCBvcGVuKGN1cnNvcl9wYXRoLCBlbmNvZGluZz0idXRmLTgiKSBhcyBm
aDoKICAgICAgICAgICAgb2Zmc2V0ID0gaW50KGZoLnJlYWQoKS5zdHJpcCgpIG9yICIwIikKICAg
IGV4Y2VwdCAoT1NFcnJvciwgVmFsdWVFcnJvcik6CiAgICAgICAgb2Zmc2V0ID0gMAogICAgdHJ5
OgogICAgICAgIHNpemUgPSBvcy5wYXRoLmdldHNpemUocGF0aCkKICAgICAgICBpZiBvZmZzZXQg
PiBzaXplOgogICAgICAgICAgICBvZmZzZXQgPSAwCiAgICAgICAgd2l0aCBvcGVuKHBhdGgsICJy
YiIpIGFzIGZoOgogICAgICAgICAgICBmaC5zZWVrKG9mZnNldCkKICAgICAgICAgICAgZGF0YSA9
IGZoLnJlYWQoKQogICAgICAgIG5ld19vZmZzZXQgPSBvZmZzZXQgKyBsZW4oZGF0YSkKICAgICAg
ICBvcy5tYWtlZGlycyhvcy5wYXRoLmRpcm5hbWUoY3Vyc29yX3BhdGgpLCBtb2RlPTBvNzAwLCBl
eGlzdF9vaz1UcnVlKQogICAgICAgIHdpdGggb3BlbihjdXJzb3JfcGF0aCwgInciLCBlbmNvZGlu
Zz0idXRmLTgiKSBhcyBmaDoKICAgICAgICAgICAgZmgud3JpdGUoc3RyKG5ld19vZmZzZXQpKQog
ICAgICAgIHJldHVybiBkYXRhLmRlY29kZSgidXRmLTgiLCBlcnJvcnM9InJlcGxhY2UiKQogICAg
ZXhjZXB0IE9TRXJyb3I6CiAgICAgICAgcmV0dXJuICIiCgoKZGVmIGRlZHVwZV93YWZfZXZlbnRz
KGV2ZW50czogbGlzdFtkaWN0W3N0ciwgb2JqZWN0XV0pIC0+IGxpc3RbZGljdFtzdHIsIG9iamVj
dF1dOgogICAgc2Vlbjogc2V0W3R1cGxlW29iamVjdCwgb2JqZWN0LCBvYmplY3QsIG9iamVjdF1d
ID0gc2V0KCkKICAgIG91dDogbGlzdFtkaWN0W3N0ciwgb2JqZWN0XV0gPSBbXQogICAgZm9yIGV2
ZW50IGluIGV2ZW50czoKICAgICAgICBrZXkgPSAoZXZlbnQuZ2V0KCJwYXRoIiksIGV2ZW50Lmdl
dCgicnVsZV9pZCIpLCBldmVudC5nZXQoIm1ldGhvZCIpLCBldmVudC5nZXQoImFjdGlvbiIpKQog
ICAgICAgIGlmIGtleSBpbiBzZWVuOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHNlZW4u
YWRkKGtleSkKICAgICAgICBvdXQuYXBwZW5kKGV2ZW50KQogICAgcmV0dXJuIG91dAoKCmRlZiBw
b3N0X3dhZl9ldmVudHMoYXBpX2Jhc2U6IHN0ciwgdG9rZW46IHN0ciwgcGF5bG9hZDogZGljdFtz
dHIsIG9iamVjdF0sIHRpbWVvdXQ6IGludCkgLT4gaW50OgogICAgdXJsID0gYXBpX2Jhc2UucnN0
cmlwKCIvIikgKyAiL2FwaS9ob3N0L2FnZW50L3dhZi1ldmVudHMiCiAgICBkYXRhID0ganNvbi5k
dW1wcyhwYXlsb2FkKS5lbmNvZGUoInV0Zi04IikKICAgIHJlcSA9IHVybGxpYi5yZXF1ZXN0LlJl
cXVlc3QoCiAgICAgICAgdXJsLAogICAgICAgIGRhdGE9ZGF0YSwKICAgICAgICBtZXRob2Q9IlBP
U1QiLAogICAgICAgIGhlYWRlcnM9X2FnZW50X2hlYWRlcnModG9rZW4sIGpzb25fYm9keT1UcnVl
KSwKICAgICkKICAgIHRyeToKICAgICAgICB3aXRoIHVybGxpYi5yZXF1ZXN0LnVybG9wZW4ocmVx
LCB0aW1lb3V0PXRpbWVvdXQpIGFzIHJlc3A6CiAgICAgICAgICAgIHJldHVybiBpbnQoZ2V0YXR0
cihyZXNwLCAic3RhdHVzIiwgMjAwKSBvciAyMDApCiAgICBleGNlcHQgdXJsbGliLmVycm9yLkhU
VFBFcnJvciBhcyBleGM6CiAgICAgICAgcmV0dXJuIGludChleGMuY29kZSkKICAgIGV4Y2VwdCAo
dXJsbGliLmVycm9yLlVSTEVycm9yLCBPU0Vycm9yKToKICAgICAgICByZXR1cm4gNQoKCmRlZiBt
YXliZV9wb3N0X3dhZl9ldmVudHMoYXJnczogYXJncGFyc2UuTmFtZXNwYWNlKSAtPiBOb25lOgog
ICAgc2l0ZV9pZCA9IChvcy5lbnZpcm9uLmdldCgiU0lORVhJU19XQUZfU0lURV9JRCIpIG9yICIi
KS5zdHJpcCgpCiAgICBhdWRpdCA9IChvcy5lbnZpcm9uLmdldCgiU0lORVhJU19XQUZfQVVESVRf
TE9HIikgb3IgIi92YXIvbG9nL21vZHNlY19hdWRpdC5sb2ciKS5zdHJpcCgpCiAgICBpZiBub3Qg
c2l0ZV9pZCBvciBub3QgYXJncy5hcGlfYmFzZSBvciBub3QgYXJncy50b2tlbiBvciBub3QgYXJn
cy5hZ2VudF9pZDoKICAgICAgICByZXR1cm4KICAgIHRleHQgPSByZWFkX25ld19hdWRpdF90ZXh0
KGF1ZGl0LCBhcmdzLmFnZW50X2lkKQogICAgZXZlbnRzID0gZGVkdXBlX3dhZl9ldmVudHMocGFy
c2VfbW9kc2VjX2F1ZGl0X2V2ZW50cyh0ZXh0KSkKICAgIGlmIG5vdCBldmVudHM6CiAgICAgICAg
cmV0dXJuCiAgICBwb3N0X3dhZl9ldmVudHMoCiAgICAgICAgYXJncy5hcGlfYmFzZSwKICAgICAg
ICBhcmdzLnRva2VuLAogICAgICAgIHsiYWdlbnRfaWQiOiBhcmdzLmFnZW50X2lkLCAic2l0ZV9p
ZCI6IHNpdGVfaWQsICJldmVudHMiOiBldmVudHN9LAogICAgICAgIGFyZ3MudGltZW91dCwKICAg
ICkKCgpkZWYgcG9zdF9yZXN1bHRzKGFwaV9iYXNlOiBzdHIsIHRva2VuOiBzdHIsIHBheWxvYWQ6
IGRpY3Rbc3RyLCBvYmplY3RdLCB0aW1lb3V0OiBpbnQpIC0+IGludDoKICAgIHVybCA9IGFwaV9i
YXNlLnJzdHJpcCgiLyIpICsgIi9hcGkvaG9zdC9hZ2VudC9yZXN1bHRzIgogICAgZGF0YSA9IGpz
b24uZHVtcHMocGF5bG9hZCkuZW5jb2RlKCJ1dGYtOCIpCiAgICByZXEgPSB1cmxsaWIucmVxdWVz
dC5SZXF1ZXN0KAogICAgICAgIHVybCwKICAgICAgICBkYXRhPWRhdGEsCiAgICAgICAgbWV0aG9k
PSJQT1NUIiwKICAgICAgICBoZWFkZXJzPV9hZ2VudF9oZWFkZXJzKHRva2VuLCBqc29uX2JvZHk9
VHJ1ZSksCiAgICApCiAgICB0cnk6CiAgICAgICAgd2l0aCB1cmxsaWIucmVxdWVzdC51cmxvcGVu
KHJlcSwgdGltZW91dD10aW1lb3V0KSBhcyByZXNwOgogICAgICAgICAgICByZXR1cm4gaW50KGdl
dGF0dHIocmVzcCwgInN0YXR1cyIsIDIwMCkgb3IgMjAwKQogICAgZXhjZXB0IHVybGxpYi5lcnJv
ci5IVFRQRXJyb3IgYXMgZXhjOgogICAgICAgIHJldHVybiBpbnQoZXhjLmNvZGUpCgoKZGVmIHBv
c3RfY29tbWFuZF9hY2soCiAgICBhcGlfYmFzZTogc3RyLCB0b2tlbjogc3RyLCBhZ2VudF9pZDog
c3RyLCBjb21tYW5kX2lkOiBzdHIsIG9rOiBib29sLCBlcnJvcjogc3RyLCB0aW1lb3V0OiBpbnQK
KSAtPiBpbnQ6CiAgICB1cmwgPSBhcGlfYmFzZS5yc3RyaXAoIi8iKSArICIvYXBpL2hvc3QvYWdl
bnQvY29tbWFuZHMvYWNrIgogICAgcGF5bG9hZCA9IHsiY29tbWFuZF9pZCI6IGNvbW1hbmRfaWQs
ICJhZ2VudF9pZCI6IGFnZW50X2lkLCAib2siOiBvaywgImVycm9yIjogZXJyb3Igb3IgTm9uZX0K
ICAgIGRhdGEgPSBqc29uLmR1bXBzKHBheWxvYWQpLmVuY29kZSgidXRmLTgiKQogICAgcmVxID0g
dXJsbGliLnJlcXVlc3QuUmVxdWVzdCgKICAgICAgICB1cmwsCiAgICAgICAgZGF0YT1kYXRhLAog
ICAgICAgIG1ldGhvZD0iUE9TVCIsCiAgICAgICAgaGVhZGVycz1fYWdlbnRfaGVhZGVycyh0b2tl
biwganNvbl9ib2R5PVRydWUpLAogICAgKQogICAgdHJ5OgogICAgICAgIHdpdGggdXJsbGliLnJl
cXVlc3QudXJsb3BlbihyZXEsIHRpbWVvdXQ9dGltZW91dCkgYXMgcmVzcDoKICAgICAgICAgICAg
cmV0dXJuIGludChnZXRhdHRyKHJlc3AsICJzdGF0dXMiLCAyMDApIG9yIDIwMCkKICAgIGV4Y2Vw
dCB1cmxsaWIuZXJyb3IuSFRUUEVycm9yIGFzIGV4YzoKICAgICAgICByZXR1cm4gaW50KGV4Yy5j
b2RlKQogICAgZXhjZXB0ICh1cmxsaWIuZXJyb3IuVVJMRXJyb3IsIE9TRXJyb3IpOgogICAgICAg
IHJldHVybiA1CgoKZGVmIF9wb2xsX2xvY2tfcGF0aChhZ2VudF9pZDogc3RyKSAtPiBzdHI6CiAg
ICBzYWZlID0gcmUuc3ViKHIiW14wLTlhLWZBLUYtXSIsICJfIiwgYWdlbnRfaWQpWzo4MF0gb3Ig
ImFnZW50IgogICAgbG9ja19kaXIgPSBvcy5lbnZpcm9uLmdldCgiU0lORVhJU19QT0xMX0xPQ0tf
RElSIiwgIi92YXIvbGliL3NpbmV4aXMiKQogICAgcmV0dXJuIG9zLnBhdGguam9pbihsb2NrX2Rp
ciwgZiJob3N0LXByb3RlY3QtcG9sbC17c2FmZX0ubG9jayIpCgoKZGVmIF93YXRjaF9sb2NrX3Bh
dGgoYWdlbnRfaWQ6IHN0cikgLT4gc3RyOgogICAgc2FmZSA9IHJlLnN1YihyIlteMC05YS1mQS1G
LV0iLCAiXyIsIGFnZW50X2lkKVs6ODBdIG9yICJhZ2VudCIKICAgIGxvY2tfZGlyID0gb3MuZW52
aXJvbi5nZXQoIlNJTkVYSVNfUE9MTF9MT0NLX0RJUiIsICIvdmFyL2xpYi9zaW5leGlzIikKICAg
IHJldHVybiBvcy5wYXRoLmpvaW4obG9ja19kaXIsIGYid2F0Y2gte3NhZmV9LmxvY2siKQoKCmRl
ZiBfd2F0Y2hfc2l0ZV9rZXkoc2l0ZV9pZDogc3RyLCByb290OiBzdHIpIC0+IHN0cjoKICAgIGRp
Z2VzdCA9IGhhc2hsaWIuc2hhMjU2KHJvb3QuZW5jb2RlKCJ1dGYtOCIpKS5oZXhkaWdlc3QoKVs6
MTZdCiAgICBzYWZlID0gcmUuc3ViKHIiW14wLTlhLWZBLVphLXotXSIsICJfIiwgc2l0ZV9pZCBv
ciAiIilbOjYwXSBvciAic2l0ZSIKICAgIHJldHVybiBmIntzYWZlfS17ZGlnZXN0fSIKCgpkZWYg
X3dhdGNoX2Nvb2xkb3duX3BhdGgoc3RhdGVfZGlyOiBzdHIsIGFnZW50X2lkOiBzdHIsIHNpdGVf
a2V5OiBzdHIpIC0+IHN0cjoKICAgIHNhZmVfYWdlbnQgPSByZS5zdWIociJbXjAtOWEtZkEtRi1d
IiwgIl8iLCBhZ2VudF9pZClbOjgwXSBvciAiYWdlbnQiCiAgICByZXR1cm4gb3MucGF0aC5qb2lu
KHN0YXRlX2RpciwgZiJ7c2FmZV9hZ2VudH0te3NpdGVfa2V5fS5jb29sZG93biIpCgoKZGVmIF93
YXRjaF9tdGltZV9wYXRoKHN0YXRlX2Rpcjogc3RyLCBhZ2VudF9pZDogc3RyLCBzaXRlX2tleTog
c3RyKSAtPiBzdHI6CiAgICBzYWZlX2FnZW50ID0gcmUuc3ViKHIiW14wLTlhLWZBLUYtXSIsICJf
IiwgYWdlbnRfaWQpWzo4MF0gb3IgImFnZW50IgogICAgcmV0dXJuIG9zLnBhdGguam9pbihzdGF0
ZV9kaXIsIGYie3NhZmVfYWdlbnR9LXtzaXRlX2tleX0ubXRpbWUiKQoKCmRlZiBfd2F0Y2hfY29v
bGRvd25fcmVtYWluaW5nKHN0YXRlX2Rpcjogc3RyLCBhZ2VudF9pZDogc3RyLCBzaXRlX2tleTog
c3RyLCBjb29sZG93bjogaW50LCBub3c6IGZsb2F0KSAtPiBmbG9hdDoKICAgIHRyeToKICAgICAg
ICB3aXRoIG9wZW4oX3dhdGNoX2Nvb2xkb3duX3BhdGgoc3RhdGVfZGlyLCBhZ2VudF9pZCwgc2l0
ZV9rZXkpLCBlbmNvZGluZz0idXRmLTgiKSBhcyBmaDoKICAgICAgICAgICAgbGFzdCA9IGZsb2F0
KChmaC5yZWFkKCkgb3IgIjAiKS5zdHJpcCgpIG9yICIwIikKICAgIGV4Y2VwdCAoT1NFcnJvciwg
VmFsdWVFcnJvcik6CiAgICAgICAgcmV0dXJuIDAuMAogICAgcmV0dXJuIG1heCgwLjAsIChsYXN0
ICsgbWF4KDAsIGNvb2xkb3duKSkgLSBub3cpCgoKZGVmIF93YXRjaF9tYXJrX2ZpcmVkKHN0YXRl
X2Rpcjogc3RyLCBhZ2VudF9pZDogc3RyLCBzaXRlX2tleTogc3RyLCBub3c6IGZsb2F0KSAtPiBO
b25lOgogICAgdHJ5OgogICAgICAgIG9zLm1ha2VkaXJzKHN0YXRlX2RpciwgbW9kZT0wbzcwMCwg
ZXhpc3Rfb2s9VHJ1ZSkKICAgICAgICB3aXRoIG9wZW4oX3dhdGNoX2Nvb2xkb3duX3BhdGgoc3Rh
dGVfZGlyLCBhZ2VudF9pZCwgc2l0ZV9rZXkpLCAidyIsIGVuY29kaW5nPSJ1dGYtOCIpIGFzIGZo
OgogICAgICAgICAgICBmaC53cml0ZShzdHIobm93KSkKICAgIGV4Y2VwdCBPU0Vycm9yOgogICAg
ICAgIHBhc3MKCgpkZWYgX3dhdGNoX3NpdGVfcm9vdHMoYXBpX2Jhc2U6IHN0ciwgdG9rZW46IHN0
ciwgYWdlbnRfaWQ6IHN0ciwgdGltZW91dDogaW50KSAtPiBsaXN0W2RpY3Rbc3RyLCBzdHJdXToK
ICAgICMgUHJlZmVycmVkOiBHRVQgL2FwaS9ob3N0L2FnZW50L3dhdGNoLXNpdGVzOyBmYWxsYmFj
azogc2l0ZSBsaXN0IGZyb20KICAgICMgR0VUIC9hcGkvaG9zdC9hZ2VudC9qb2JzIChiYWNrZW5k
IHNoaXBwZWQgcmVxdWVzdC1zY2FuLCBub3Qgd2F0Y2gtc2l0ZXMpLgogICAgd2F0Y2hfdXJsID0g
YXBpX2Jhc2UucnN0cmlwKCIvIikgKyAiL2FwaS9ob3N0L2FnZW50L3dhdGNoLXNpdGVzP2FnZW50
X2lkPSIgKyB1cmxsaWIucGFyc2UucXVvdGUoYWdlbnRfaWQpCiAgICByZXEgPSB1cmxsaWIucmVx
dWVzdC5SZXF1ZXN0KHdhdGNoX3VybCwgbWV0aG9kPSJHRVQiLCBoZWFkZXJzPV9hZ2VudF9oZWFk
ZXJzKHRva2VuKSkKICAgIHRyeToKICAgICAgICB3aXRoIHVybGxpYi5yZXF1ZXN0LnVybG9wZW4o
cmVxLCB0aW1lb3V0PXRpbWVvdXQpIGFzIHJlc3A6CiAgICAgICAgICAgIGJvZHkgPSBqc29uLmxv
YWRzKHJlc3AucmVhZCgpLmRlY29kZSgidXRmLTgiKSkKICAgICAgICBzaXRlcyA9IGJvZHkuZ2V0
KCJzaXRlcyIpIGlmIGlzaW5zdGFuY2UoYm9keSwgZGljdCkgZWxzZSBOb25lCiAgICAgICAgaWYg
aXNpbnN0YW5jZShzaXRlcywgbGlzdCk6CiAgICAgICAgICAgIG91dDogbGlzdFtkaWN0W3N0ciwg
c3RyXV0gPSBbXQogICAgICAgICAgICBmb3Igc2l0ZSBpbiBzaXRlczoKICAgICAgICAgICAgICAg
IGlmIG5vdCBpc2luc3RhbmNlKHNpdGUsIGRpY3QpOgogICAgICAgICAgICAgICAgICAgIGNvbnRp
bnVlCiAgICAgICAgICAgICAgICByb290ID0gc3RyKHNpdGUuZ2V0KCJyb290X3BhdGgiKSBvciAi
IikKICAgICAgICAgICAgICAgIHdhdGNoX29uID0gc2l0ZS5nZXQoIndhdGNoX29uX3dyaXRlIiwg
VHJ1ZSkKICAgICAgICAgICAgICAgIGlmIHJvb3QgYW5kIHdhdGNoX29uIGlzIG5vdCBGYWxzZToK
ICAgICAgICAgICAgICAgICAgICBvdXQuYXBwZW5kKHsic2l0ZV9pZCI6IHN0cihzaXRlLmdldCgi
c2l0ZV9pZCIpIG9yIHNpdGUuZ2V0KCJpZCIpIG9yICIiKSwgInJvb3RfcGF0aCI6IHJvb3R9KQog
ICAgICAgICAgICBpZiBvdXQ6CiAgICAgICAgICAgICAgICByZXR1cm4gb3V0CiAgICBleGNlcHQg
KHVybGxpYi5lcnJvci5VUkxFcnJvciwgdXJsbGliLmVycm9yLkhUVFBFcnJvciwganNvbi5KU09O
RGVjb2RlRXJyb3IsIE9TRXJyb3IpOgogICAgICAgIHBhc3MKICAgIF8sIGpvYnMgPSBmZXRjaF9q
b2JzKGFwaV9iYXNlLCB0b2tlbiwgYWdlbnRfaWQsIHRpbWVvdXQpCiAgICBzZWVuOiBzZXRbc3Ry
XSA9IHNldCgpCiAgICBmYWxsYmFjazogbGlzdFtkaWN0W3N0ciwgc3RyXV0gPSBbXQogICAgZm9y
IGpvYiBpbiBqb2JzOgogICAgICAgIHJvb3QgPSBzdHIoam9iLmdldCgicm9vdF9wYXRoIikgb3Ig
IiIpCiAgICAgICAgaWYgbm90IHJvb3Qgb3Igcm9vdCBpbiBzZWVuOgogICAgICAgICAgICBjb250
aW51ZQogICAgICAgIHNlZW4uYWRkKHJvb3QpCiAgICAgICAgZmFsbGJhY2suYXBwZW5kKHsic2l0
ZV9pZCI6IHN0cihqb2IuZ2V0KCJzaXRlX2lkIikgb3IgIiIpLCAicm9vdF9wYXRoIjogcm9vdH0p
CiAgICByZXR1cm4gZmFsbGJhY2sKCgpkZWYgX3dhdGNoX3Jvb3RzX2Zyb21fZW52KHJhdzogc3Ry
KSAtPiBsaXN0W2RpY3Rbc3RyLCBzdHJdXToKICAgIHNpdGVzOiBsaXN0W2RpY3Rbc3RyLCBzdHJd
XSA9IFtdCiAgICBmb3IgcGFydCBpbiAocmF3IG9yICIiKS5zcGxpdCgiOiIpOgogICAgICAgIHBh
cnQgPSBwYXJ0LnN0cmlwKCkKICAgICAgICBpZiBub3QgcGFydDoKICAgICAgICAgICAgY29udGlu
dWUKICAgICAgICB0cnk6CiAgICAgICAgICAgIHNpdGVzLmFwcGVuZCh7InNpdGVfaWQiOiAiIiwg
InJvb3RfcGF0aCI6IHZhbGlkYXRlX3Jvb3RfcGF0aChwYXJ0KX0pCiAgICAgICAgZXhjZXB0IFZh
bHVlRXJyb3I6CiAgICAgICAgICAgIGNvbnRpbnVlCiAgICByZXR1cm4gc2l0ZXMKCgpkZWYgX2Rp
c2NvdmVyX3dhdGNoX3NpdGVzKGFyZ3M6IGFyZ3BhcnNlLk5hbWVzcGFjZSkgLT4gbGlzdFtkaWN0
W3N0ciwgc3RyXV06CiAgICBpZiBhcmdzLnJvb3RzOgogICAgICAgIHJldHVybiBfd2F0Y2hfcm9v
dHNfZnJvbV9lbnYoYXJncy5yb290cykKICAgIHNpdGVzID0gX3dhdGNoX3NpdGVfcm9vdHMoYXJn
cy5hcGlfYmFzZSwgYXJncy50b2tlbiwgYXJncy5hZ2VudF9pZCwgYXJncy50aW1lb3V0KQogICAg
dmFsaWQ6IGxpc3RbZGljdFtzdHIsIHN0cl1dID0gW10KICAgIHNlZW46IHNldFtzdHJdID0gc2V0
KCkKICAgIGZvciBzaXRlIGluIHNpdGVzOgogICAgICAgIHRyeToKICAgICAgICAgICAgcm9vdCA9
IHZhbGlkYXRlX3Jvb3RfcGF0aChzdHIoc2l0ZS5nZXQoInJvb3RfcGF0aCIpIG9yICIiKSkKICAg
ICAgICBleGNlcHQgVmFsdWVFcnJvcjoKICAgICAgICAgICAgY29udGludWUKICAgICAgICBpZiBy
b290IGluIHNlZW4gb3Igbm90IG9zLnBhdGguaXNkaXIocm9vdCk6CiAgICAgICAgICAgIGNvbnRp
bnVlCiAgICAgICAgc2Vlbi5hZGQocm9vdCkKICAgICAgICB2YWxpZC5hcHBlbmQoeyJzaXRlX2lk
Ijogc3RyKHNpdGUuZ2V0KCJzaXRlX2lkIikgb3IgIiIpLCAicm9vdF9wYXRoIjogcm9vdH0pCiAg
ICBpZiB2YWxpZDoKICAgICAgICByZXR1cm4gdmFsaWQKICAgIHJldHVybiBfd2F0Y2hfcm9vdHNf
ZnJvbV9lbnYob3MuZW52aXJvbi5nZXQoIlNJTkVYSVNfV0FUQ0hfUk9PVFMiLCAiIikpCgoKZGVm
IHBvc3RfcmVxdWVzdF9zY2FuKGFwaV9iYXNlOiBzdHIsIHRva2VuOiBzdHIsIGFnZW50X2lkOiBz
dHIsIHNpdGVfaWQ6IHN0ciwgdGltZW91dDogaW50KSAtPiBzdHI6CiAgICB1cmwgPSBhcGlfYmFz
ZS5yc3RyaXAoIi8iKSArICIvYXBpL2hvc3QvYWdlbnQvcmVxdWVzdC1zY2FuIgogICAgcGF5bG9h
ZCA9IHsiYWdlbnRfaWQiOiBhZ2VudF9pZCwgInNpdGVfaWQiOiBzaXRlX2lkfQogICAgZGF0YSA9
IGpzb24uZHVtcHMocGF5bG9hZCkuZW5jb2RlKCJ1dGYtOCIpCiAgICByZXEgPSB1cmxsaWIucmVx
dWVzdC5SZXF1ZXN0KHVybCwgZGF0YT1kYXRhLCBtZXRob2Q9IlBPU1QiLCBoZWFkZXJzPV9hZ2Vu
dF9oZWFkZXJzKHRva2VuLCBqc29uX2JvZHk9VHJ1ZSkpCiAgICB0cnk6CiAgICAgICAgd2l0aCB1
cmxsaWIucmVxdWVzdC51cmxvcGVuKHJlcSwgdGltZW91dD10aW1lb3V0KSBhcyByZXNwOgogICAg
ICAgICAgICBib2R5ID0ganNvbi5sb2FkcyhyZXNwLnJlYWQoKS5kZWNvZGUoInV0Zi04IikpCiAg
ICBleGNlcHQgKHVybGxpYi5lcnJvci5VUkxFcnJvciwgdXJsbGliLmVycm9yLkhUVFBFcnJvciwg
anNvbi5KU09ORGVjb2RlRXJyb3IsIE9TRXJyb3IpOgogICAgICAgICMgTm8tb3AgZmFsbGJhY2s6
IGRlYm91bmNlZC9jYXBwZWQgKDQyOSksIGVuZHBvaW50IGFic2VudCAoNDA0KSwgb3IKICAgICAg
ICAjIG5ldHdvcmsgZXJyb3IuIENvb2xkb3duIGFscmVhZHkgbWFya2VkOyB0aGUgNS1taW51dGUg
cG9sbCBkcmFpbnMKICAgICAgICAjIHF1ZXVlZCBzY2Fucywgc28gYSBtaXNzZWQgdHJpZ2dlciBp
cyBuZXZlciBsb3N0LgogICAgICAgIHJldHVybiAiIgogICAgaWYgaXNpbnN0YW5jZShib2R5LCBk
aWN0KToKICAgICAgICByZXR1cm4gc3RyKGJvZHkuZ2V0KCJzY2FuX2lkIikgb3IgIiIpCiAgICBy
ZXR1cm4gIiIKCgpkZWYgX2lub3RpZnl3YWl0X2JpbmFyeSgpIC0+IHN0ciB8IE5vbmU6CiAgICBy
ZXR1cm4gc2h1dGlsLndoaWNoKCJpbm90aWZ5d2FpdCIpCgoKZGVmIF93YXRjaF9zY2FuX210aW1l
KHJvb3Q6IHN0cikgLT4gZmxvYXQ6CiAgICBsYXRlc3QgPSAwLjAKICAgIG5maWxlcyA9IDAKICAg
IGZvciBkaXJwYXRoLCBkaXJuYW1lcywgZmlsZW5hbWVzIGluIG9zLndhbGsocm9vdCwgZm9sbG93
bGlua3M9RmFsc2UpOgogICAgICAgIGRpcm5hbWVzWzpdID0gW2QgZm9yIGQgaW4gZGlybmFtZXMg
aWYgZCBub3QgaW4gX1NLSVBfRElSUyBhbmQgIi4uIiBub3QgaW4gZF0KICAgICAgICBmb3IgbmFt
ZSBpbiBmaWxlbmFtZXM6CiAgICAgICAgICAgIG5maWxlcyArPSAxCiAgICAgICAgICAgIGlmIG5m
aWxlcyA+IF9XQVRDSF9NVElNRV9NQVhfREVQVEhfRklMRVM6CiAgICAgICAgICAgICAgICByZXR1
cm4gbGF0ZXN0CiAgICAgICAgICAgIGZ1bGwgPSBvcy5wYXRoLmpvaW4oZGlycGF0aCwgbmFtZSkK
ICAgICAgICAgICAgcmVsID0gb3MucGF0aC5yZWxwYXRoKGZ1bGwsIHJvb3QpLnJlcGxhY2Uob3Mu
c2VwLCAiLyIpCiAgICAgICAgICAgIGlmICIuLiIgaW4gcmVsLnNwbGl0KCIvIikgb3IgX05VTCBp
biByZWw6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICB0cnk6CiAgICAgICAg
ICAgICAgICBzaXplID0gb3MucGF0aC5nZXRzaXplKGZ1bGwpCiAgICAgICAgICAgICAgICBpZiBz
aXplID4gX01BWF9CWVRFUyBvciBzaXplID09IDA6CiAgICAgICAgICAgICAgICAgICAgY29udGlu
dWUKICAgICAgICAgICAgICAgIG10aW1lID0gb3MucGF0aC5nZXRtdGltZShmdWxsKQogICAgICAg
ICAgICBleGNlcHQgT1NFcnJvcjoKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAg
IGlmIG10aW1lID4gbGF0ZXN0OgogICAgICAgICAgICAgICAgbGF0ZXN0ID0gbXRpbWUKICAgIHJl
dHVybiBsYXRlc3QKCgpkZWYgX3dhdGNoX210aW1lX2NoYW5nZWQoc3RhdGVfZGlyOiBzdHIsIGFn
ZW50X2lkOiBzdHIsIHNpdGVfa2V5OiBzdHIsIHJvb3Q6IHN0cikgLT4gYm9vbDoKICAgIGN1cnJl
bnQgPSBfd2F0Y2hfc2Nhbl9tdGltZShyb290KQogICAgcGF0aCA9IF93YXRjaF9tdGltZV9wYXRo
KHN0YXRlX2RpciwgYWdlbnRfaWQsIHNpdGVfa2V5KQogICAgdHJ5OgogICAgICAgIHdpdGggb3Bl
bihwYXRoLCBlbmNvZGluZz0idXRmLTgiKSBhcyBmaDoKICAgICAgICAgICAgcHJldmlvdXMgPSBm
bG9hdCgoZmgucmVhZCgpIG9yICIwIikuc3RyaXAoKSBvciAiMCIpCiAgICBleGNlcHQgKE9TRXJy
b3IsIFZhbHVlRXJyb3IpOgogICAgICAgIHByZXZpb3VzID0gMC4wCiAgICB0cnk6CiAgICAgICAg
b3MubWFrZWRpcnMoc3RhdGVfZGlyLCBtb2RlPTBvNzAwLCBleGlzdF9vaz1UcnVlKQogICAgICAg
IHdpdGggb3BlbihwYXRoLCAidyIsIGVuY29kaW5nPSJ1dGYtOCIpIGFzIGZoOgogICAgICAgICAg
ICBmaC53cml0ZShzdHIoY3VycmVudCkpCiAgICBleGNlcHQgT1NFcnJvcjoKICAgICAgICBwYXNz
CiAgICByZXR1cm4gY3VycmVudCA+IHByZXZpb3VzIGFuZCBwcmV2aW91cyA+IDAKCgpkZWYgX2Zp
cmVfd2F0Y2hfc2l0ZShhcmdzOiBhcmdwYXJzZS5OYW1lc3BhY2UsIHNpdGU6IGRpY3Rbc3RyLCBz
dHJdKSAtPiBpbnQ6CiAgICByb290ID0gc3RyKHNpdGUuZ2V0KCJyb290X3BhdGgiKSBvciAiIikK
ICAgIHNpdGVfaWQgPSBzdHIoc2l0ZS5nZXQoInNpdGVfaWQiKSBvciAiIikKICAgIHRyeToKICAg
ICAgICByb290ID0gdmFsaWRhdGVfcm9vdF9wYXRoKHJvb3QpCiAgICBleGNlcHQgVmFsdWVFcnJv
cjoKICAgICAgICByZXR1cm4gMgogICAgaWYgbm90IG9zLnBhdGguaXNkaXIocm9vdCk6CiAgICAg
ICAgcmV0dXJuIDMKICAgIGlmIG5vdCBzaXRlX2lkOgogICAgICAgIHJldHVybiBydW5fcG9sbChf
cG9sbF9hcmdzX2Zyb21fd2F0Y2goYXJncykpCiAgICBub3cgPSB0aW1lLnRpbWUoKQogICAga2V5
ID0gX3dhdGNoX3NpdGVfa2V5KHNpdGVfaWQsIHJvb3QpCiAgICBpZiBfd2F0Y2hfY29vbGRvd25f
cmVtYWluaW5nKGFyZ3Muc3RhdGVfZGlyLCBhcmdzLmFnZW50X2lkLCBrZXksIGFyZ3MuY29vbGRv
d24sIG5vdykgPiAwOgogICAgICAgIHJldHVybiAwCiAgICBfd2F0Y2hfbWFya19maXJlZChhcmdz
LnN0YXRlX2RpciwgYXJncy5hZ2VudF9pZCwga2V5LCBub3cpCiAgICBzY2FuX2lkID0gcG9zdF9y
ZXF1ZXN0X3NjYW4oYXJncy5hcGlfYmFzZSwgYXJncy50b2tlbiwgYXJncy5hZ2VudF9pZCwgc2l0
ZV9pZCwgYXJncy50aW1lb3V0KQogICAgaWYgc2Nhbl9pZDoKICAgICAgICByZXR1cm4gcnVuKAog
ICAgICAgICAgICBbCiAgICAgICAgICAgICAgICAic2NhbiIsCiAgICAgICAgICAgICAgICAiLS1y
b290IiwKICAgICAgICAgICAgICAgIHJvb3QsCiAgICAgICAgICAgICAgICAiLS1zY2FuLWlkIiwK
ICAgICAgICAgICAgICAgIHNjYW5faWQsCiAgICAgICAgICAgICAgICAiLS1hZ2VudC1pZCIsCiAg
ICAgICAgICAgICAgICBhcmdzLmFnZW50X2lkLAogICAgICAgICAgICAgICAgIi0tYXBpLWJhc2Ui
LAogICAgICAgICAgICAgICAgYXJncy5hcGlfYmFzZSwKICAgICAgICAgICAgICAgICItLXRva2Vu
IiwKICAgICAgICAgICAgICAgIGFyZ3MudG9rZW4sCiAgICAgICAgICAgICAgICAiLS1ydWxlcy1k
aXIiLAogICAgICAgICAgICAgICAgYXJncy5ydWxlc19kaXIsCiAgICAgICAgICAgICAgICAiLS10
aW1lb3V0IiwKICAgICAgICAgICAgICAgIHN0cihhcmdzLnRpbWVvdXQpLAogICAgICAgICAgICBd
CiAgICAgICAgKQogICAgcmV0dXJuIHJ1bl9wb2xsKF9wb2xsX2FyZ3NfZnJvbV93YXRjaChhcmdz
KSkKCgpkZWYgX3BvbGxfYXJnc19mcm9tX3dhdGNoKGFyZ3M6IGFyZ3BhcnNlLk5hbWVzcGFjZSkg
LT4gYXJncGFyc2UuTmFtZXNwYWNlOgogICAgcmV0dXJuIHBhcnNlX2FyZ3MoCiAgICAgICAgWwog
ICAgICAgICAgICAicG9sbCIsCiAgICAgICAgICAgICItLWFnZW50LWlkIiwKICAgICAgICAgICAg
YXJncy5hZ2VudF9pZCwKICAgICAgICAgICAgIi0tYXBpLWJhc2UiLAogICAgICAgICAgICBhcmdz
LmFwaV9iYXNlLAogICAgICAgICAgICAiLS10b2tlbiIsCiAgICAgICAgICAgIGFyZ3MudG9rZW4s
CiAgICAgICAgICAgICItLXJ1bGVzLWRpciIsCiAgICAgICAgICAgIGFyZ3MucnVsZXNfZGlyLAog
ICAgICAgICAgICAiLS10aW1lb3V0IiwKICAgICAgICAgICAgc3RyKGFyZ3MudGltZW91dCksCiAg
ICAgICAgICAgICItLXF1YXJhbnRpbmUtcm9vdCIsCiAgICAgICAgICAgIGFyZ3MucXVhcmFudGlu
ZV9yb290LAogICAgICAgIF0KICAgICkKCgpkZWYgX3dhdGNoX3J1bl9pbm90aWZ5KGFyZ3M6IGFy
Z3BhcnNlLk5hbWVzcGFjZSwgc2l0ZXM6IGxpc3RbZGljdFtzdHIsIHN0cl1dKSAtPiBpbnQ6CiAg
ICBiaW5hcnkgPSBfaW5vdGlmeXdhaXRfYmluYXJ5KCkKICAgIGFzc2VydCBiaW5hcnkgaXMgbm90
IE5vbmUKICAgIHJvb3RzID0gW3NbInJvb3RfcGF0aCJdIGZvciBzIGluIHNpdGVzXQogICAgY21k
ID0gW2JpbmFyeSwgIi1tIiwgIi1yIiwgIi1lIiwgX1dBVENIX0lOT1RJRllfRVZFTlRTLCAiLS1m
b3JtYXQiLCAiJXclZiIsICpyb290c10KICAgIHRyeToKICAgICAgICBwcm9jID0gc3VicHJvY2Vz
cy5Qb3BlbihjbWQsIHN0ZG91dD1zdWJwcm9jZXNzLlBJUEUsIHN0ZGVycj1zdWJwcm9jZXNzLkRF
Vk5VTEwsIHRleHQ9VHJ1ZSkKICAgIGV4Y2VwdCBPU0Vycm9yOgogICAgICAgIHJldHVybiBfd2F0
Y2hfcnVuX210aW1lX29uY2UoYXJncywgc2l0ZXMpCiAgICBhc3NlcnQgcHJvYy5zdGRvdXQgaXMg
bm90IE5vbmUKICAgIHBlbmRpbmc6IGRpY3Rbc3RyLCBmbG9hdF0gPSB7fQogICAgZGVib3VuY2Ug
PSBtYXgoMCwgYXJncy5kZWJvdW5jZSkKICAgIHRyeToKICAgICAgICB3aGlsZSBUcnVlOgogICAg
ICAgICAgICByZWFkeSwgXywgXyA9IHNlbGVjdC5zZWxlY3QoW3Byb2Muc3Rkb3V0XSwgW10sIFtd
LCA1LjApCiAgICAgICAgICAgIG5vd19tb25vdG9uaWMgPSB0aW1lLm1vbm90b25pYygpCiAgICAg
ICAgICAgIGVvZiA9IEZhbHNlCiAgICAgICAgICAgIGlmIHJlYWR5OgogICAgICAgICAgICAgICAg
bGluZSA9IHByb2Muc3Rkb3V0LnJlYWRsaW5lKCkKICAgICAgICAgICAgICAgIGlmIGxpbmUgPT0g
IiI6CiAgICAgICAgICAgICAgICAgICAgZW9mID0gVHJ1ZQogICAgICAgICAgICAgICAgZWxzZToK
ICAgICAgICAgICAgICAgICAgICBjaGFuZ2VkID0gbGluZS5zdHJpcCgpCiAgICAgICAgICAgICAg
ICAgICAgaWYgY2hhbmdlZCBhbmQgX05VTCBub3QgaW4gY2hhbmdlZDoKICAgICAgICAgICAgICAg
ICAgICAgICAgZm9yIHNpdGUgaW4gc2l0ZXM6CiAgICAgICAgICAgICAgICAgICAgICAgICAgICBy
b290ID0gc2l0ZVsicm9vdF9wYXRoIl0KICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIGNo
YW5nZWQgPT0gcm9vdCBvciBjaGFuZ2VkLnN0YXJ0c3dpdGgocm9vdCArIG9zLnNlcCk6CiAgICAg
ICAgICAgICAgICAgICAgICAgICAgICAgICAgcGVuZGluZ1tyb290XSA9IG5vd19tb25vdG9uaWMK
ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhawogICAgICAgICAgICBmaXJlZDog
bGlzdFtkaWN0W3N0ciwgc3RyXV0gPSBbXQogICAgICAgICAgICBmb3Igc2l0ZSBpbiBzaXRlczoK
ICAgICAgICAgICAgICAgIGxhc3QgPSBwZW5kaW5nLmdldChzaXRlWyJyb290X3BhdGgiXSkKICAg
ICAgICAgICAgICAgIGlmIGxhc3QgaXMgbm90IE5vbmUgYW5kIChub3dfbW9ub3RvbmljIC0gbGFz
dCkgPj0gZGVib3VuY2U6CiAgICAgICAgICAgICAgICAgICAgZmlyZWQuYXBwZW5kKHNpdGUpCiAg
ICAgICAgICAgICAgICAgICAgZGVsIHBlbmRpbmdbc2l0ZVsicm9vdF9wYXRoIl1dCiAgICAgICAg
ICAgIGZvciBzaXRlIGluIGZpcmVkOgogICAgICAgICAgICAgICAgX2ZpcmVfd2F0Y2hfc2l0ZShh
cmdzLCBzaXRlKQogICAgICAgICAgICBpZiBlb2Y6CiAgICAgICAgICAgICAgICBicmVhawogICAg
ICAgICAgICBpZiBhcmdzLndhdGNoX29uY2UgYW5kIGRlYm91bmNlID09IDAgYW5kIHBlbmRpbmc6
CiAgICAgICAgICAgICAgICBmb3Igc2l0ZSBpbiBbcyBmb3IgcyBpbiBzaXRlcyBpZiBzWyJyb290
X3BhdGgiXSBpbiBwZW5kaW5nXToKICAgICAgICAgICAgICAgICAgICBfZmlyZV93YXRjaF9zaXRl
KGFyZ3MsIHNpdGUpCiAgICAgICAgICAgICAgICBicmVhawogICAgZmluYWxseToKICAgICAgICB0
cnk6CiAgICAgICAgICAgIHByb2MudGVybWluYXRlKCkKICAgICAgICBleGNlcHQgT1NFcnJvcjoK
ICAgICAgICAgICAgcGFzcwogICAgcmV0dXJuIDAKCgpkZWYgX3dhdGNoX3J1bl9tdGltZV9vbmNl
KGFyZ3M6IGFyZ3BhcnNlLk5hbWVzcGFjZSwgc2l0ZXM6IGxpc3RbZGljdFtzdHIsIHN0cl1dKSAt
PiBpbnQ6CiAgICB3b3JzdCA9IDAKICAgIGZvciBzaXRlIGluIHNpdGVzOgogICAgICAgIGtleSA9
IF93YXRjaF9zaXRlX2tleShzdHIoc2l0ZS5nZXQoInNpdGVfaWQiKSBvciAiIiksIHNpdGVbInJv
b3RfcGF0aCJdKQogICAgICAgIGlmIF93YXRjaF9tdGltZV9jaGFuZ2VkKGFyZ3Muc3RhdGVfZGly
LCBhcmdzLmFnZW50X2lkLCBrZXksIHNpdGVbInJvb3RfcGF0aCJdKToKICAgICAgICAgICAgcmMg
PSBfZmlyZV93YXRjaF9zaXRlKGFyZ3MsIHNpdGUpCiAgICAgICAgICAgIGlmIHJjIG5vdCBpbiAo
MCwgMiwgMyk6CiAgICAgICAgICAgICAgICB3b3JzdCA9IHJjCiAgICByZXR1cm4gd29yc3QKCgpk
ZWYgX3dhdGNoX3J1bl9tdGltZV9sb29wKGFyZ3M6IGFyZ3BhcnNlLk5hbWVzcGFjZSwgc2l0ZXM6
IGxpc3RbZGljdFtzdHIsIHN0cl1dKSAtPiBpbnQ6CiAgICB3aGlsZSBUcnVlOgogICAgICAgIF93
YXRjaF9ydW5fbXRpbWVfb25jZShhcmdzLCBzaXRlcykKICAgICAgICBpZiBhcmdzLndhdGNoX29u
Y2U6CiAgICAgICAgICAgIGJyZWFrCiAgICAgICAgdGltZS5zbGVlcChfV0FUQ0hfTVRJTUVfU1dF
RVBfU0VDT05EUykKICAgIHJldHVybiAwCgoKZGVmIHJ1bl93YXRjaChhcmdzOiBhcmdwYXJzZS5O
YW1lc3BhY2UpIC0+IGludDoKICAgIGlmIG5vdCBhcmdzLmFwaV9iYXNlIG9yIG5vdCBhcmdzLnRv
a2VuIG9yIG5vdCBhcmdzLmFnZW50X2lkOgogICAgICAgIHJldHVybiA0CiAgICBpZiBhcmdzLmRl
Ym91bmNlIDwgMCBvciBhcmdzLmNvb2xkb3duIDwgMDoKICAgICAgICByZXR1cm4gMgogICAgc2l0
ZXMgPSBfZGlzY292ZXJfd2F0Y2hfc2l0ZXMoYXJncykKICAgIGlmIG5vdCBzaXRlczoKICAgICAg
ICByZXR1cm4gMAogICAgbG9ja19wYXRoID0gX3dhdGNoX2xvY2tfcGF0aChhcmdzLmFnZW50X2lk
KQogICAgdHJ5OgogICAgICAgIG9zLm1ha2VkaXJzKG9zLnBhdGguZGlybmFtZShsb2NrX3BhdGgp
LCBtb2RlPTBvNzAwLCBleGlzdF9vaz1UcnVlKQogICAgICAgIGxvY2tfZmQgPSBvcy5vcGVuKGxv
Y2tfcGF0aCwgb3MuT19DUkVBVCB8IG9zLk9fUkRXUiwgMG82MDApCiAgICBleGNlcHQgT1NFcnJv
cjoKICAgICAgICBsb2NrX2ZkID0gTm9uZQogICAgaWYgbG9ja19mZCBpcyBub3QgTm9uZToKICAg
ICAgICB0cnk6CiAgICAgICAgICAgIGZjbnRsLmZsb2NrKGxvY2tfZmQsIGZjbnRsLkxPQ0tfRVgg
fCBmY250bC5MT0NLX05CKQogICAgICAgIGV4Y2VwdCBPU0Vycm9yOgogICAgICAgICAgICBvcy5j
bG9zZShsb2NrX2ZkKQogICAgICAgICAgICByZXR1cm4gMAogICAgdHJ5OgogICAgICAgIGlmIF9p
bm90aWZ5d2FpdF9iaW5hcnkoKSBpcyBub3QgTm9uZToKICAgICAgICAgICAgaWYgYXJncy53YXRj
aF9vbmNlOgogICAgICAgICAgICAgICAgcmV0dXJuIF93YXRjaF9ydW5fbXRpbWVfb25jZShhcmdz
LCBzaXRlcykKICAgICAgICAgICAgcmV0dXJuIF93YXRjaF9ydW5faW5vdGlmeShhcmdzLCBzaXRl
cykKICAgICAgICByZXR1cm4gX3dhdGNoX3J1bl9tdGltZV9sb29wKGFyZ3MsIHNpdGVzKQogICAg
ZmluYWxseToKICAgICAgICBpZiBsb2NrX2ZkIGlzIG5vdCBOb25lOgogICAgICAgICAgICB0cnk6
CiAgICAgICAgICAgICAgICBmY250bC5mbG9jayhsb2NrX2ZkLCBmY250bC5MT0NLX1VOKQogICAg
ICAgICAgICBleGNlcHQgT1NFcnJvcjoKICAgICAgICAgICAgICAgIHBhc3MKICAgICAgICAgICAg
b3MuY2xvc2UobG9ja19mZCkKCgpkZWYgcnVuX3BvbGwoYXJnczogYXJncGFyc2UuTmFtZXNwYWNl
KSAtPiBpbnQ6CiAgICBpZiBub3QgYXJncy5hcGlfYmFzZSBvciBub3QgYXJncy50b2tlbiBvciBu
b3QgYXJncy5hZ2VudF9pZDoKICAgICAgICByZXR1cm4gNAogICAgZmV0Y2hfam9icyhhcmdzLmFw
aV9iYXNlLCBhcmdzLnRva2VuLCBhcmdzLmFnZW50X2lkLCBhcmdzLnRpbWVvdXQpCiAgICBsb2Nr
X3BhdGggPSBfcG9sbF9sb2NrX3BhdGgoYXJncy5hZ2VudF9pZCkKICAgIHRyeToKICAgICAgICBv
cy5tYWtlZGlycyhvcy5wYXRoLmRpcm5hbWUobG9ja19wYXRoKSwgbW9kZT0wbzcwMCwgZXhpc3Rf
b2s9VHJ1ZSkKICAgICAgICBsb2NrX2ZkID0gb3Mub3Blbihsb2NrX3BhdGgsIG9zLk9fQ1JFQVQg
fCBvcy5PX1JEV1IsIDBvNjAwKQogICAgZXhjZXB0IE9TRXJyb3I6CiAgICAgICAgbG9ja19mZCA9
IE5vbmUKICAgIGlmIGxvY2tfZmQgaXMgbm90IE5vbmU6CiAgICAgICAgdHJ5OgogICAgICAgICAg
ICBmY250bC5mbG9jayhsb2NrX2ZkLCBmY250bC5MT0NLX0VYIHwgZmNudGwuTE9DS19OQikKICAg
ICAgICBleGNlcHQgT1NFcnJvcjoKICAgICAgICAgICAgb3MuY2xvc2UobG9ja19mZCkKICAgICAg
ICAgICAgcmV0dXJuIDAKICAgIHRyeToKICAgICAgICBkZWFkbGluZSA9IHRpbWUubW9ub3Rvbmlj
KCkgKyA5MAogICAgICAgIGZvciBfIGluIHJhbmdlKDQwKToKICAgICAgICAgICAgbl9yYXcsIF9y
YyA9IF9ydW5fcG9sbF9qb2JzKGFyZ3MpCiAgICAgICAgICAgIGlmIG5fcmF3IDwgNSBvciB0aW1l
Lm1vbm90b25pYygpID49IGRlYWRsaW5lOgogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICBt
YXliZV9wb3N0X3dhZl9ldmVudHMoYXJncykKICAgICAgICByZXR1cm4gMAogICAgZmluYWxseToK
ICAgICAgICBpZiBsb2NrX2ZkIGlzIG5vdCBOb25lOgogICAgICAgICAgICB0cnk6CiAgICAgICAg
ICAgICAgICBmY250bC5mbG9jayhsb2NrX2ZkLCBmY250bC5MT0NLX1VOKQogICAgICAgICAgICBl
eGNlcHQgT1NFcnJvcjoKICAgICAgICAgICAgICAgIHBhc3MKICAgICAgICAgICAgb3MuY2xvc2Uo
bG9ja19mZCkKCgpkZWYgX3J1bl9wb2xsX2pvYnMoYXJnczogYXJncGFyc2UuTmFtZXNwYWNlKSAt
PiB0dXBsZVtpbnQsIGludF06CiAgICBuX3Jhdywgam9icyA9IGZldGNoX2pvYnMoYXJncy5hcGlf
YmFzZSwgYXJncy50b2tlbiwgYXJncy5hZ2VudF9pZCwgYXJncy50aW1lb3V0KQogICAgam9icy5z
b3J0KGtleT1sYW1iZGEgajogMCBpZiAoai5nZXQoImtpbmQiKSBvciAiIikgaW4gKCJxdWFyYW50
aW5lIiwgInJlc3RvcmUiKSBlbHNlIDEpCiAgICB3b3JzdCA9IDAKICAgIGZvciBqb2IgaW4gam9i
czoKICAgICAgICBraW5kID0gam9iLmdldCgia2luZCIpIG9yICJzY2FuIgogICAgICAgIGlmIGtp
bmQgPT0gInNjYW4iOgogICAgICAgICAgICByYyA9IHJ1bigKICAgICAgICAgICAgICAgIFsKICAg
ICAgICAgICAgICAgICAgICAic2NhbiIsCiAgICAgICAgICAgICAgICAgICAgIi0tcm9vdCIsCiAg
ICAgICAgICAgICAgICAgICAgam9iWyJyb290X3BhdGgiXSwKICAgICAgICAgICAgICAgICAgICAi
LS1zY2FuLWlkIiwKICAgICAgICAgICAgICAgICAgICBqb2JbInNjYW5faWQiXSwKICAgICAgICAg
ICAgICAgICAgICAiLS1hZ2VudC1pZCIsCiAgICAgICAgICAgICAgICAgICAgYXJncy5hZ2VudF9p
ZCwKICAgICAgICAgICAgICAgICAgICAiLS1hcGktYmFzZSIsCiAgICAgICAgICAgICAgICAgICAg
YXJncy5hcGlfYmFzZSwKICAgICAgICAgICAgICAgICAgICAiLS10b2tlbiIsCiAgICAgICAgICAg
ICAgICAgICAgYXJncy50b2tlbiwKICAgICAgICAgICAgICAgICAgICAiLS1ydWxlcy1kaXIiLAog
ICAgICAgICAgICAgICAgICAgIGFyZ3MucnVsZXNfZGlyLAogICAgICAgICAgICAgICAgICAgICIt
LXRpbWVvdXQiLAogICAgICAgICAgICAgICAgICAgIHN0cihhcmdzLnRpbWVvdXQpLAogICAgICAg
ICAgICAgICAgXQogICAgICAgICAgICApCiAgICAgICAgZWxzZToKICAgICAgICAgICAgYXJndiA9
IFsKICAgICAgICAgICAgICAgIGtpbmQsCiAgICAgICAgICAgICAgICAiLS1yb290IiwKICAgICAg
ICAgICAgICAgIGpvYlsicm9vdF9wYXRoIl0sCiAgICAgICAgICAgICAgICAiLS1yZWwtcGF0aCIs
CiAgICAgICAgICAgICAgICBqb2JbInJlbF9wYXRoIl0sCiAgICAgICAgICAgICAgICAiLS1zaXRl
LWlkIiwKICAgICAgICAgICAgICAgIGpvYlsic2l0ZV9pZCJdLAogICAgICAgICAgICAgICAgIi0t
ZGVzdC1iYXNlbmFtZSIsCiAgICAgICAgICAgICAgICBqb2JbImRlc3RfYmFzZW5hbWUiXSwKICAg
ICAgICAgICAgICAgICItLXF1YXJhbnRpbmUtcm9vdCIsCiAgICAgICAgICAgICAgICBhcmdzLnF1
YXJhbnRpbmVfcm9vdCwKICAgICAgICAgICAgXQogICAgICAgICAgICByYyA9IHJ1bihhcmd2KQog
ICAgICAgICAgICBhY2tfb2sgPSByYyA9PSAwCiAgICAgICAgICAgIGVyciA9ICIiIGlmIGFja19v
ayBlbHNlIGYiaGVscGVyIGV4aXQge3JjfSIKICAgICAgICAgICAgcG9zdF9jb21tYW5kX2FjaygK
ICAgICAgICAgICAgICAgIGFyZ3MuYXBpX2Jhc2UsIGFyZ3MudG9rZW4sIGFyZ3MuYWdlbnRfaWQs
IGpvYlsiY29tbWFuZF9pZCJdLCBhY2tfb2ssIGVyciwgYXJncy50aW1lb3V0CiAgICAgICAgICAg
ICkKICAgICAgICBpZiByYyAhPSAwOgogICAgICAgICAgICB3b3JzdCA9IHJjCiAgICByZXR1cm4g
bl9yYXcsIHdvcnN0CgoKZGVmIHJ1bihhcmd2OiBsaXN0W3N0cl0gfCBOb25lID0gTm9uZSkgLT4g
aW50OgogICAgYXJncyA9IHBhcnNlX2FyZ3MoYXJndikKICAgIGlmIGFyZ3MuYWN0aW9uID09ICJx
dWFyYW50aW5lIjoKICAgICAgICByZXR1cm4gcnVuX3F1YXJhbnRpbmUoYXJncykKICAgIGlmIGFy
Z3MuYWN0aW9uID09ICJyZXN0b3JlIjoKICAgICAgICByZXR1cm4gcnVuX3Jlc3RvcmUoYXJncykK
ICAgIGlmIGFyZ3MuYWN0aW9uID09ICJwb2xsIjoKICAgICAgICByZXR1cm4gcnVuX3BvbGwoYXJn
cykKICAgIGlmIGFyZ3MuYWN0aW9uID09ICJ3YXRjaCI6CiAgICAgICAgcmV0dXJuIHJ1bl93YXRj
aChhcmdzKQogICAgaWYgbm90IGFyZ3Muc2Nhbl9pZCBvciBub3QgYXJncy5hZ2VudF9pZDoKICAg
ICAgICByZXR1cm4gNAogICAgdHJ5OgogICAgICAgIHJvb3QgPSB2YWxpZGF0ZV9yb290X3BhdGgo
YXJncy5yb290KQogICAgZXhjZXB0IFZhbHVlRXJyb3I6CiAgICAgICAgcmV0dXJuIDIKICAgIGlm
IG5vdCBvcy5wYXRoLmlzZGlyKHJvb3QpOgogICAgICAgIHJldHVybiAzCiAgICBkZWFkbGluZSA9
IHRpbWUubW9ub3RvbmljKCkgKyBtYXgoMSwgYXJncy50aW1lb3V0KQogICAgcGFjayA9IGxvYWRf
c2lnbmF0dXJlX3BhY2soUGF0aChhcmdzLnJ1bGVzX2RpcikpCiAgICBpZGVudF9tYXAgPSB7CiAg
ICAgICAgc3RyKHNwZWMuZ2V0KCJpZGVudCIpIG9yICIiKTogKHN0cihzcGVjWyJydWxlX2lkIl0p
LCBzdHIoc3BlY1siaGl0X2NsYXNzIl0pKSBmb3Igc3BlYyBpbiBwYWNrIGlmIHNwZWMuZ2V0KCJp
ZGVudCIpCiAgICB9CiAgICBwYWNrX3BhdGggPSBQYXRoKGFyZ3MucnVsZXNfZGlyKSAvICJwaHBf
d2Vic2hlbGwueWFyIgogICAgcmVtYWluID0gaW50KGRlYWRsaW5lIC0gdGltZS5tb25vdG9uaWMo
KSkKICAgIHlhcmFfaGl0czogbGlzdFtkaWN0W3N0ciwgc3RyXV0gfCBOb25lID0gTm9uZQogICAg
aWYgeWFyYV9hdmFpbGFibGUoKSBhbmQgX3lhcmFfY29tcGlsZV9vayhwYWNrX3BhdGgsIG1pbihy
ZW1haW4sIDE1KSk6CiAgICAgICAgcmVtYWluID0gaW50KGRlYWRsaW5lIC0gdGltZS5tb25vdG9u
aWMoKSkKICAgICAgICB5YXJhX2hpdHMgPSBzY2FuX3lhcmFfY2xpKHJvb3QsIHBhY2tfcGF0aCwg
aWRlbnRfbWFwLCByZW1haW4pCiAgICBpZiB5YXJhX2hpdHMgaXMgbm90IE5vbmU6CiAgICAgICAg
ZmluZGluZ3MgPSB5YXJhX2hpdHMKICAgICAgICBlbmdpbmUgPSAieWFyYSIKICAgIGVsc2U6CiAg
ICAgICAgZmluZGluZ3MgPSBzY2FuX25lZWRsZXMocm9vdCwgcGFjaykKICAgICAgICBlbmdpbmUg
PSAibmVlZGxlcyIKICAgIHJlbWFpbiA9IGludChkZWFkbGluZSAtIHRpbWUubW9ub3RvbmljKCkp
CiAgICBjbGFtX2hpdHMgPSBzY2FuX2NsYW0ocm9vdCwgcmVtYWluKQogICAgcGF5bG9hZCA9IHsK
ICAgICAgICAic2Nhbl9pZCI6IGFyZ3Muc2Nhbl9pZCwKICAgICAgICAiYWdlbnRfaWQiOiBhcmdz
LmFnZW50X2lkLAogICAgICAgICJlbmdpbmUiOiBlbmdpbmUsCiAgICAgICAgImZpbmRpbmdzIjog
ZmluZGluZ3MsCiAgICB9CiAgICBjbGFtX3BheWxvYWQgPSB7CiAgICAgICAgInNjYW5faWQiOiBh
cmdzLnNjYW5faWQsCiAgICAgICAgImFnZW50X2lkIjogYXJncy5hZ2VudF9pZCwKICAgICAgICAi
ZW5naW5lIjogImNsYW0iLAogICAgICAgICJmaW5kaW5ncyI6IGNsYW1faGl0cywKICAgIH0KICAg
IGlmIGFyZ3MuanNvbl9vdXQ6CiAgICAgICAgZHVtcCA9IGRpY3QocGF5bG9hZCkKICAgICAgICBp
ZiBjbGFtX2hpdHM6CiAgICAgICAgICAgIGR1bXBbImNsYW1fZmluZGluZ3MiXSA9IGNsYW1faGl0
cwogICAgICAgIFBhdGgoYXJncy5qc29uX291dCkud3JpdGVfdGV4dChqc29uLmR1bXBzKGR1bXAp
LCBlbmNvZGluZz0idXRmLTgiKQogICAgaWYgYXJncy5kcnlfcnVuOgogICAgICAgIHJldHVybiAw
CiAgICBpZiBub3QgYXJncy5hcGlfYmFzZSBvciBub3QgYXJncy50b2tlbjoKICAgICAgICByZXR1
cm4gNAogICAgc3RhdHVzID0gcG9zdF9yZXN1bHRzKGFyZ3MuYXBpX2Jhc2UsIGFyZ3MudG9rZW4s
IHBheWxvYWQsIGFyZ3MudGltZW91dCkKICAgIGlmIHN0YXR1cyA+PSA0MDA6CiAgICAgICAgcmV0
dXJuIDUKICAgIGlmIGNsYW1faGl0czoKICAgICAgICBjc3RhdHVzID0gcG9zdF9yZXN1bHRzKGFy
Z3MuYXBpX2Jhc2UsIGFyZ3MudG9rZW4sIGNsYW1fcGF5bG9hZCwgYXJncy50aW1lb3V0KQogICAg
ICAgIGlmIGNzdGF0dXMgPj0gNDAwOgogICAgICAgICAgICByZXR1cm4gNQogICAgcmV0dXJuIDAK
CgpkZWYgbWFpbigpIC0+IE5vbmU6CiAgICBuaWNlID0gc2h1dGlsLndoaWNoKCJuaWNlIikKICAg
IGlmIG5pY2UgYW5kIG9zLmVudmlyb24uZ2V0KCJTSU5FWElTX0hPU1RfU0NBTl9OSUNFIiwgIjEi
KSA9PSAiMSIgYW5kICJTSU5FWElTX0hPU1RfU0NBTl9JTk5FUiIgbm90IGluIG9zLmVudmlyb246
CiAgICAgICAgZW52ID0gb3MuZW52aXJvbi5jb3B5KCkKICAgICAgICBlbnZbIlNJTkVYSVNfSE9T
VF9TQ0FOX0lOTkVSIl0gPSAiMSIKICAgICAgICByYWlzZSBTeXN0ZW1FeGl0KAogICAgICAgICAg
ICBzdWJwcm9jZXNzLmNhbGwoCiAgICAgICAgICAgICAgICBbbmljZSwgIi1uIiwgIjE1Iiwgc3lz
LmV4ZWN1dGFibGUsIHN0cihQYXRoKF9fZmlsZV9fKS5yZXNvbHZlKCkpLCAqc3lzLmFyZ3ZbMTpd
XSwKICAgICAgICAgICAgICAgIGVudj1lbnYsCiAgICAgICAgICAgICkKICAgICAgICApCiAgICBy
YWlzZSBTeXN0ZW1FeGl0KHJ1bigpKQoKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICBt
YWluKCkK'
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
SINEXIS_B64_WATCH='W1VuaXRdCkRlc2NyaXB0aW9uPVNpbmV4aXMgSG9zdCBQcm90ZWN0IG9uLWJveCBvbi13cml0ZSB3
YXRjaCAoJWkpClJlcXVpcmVzPXdhenVoLWFnZW50LnNlcnZpY2UKQWZ0ZXI9d2F6dWgtYWdlbnQu
c2VydmljZQpTdGFydExpbWl0SW50ZXJ2YWxTZWM9MAoKW1NlcnZpY2VdClR5cGU9c2ltcGxlCk5p
Y2U9MTUKUmVzdGFydD1hbHdheXMKUmVzdGFydFNlYz0xMApFbnZpcm9ubWVudEZpbGU9LS9ldGMv
c2luZXhpcy9ob3N0LXByb3RlY3QuZW52CkV4ZWNTdGFydD0vdXNyL2Jpbi9weXRob24zIC91c3Iv
bGliL3NpbmV4aXMvaG9zdC1wcm90ZWN0L3NpbmV4aXNfaG9zdF9zY2FuLnB5IHdhdGNoIC0tYWdl
bnQtaWQgJWkKVXNlcj1yb290Ck5vTmV3UHJpdmlsZWdlcz10cnVlClByb3RlY3RTeXN0ZW09c3Ry
aWN0ClJlYWRXcml0ZVBhdGhzPS92YXIvbGliL3NpbmV4aXMgL3Zhci93d3cgLS9zcnYvd3d3IC9o
b21lClByaXZhdGVUbXA9dHJ1ZQpQcml2YXRlRGV2aWNlcz10cnVlClByb3RlY3RLZXJuZWxUdW5h
Ymxlcz10cnVlClByb3RlY3RDb250cm9sR3JvdXBzPXRydWUKUmVzdHJpY3RTVUlEU0dJRD10cnVl
CkxvY2tQZXJzb25hbGl0eT10cnVlClJlc3RyaWN0UmVhbHRpbWU9dHJ1ZQpSZXN0cmljdEFkZHJl
c3NGYW1pbGllcz1BRl9VTklYIEFGX0lORVQgQUZfSU5FVDYKU3lzdGVtQ2FsbEFyY2hpdGVjdHVy
ZXM9bmF0aXZlCgpbSW5zdGFsbF0KV2FudGVkQnk9bXVsdGktdXNlci50YXJnZXQK'


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
