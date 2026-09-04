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
DO_WAZUH=0
DO_HELPER=0
DO_WAF_SNIPPET=0
WAF_SNIPPET_PATH="/etc/nginx/sinexis-waf.snippet.conf"
MANAGER_HOST=""
QUARANTINE_ROOT="/var/lib/sinexis/quarantine"
ENV_PATH="/etc/sinexis/host-protect.env"
LIB_DIR="/usr/lib/sinexis/host-protect"
UNIT_DST="/usr/lib/systemd/system"

usage() {
  cat <<'EOF'
sinexis-install.sh — one file (not curl|bash)

TTY (default, no flags): menu
  1) Install wazuh-agent (package + Manager address)
  2) Configure Host Protect helper (payloads in this file)
  3) Both (1+2)
  4) Write Host WAF nginx snippet file (no include, no reload)
  5) Quit

Non-interactive:
  --install-wazuh-agent --manager-host HOST
  --configure-host-protect --agent-id UUID --token-file PATH [--api-base URL]
  --write-waf-snippet [--waf-snippet-path PATH]

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
  --help

Does not: curl|bash, enroll Guard, print the token, wipe ERP.
Does not: include the WAF snippet into a vhost, nginx -t, reload nginx,
          or paste onto sinexis.app edge.
EOF
}

