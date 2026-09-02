#!/usr/bin/env bash
# Sinexis Host Protect helper wrapper (P14 C2).
# Not curl|bash. Does not install wazuh-agent. Does not enroll Guard.
# Usage: sudo ./sinexis-install.sh --agent-id <uuid> --token-file /path --api-base https://sinexis.app
#        sudo ./sinexis-install.sh --interactive
#        ./sinexis-install.sh --dry-run --agent-id ... --token-file ...
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_BASE="${SINEXIS_API_BASE:-https://sinexis.app}"
AGENT_ID="${SINEXIS_AGENT_ID:-}"
TOKEN_FILE=""
TOKEN_VALUE=""
DEB_PATH=""
DRY_RUN=0
INTERACTIVE=0
ENABLE_TIMER=1
SKIP_WAZUH_CHECK=0
QUARANTINE_ROOT="/var/lib/sinexis/quarantine"
ENV_PATH="/etc/sinexis/host-protect.env"
LIB_DIR="/usr/lib/sinexis/host-protect"
UNIT_DST="/usr/lib/systemd/system"

usage() {
  cat <<'EOF'
sinexis-install.sh — Host Protect helper (not Guard enroll, not wazuh-agent)

Required (non-interactive):
  --agent-id UUID          Guard agent UUID from SPA /guard
  --token-file PATH        File containing X-Host-Agent-Token (mode 600 recommended)
  --api-base URL           Default https://sinexis.app

Optional:
  --deb PATH               dpkg -i this .deb (must Depend wazuh-agent)
  --from-tree              Copy files from this packaging directory (default if no --deb)
  --dry-run                Print actions; do not write /etc or enable units
  --interactive            Prompt for missing id/token/api-base on a TTY
  --no-timer               Install files/env only
  --skip-wazuh-check       Lab only — do not use on customer VPS
  --help

Does not: curl|bash, install wazuh-agent, wipe ERP, print the token.
EOF
}

log() { printf '%s\n' "$*" >&2; }

die() {
  log "error: $*"
  exit 1
}

is_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
}

need_root() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  [[ "$(id -u)" -eq 0 ]] || die "run as root (or pass --dry-run)"
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
  die "wazuh-agent is not active. Enroll Guard first (/guide). This script does not install wazuh-agent."
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

FROM_TREE=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent-id)
      AGENT_ID="${2:-}"
      shift 2
      ;;
    --token-file)
      TOKEN_FILE="${2:-}"
      shift 2
      ;;
    --api-base)
      API_BASE="${2:-}"
      shift 2
      ;;
    --deb)
      DEB_PATH="${2:-}"
      FROM_TREE=0
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
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

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
else
  [[ -f "$SCRIPT_DIR/sinexis_host_scan.py" ]] || die "run from packaging/host-protect-helper (missing sinexis_host_scan.py)"
  copy_tree "$LIB_DIR" "$UNIT_DST"
fi

write_env
enable_timer
log "ok: helper configured for agent ${AGENT_ID} (token not printed)"
exit 0