log() { printf '%s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

is_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
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

configure_host_protect() {
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

write_waf_snippet() {
  local dest="$WAF_SNIPPET_PATH"
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
'
EOF
  chmod 644 "$dest"
  log "ok: wrote ${dest}. Include it in the customer site vhost yourself. No nginx reload."
}

show_menu() {
  [[ -t 0 ]] || die "no flags and no TTY — pass --install-wazuh-agent, --configure-host-protect, and/or --write-waf-snippet"
  echo "Sinexis installer"
  echo "  1) Install wazuh-agent"
  echo "  2) Configure Host Protect helper"
  echo "  3) Both (1+2)"
  echo "  4) Write Host WAF nginx snippet (file only; no include/reload)"
  echo "  5) Quit"
  read -r -p "Choice [1-5]: " _c
  case "$_c" in
    1) DO_WAZUH=1 ;;
    2) DO_HELPER=1; INTERACTIVE=1 ;;
    3) DO_WAZUH=1; DO_HELPER=1; INTERACTIVE=1 ;;
    4) DO_WAF_SNIPPET=1 ;;
    5) exit 0 ;;
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
CgpkZWYgcG9zdF9yZXN1bHRzKGFwaV9iYXNlOiBzdHIsIHRva2VuOiBzdHIsIHBheWxvYWQ6IGRp
Y3Rbc3RyLCBvYmplY3RdLCB0aW1lb3V0OiBpbnQpIC0+IGludDoKICAgIHVybCA9IGFwaV9iYXNl
LnJzdHJpcCgiLyIpICsgIi9hcGkvaG9zdC9hZ2VudC9yZXN1bHRzIgogICAgZGF0YSA9IGpzb24u
ZHVtcHMocGF5bG9hZCkuZW5jb2RlKCJ1dGYtOCIpCiAgICByZXEgPSB1cmxsaWIucmVxdWVzdC5S
ZXF1ZXN0KAogICAgICAgIHVybCwKICAgICAgICBkYXRhPWRhdGEsCiAgICAgICAgbWV0aG9kPSJQ
T1NUIiwKICAgICAgICBoZWFkZXJzPV9hZ2VudF9oZWFkZXJzKHRva2VuLCBqc29uX2JvZHk9VHJ1
ZSksCiAgICApCiAgICB0cnk6CiAgICAgICAgd2l0aCB1cmxsaWIucmVxdWVzdC51cmxvcGVuKHJl
cSwgdGltZW91dD10aW1lb3V0KSBhcyByZXNwOgogICAgICAgICAgICByZXR1cm4gaW50KGdldGF0
dHIocmVzcCwgInN0YXR1cyIsIDIwMCkgb3IgMjAwKQogICAgZXhjZXB0IHVybGxpYi5lcnJvci5I
VFRQRXJyb3IgYXMgZXhjOgogICAgICAgIHJldHVybiBpbnQoZXhjLmNvZGUpCgoKZGVmIHBvc3Rf
Y29tbWFuZF9hY2soCiAgICBhcGlfYmFzZTogc3RyLCB0b2tlbjogc3RyLCBhZ2VudF9pZDogc3Ry
LCBjb21tYW5kX2lkOiBzdHIsIG9rOiBib29sLCBlcnJvcjogc3RyLCB0aW1lb3V0OiBpbnQKKSAt
PiBpbnQ6CiAgICB1cmwgPSBhcGlfYmFzZS5yc3RyaXAoIi8iKSArICIvYXBpL2hvc3QvYWdlbnQv
Y29tbWFuZHMvYWNrIgogICAgcGF5bG9hZCA9IHsiY29tbWFuZF9pZCI6IGNvbW1hbmRfaWQsICJh
Z2VudF9pZCI6IGFnZW50X2lkLCAib2siOiBvaywgImVycm9yIjogZXJyb3Igb3IgTm9uZX0KICAg
IGRhdGEgPSBqc29uLmR1bXBzKHBheWxvYWQpLmVuY29kZSgidXRmLTgiKQogICAgcmVxID0gdXJs
bGliLnJlcXVlc3QuUmVxdWVzdCgKICAgICAgICB1cmwsCiAgICAgICAgZGF0YT1kYXRhLAogICAg
ICAgIG1ldGhvZD0iUE9TVCIsCiAgICAgICAgaGVhZGVycz1fYWdlbnRfaGVhZGVycyh0b2tlbiwg
anNvbl9ib2R5PVRydWUpLAogICAgKQogICAgdHJ5OgogICAgICAgIHdpdGggdXJsbGliLnJlcXVl
c3QudXJsb3BlbihyZXEsIHRpbWVvdXQ9dGltZW91dCkgYXMgcmVzcDoKICAgICAgICAgICAgcmV0
dXJuIGludChnZXRhdHRyKHJlc3AsICJzdGF0dXMiLCAyMDApIG9yIDIwMCkKICAgIGV4Y2VwdCB1
cmxsaWIuZXJyb3IuSFRUUEVycm9yIGFzIGV4YzoKICAgICAgICByZXR1cm4gaW50KGV4Yy5jb2Rl
KQogICAgZXhjZXB0ICh1cmxsaWIuZXJyb3IuVVJMRXJyb3IsIE9TRXJyb3IpOgogICAgICAgIHJl
dHVybiA1CgoKZGVmIF9wb2xsX2xvY2tfcGF0aChhZ2VudF9pZDogc3RyKSAtPiBzdHI6CiAgICBz
YWZlID0gcmUuc3ViKHIiW14wLTlhLWZBLUYtXSIsICJfIiwgYWdlbnRfaWQpWzo4MF0gb3IgImFn
ZW50IgogICAgbG9ja19kaXIgPSBvcy5lbnZpcm9uLmdldCgiU0lORVhJU19QT0xMX0xPQ0tfRElS
IiwgIi92YXIvbGliL3NpbmV4aXMiKQogICAgcmV0dXJuIG9zLnBhdGguam9pbihsb2NrX2Rpciwg
ZiJob3N0LXByb3RlY3QtcG9sbC17c2FmZX0ubG9jayIpCgoKZGVmIHJ1bl9wb2xsKGFyZ3M6IGFy
Z3BhcnNlLk5hbWVzcGFjZSkgLT4gaW50OgogICAgaWYgbm90IGFyZ3MuYXBpX2Jhc2Ugb3Igbm90
IGFyZ3MudG9rZW4gb3Igbm90IGFyZ3MuYWdlbnRfaWQ6CiAgICAgICAgcmV0dXJuIDQKICAgIGZl
dGNoX2pvYnMoYXJncy5hcGlfYmFzZSwgYXJncy50b2tlbiwgYXJncy5hZ2VudF9pZCwgYXJncy50
aW1lb3V0KQogICAgbG9ja19wYXRoID0gX3BvbGxfbG9ja19wYXRoKGFyZ3MuYWdlbnRfaWQpCiAg
ICB0cnk6CiAgICAgICAgb3MubWFrZWRpcnMob3MucGF0aC5kaXJuYW1lKGxvY2tfcGF0aCksIG1v
ZGU9MG83MDAsIGV4aXN0X29rPVRydWUpCiAgICAgICAgbG9ja19mZCA9IG9zLm9wZW4obG9ja19w
YXRoLCBvcy5PX0NSRUFUIHwgb3MuT19SRFdSLCAwbzYwMCkKICAgIGV4Y2VwdCBPU0Vycm9yOgog
ICAgICAgIGxvY2tfZmQgPSBOb25lCiAgICBpZiBsb2NrX2ZkIGlzIG5vdCBOb25lOgogICAgICAg
IHRyeToKICAgICAgICAgICAgZmNudGwuZmxvY2sobG9ja19mZCwgZmNudGwuTE9DS19FWCB8IGZj
bnRsLkxPQ0tfTkIpCiAgICAgICAgZXhjZXB0IE9TRXJyb3I6CiAgICAgICAgICAgIG9zLmNsb3Nl
KGxvY2tfZmQpCiAgICAgICAgICAgIHJldHVybiAwCiAgICB0cnk6CiAgICAgICAgZGVhZGxpbmUg
PSB0aW1lLm1vbm90b25pYygpICsgOTAKICAgICAgICBmb3IgXyBpbiByYW5nZSg0MCk6CiAgICAg
ICAgICAgIG5fcmF3LCBfcmMgPSBfcnVuX3BvbGxfam9icyhhcmdzKQogICAgICAgICAgICBpZiBu
X3JhdyA8IDUgb3IgdGltZS5tb25vdG9uaWMoKSA+PSBkZWFkbGluZToKICAgICAgICAgICAgICAg
IGJyZWFrCiAgICAgICAgcmV0dXJuIDAKICAgIGZpbmFsbHk6CiAgICAgICAgaWYgbG9ja19mZCBp
cyBub3QgTm9uZToKICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAgZmNudGwuZmxvY2so
bG9ja19mZCwgZmNudGwuTE9DS19VTikKICAgICAgICAgICAgZXhjZXB0IE9TRXJyb3I6CiAgICAg
ICAgICAgICAgICBwYXNzCiAgICAgICAgICAgIG9zLmNsb3NlKGxvY2tfZmQpCgoKZGVmIF9ydW5f
cG9sbF9qb2JzKGFyZ3M6IGFyZ3BhcnNlLk5hbWVzcGFjZSkgLT4gdHVwbGVbaW50LCBpbnRdOgog
ICAgbl9yYXcsIGpvYnMgPSBmZXRjaF9qb2JzKGFyZ3MuYXBpX2Jhc2UsIGFyZ3MudG9rZW4sIGFy
Z3MuYWdlbnRfaWQsIGFyZ3MudGltZW91dCkKICAgIGpvYnMuc29ydChrZXk9bGFtYmRhIGo6IDAg
aWYgKGouZ2V0KCJraW5kIikgb3IgIiIpIGluICgicXVhcmFudGluZSIsICJyZXN0b3JlIikgZWxz
ZSAxKQogICAgd29yc3QgPSAwCiAgICBmb3Igam9iIGluIGpvYnM6CiAgICAgICAga2luZCA9IGpv
Yi5nZXQoImtpbmQiKSBvciAic2NhbiIKICAgICAgICBpZiBraW5kID09ICJzY2FuIjoKICAgICAg
ICAgICAgcmMgPSBydW4oCiAgICAgICAgICAgICAgICBbCiAgICAgICAgICAgICAgICAgICAgInNj
YW4iLAogICAgICAgICAgICAgICAgICAgICItLXJvb3QiLAogICAgICAgICAgICAgICAgICAgIGpv
Ylsicm9vdF9wYXRoIl0sCiAgICAgICAgICAgICAgICAgICAgIi0tc2Nhbi1pZCIsCiAgICAgICAg
ICAgICAgICAgICAgam9iWyJzY2FuX2lkIl0sCiAgICAgICAgICAgICAgICAgICAgIi0tYWdlbnQt
aWQiLAogICAgICAgICAgICAgICAgICAgIGFyZ3MuYWdlbnRfaWQsCiAgICAgICAgICAgICAgICAg
ICAgIi0tYXBpLWJhc2UiLAogICAgICAgICAgICAgICAgICAgIGFyZ3MuYXBpX2Jhc2UsCiAgICAg
ICAgICAgICAgICAgICAgIi0tdG9rZW4iLAogICAgICAgICAgICAgICAgICAgIGFyZ3MudG9rZW4s
CiAgICAgICAgICAgICAgICAgICAgIi0tcnVsZXMtZGlyIiwKICAgICAgICAgICAgICAgICAgICBh
cmdzLnJ1bGVzX2RpciwKICAgICAgICAgICAgICAgICAgICAiLS10aW1lb3V0IiwKICAgICAgICAg
ICAgICAgICAgICBzdHIoYXJncy50aW1lb3V0KSwKICAgICAgICAgICAgICAgIF0KICAgICAgICAg
ICAgKQogICAgICAgIGVsc2U6CiAgICAgICAgICAgIGFyZ3YgPSBbCiAgICAgICAgICAgICAgICBr
aW5kLAogICAgICAgICAgICAgICAgIi0tcm9vdCIsCiAgICAgICAgICAgICAgICBqb2JbInJvb3Rf
cGF0aCJdLAogICAgICAgICAgICAgICAgIi0tcmVsLXBhdGgiLAogICAgICAgICAgICAgICAgam9i
WyJyZWxfcGF0aCJdLAogICAgICAgICAgICAgICAgIi0tc2l0ZS1pZCIsCiAgICAgICAgICAgICAg
ICBqb2JbInNpdGVfaWQiXSwKICAgICAgICAgICAgICAgICItLWRlc3QtYmFzZW5hbWUiLAogICAg
ICAgICAgICAgICAgam9iWyJkZXN0X2Jhc2VuYW1lIl0sCiAgICAgICAgICAgICAgICAiLS1xdWFy
YW50aW5lLXJvb3QiLAogICAgICAgICAgICAgICAgYXJncy5xdWFyYW50aW5lX3Jvb3QsCiAgICAg
ICAgICAgIF0KICAgICAgICAgICAgcmMgPSBydW4oYXJndikKICAgICAgICAgICAgYWNrX29rID0g
cmMgPT0gMAogICAgICAgICAgICBlcnIgPSAiIiBpZiBhY2tfb2sgZWxzZSBmImhlbHBlciBleGl0
IHtyY30iCiAgICAgICAgICAgIHBvc3RfY29tbWFuZF9hY2soCiAgICAgICAgICAgICAgICBhcmdz
LmFwaV9iYXNlLCBhcmdzLnRva2VuLCBhcmdzLmFnZW50X2lkLCBqb2JbImNvbW1hbmRfaWQiXSwg
YWNrX29rLCBlcnIsIGFyZ3MudGltZW91dAogICAgICAgICAgICApCiAgICAgICAgaWYgcmMgIT0g
MDoKICAgICAgICAgICAgd29yc3QgPSByYwogICAgcmV0dXJuIG5fcmF3LCB3b3JzdAoKCmRlZiBy
dW4oYXJndjogbGlzdFtzdHJdIHwgTm9uZSA9IE5vbmUpIC0+IGludDoKICAgIGFyZ3MgPSBwYXJz
ZV9hcmdzKGFyZ3YpCiAgICBpZiBhcmdzLmFjdGlvbiA9PSAicXVhcmFudGluZSI6CiAgICAgICAg
cmV0dXJuIHJ1bl9xdWFyYW50aW5lKGFyZ3MpCiAgICBpZiBhcmdzLmFjdGlvbiA9PSAicmVzdG9y
ZSI6CiAgICAgICAgcmV0dXJuIHJ1bl9yZXN0b3JlKGFyZ3MpCiAgICBpZiBhcmdzLmFjdGlvbiA9
PSAicG9sbCI6CiAgICAgICAgcmV0dXJuIHJ1bl9wb2xsKGFyZ3MpCiAgICBpZiBub3QgYXJncy5z
Y2FuX2lkIG9yIG5vdCBhcmdzLmFnZW50X2lkOgogICAgICAgIHJldHVybiA0CiAgICB0cnk6CiAg
ICAgICAgcm9vdCA9IHZhbGlkYXRlX3Jvb3RfcGF0aChhcmdzLnJvb3QpCiAgICBleGNlcHQgVmFs
dWVFcnJvcjoKICAgICAgICByZXR1cm4gMgogICAgaWYgbm90IG9zLnBhdGguaXNkaXIocm9vdCk6
CiAgICAgICAgcmV0dXJuIDMKICAgIHBhY2sgPSBsb2FkX3NpZ25hdHVyZV9wYWNrKFBhdGgoYXJn
cy5ydWxlc19kaXIpKQogICAgZmluZGluZ3MgPSBzY2FuX25lZWRsZXMocm9vdCwgcGFjaykKICAg
IGVuZ2luZSA9ICJ5YXJhIiBpZiB5YXJhX2F2YWlsYWJsZSgpIGVsc2UgIm5lZWRsZXMiCiAgICBj
bGFtX2hpdHMgPSBzY2FuX2NsYW0ocm9vdCwgYXJncy50aW1lb3V0KQogICAgcGF5bG9hZCA9IHsK
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
ci9saWIvc2luZXhpcyAvdmFyL3d3dyAtL3Nydi93d3cgL2hvbWUKUHJpdmF0ZVRtcD10cnVlClBy
aXZhdGVEZXZpY2VzPXRydWUKUHJvdGVjdEtlcm5lbFR1bmFibGVzPXRydWUKUHJvdGVjdENvbnRy
b2xHcm91cHM9dHJ1ZQpSZXN0cmljdFNVSURTR0lEPXRydWUKTG9ja1BlcnNvbmFsaXR5PXRydWUK
UmVzdHJpY3RSZWFsdGltZT10cnVlClJlc3RyaWN0QWRkcmVzc0ZhbWlsaWVzPUFGX1VOSVggQUZf
SU5FVCBBRl9JTkVUNgpTeXN0ZW1DYWxsQXJjaGl0ZWN0dXJlcz1uYXRpdmUKCltJbnN0YWxsXQpX
YW50ZWRCeT1tdWx0aS11c2VyLnRhcmdldAo='
SINEXIS_B64_TMR='W1VuaXRdCkRlc2NyaXB0aW9uPVNpbmV4aXMgSG9zdCBQcm90ZWN0IHBvbGwgKCVpKQpSZXF1aXJl
cz13YXp1aC1hZ2VudC5zZXJ2aWNlCgpbVGltZXJdCk9uQm9vdFNlYz0ybWluCk9uVW5pdEFjdGl2
ZVNlYz01bWluClBlcnNpc3RlbnQ9dHJ1ZQoKW0luc3RhbGxdCldhbnRlZEJ5PXRpbWVycy50YXJn
ZXQK'


while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent-id)
      AGENT_ID="${2:-}"
      MENU=0
      DO_HELPER=1
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
    --write-waf-snippet)
      DO_WAF_SNIPPET=1
      MENU=0
      shift
      ;;
    --waf-snippet-path)
      WAF_SNIPPET_PATH="${2:-}"
      [[ -n "$WAF_SNIPPET_PATH" ]] || die "missing --waf-snippet-path"
      shift 2
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

if [[ "$DO_WAZUH" -eq 1 ]]; then
  install_wazuh_agent
fi
if [[ "$DO_HELPER" -eq 1 ]]; then
  configure_host_protect
fi
if [[ "$DO_WAF_SNIPPET" -eq 1 ]]; then
  write_waf_snippet
fi
if [[ "$DO_WAZUH" -eq 0 && "$DO_HELPER" -eq 0 && "$DO_WAF_SNIPPET" -eq 0 ]]; then
  usage
  exit 1
fi
exit 0
