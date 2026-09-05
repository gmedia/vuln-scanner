# Host Protect helper — AM install (lab + customer VPS)

Public-repo safe: **no IPs, tokens, SSH users, or customer docroots** in this file.

This is **not** a second enroll daemon. Guard (`wazuh-agent`) stays the identity. The helper only walks allowlisted web roots and POSTs JSON to Sinexis.

**Lab:** SSH alias **`tc5` only**. Do **not** wipe `sx-erpstg`. Fixture path must stay under `/var/www`, `/srv/www`, or `/home` (default `/var/www/host-protect-fixture`).

**Debian `.deb`:** build with `./scripts/build-host-protect-deb.sh` (writes `dist/sinexis-host-protect_*_all.deb`). Package **Depends: wazuh-agent** — do not install on machines without Guard. Env file is **not** in the package payload except as `/usr/share/doc/.../host-protect.env.example` (empty token). `postinst` copies the example to `/etc/sinexis/host-protect.env` only if missing (mode 600). Enable the timer with the Guard UUID after filling the token.

**How to get the installer (not curl|bash, not a git clone):** download the **raw** file (not the GitHub HTML blob page):

```bash
wget -O sinexis-install.sh \
  'https://raw.githubusercontent.com/gmedia/vuln-scanner/main/packaging/host-protect-helper/sinexis-install.sh'
head -n1 sinexis-install.sh   # must be #!/usr/bin/env bash — not <!DOCTYPE html>
chmod +x sinexis-install.sh
```

Or a [GitHub Release](https://github.com/gmedia/vuln-scanner/releases) asset — verify SHA256. Payloads (scan helper, rules, systemd units) are **embedded**. If `bash` reports `<!DOCTYPE html>`, you saved the web page.

**Wrapper:** TTY prints **setup status** first (wazuh / helper / WAF snippet — **no tokens**), then menu — (1) wazuh-agent, (2) helper, (3) both, (4) WAF file only, (5) WAF include + reload, (6) status, (7) quit. If a piece is already installed, TTY asks **Re-run? [y/N]**. Flags skip unless `--force`. Not `curl | bash`. Enroll still uses SaaS token + `manage_agents` for `agent_key`.

```bash
# TTY menu (1 wazuh-agent / 2 helper / 3 both):
sudo ./sinexis-install.sh

# Non-interactive helper. Token stays in a 600 file, not argv.
sudo ./sinexis-install.sh --configure-host-protect --agent-id <GUARD-UUID> \
  --token-file /root/host-agent.token \
  --api-base https://sinexis.app

# Wazuh package + Manager address (manager_host from enroll; not a lab IP guess):
sudo ./sinexis-install.sh --install-wazuh-agent --manager-host <MANAGER_HOST>

# Preview only:
./sinexis-install.sh --dry-run --configure-host-protect --agent-id <GUARD-UUID> --token-file /root/host-agent.token
```

`--deb path.deb` runs `dpkg -i` first. `--from-tree` copies sibling files if you still have the directory. Default is **embedded payloads**. Lab: `--skip-wazuh-check` only on a throwaway VM — never customer.

Copy-from-tree (no dpkg) still works:

## 0) Prerequisites

1. Org has **Guard** enabled; agent enrolled and **online** (SPA `/guard`). Product enroll is **not** Playwright — see [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) **§4.1** for wipe-first lab.
2. On SPA `/guard`, copy the **Guard agent UUID** (product `id`, not the Wazuh numeric id) from the agent row.
3. Admin/owner: **Generate Host Protect token** on that row (plaintext once). Write it to a mode-600 file on the VM (`--token-file`). This is **not** a Guard enroll token. Never paste it into git, tickets, or screenshots.
4. Public API origin (example shape only): `https://sinexis.app` — use the origin the customer actually uses.

## 1) Files on the VM

On the **enrolled** VM (after `wazuh-agent` is running):

```bash
sudo mkdir -p /usr/lib/sinexis/host-protect /etc/sinexis /var/lib/sinexis/quarantine /var/www /srv/www
sudo chmod 700 /var/lib/sinexis /var/lib/sinexis/quarantine /etc/sinexis
# /srv/www may be empty; systemd ReadWritePaths used to fail 226 if the dir was missing.

# After sudo ./sinexis-install.sh (embedded payloads), or copy from a tree:
sudo cp packaging/host-protect-helper/sinexis_host_scan.py /usr/lib/sinexis/host-protect/
sudo cp -a packaging/host-protect-helper/rules /usr/lib/sinexis/host-protect/
sudo cp packaging/host-protect-helper/systemd/sinexis-host-protect@.service /etc/systemd/system/
sudo cp packaging/host-protect-helper/systemd/sinexis-host-protect@.timer /etc/systemd/system/
sudo chmod 755 /usr/lib/sinexis/host-protect/sinexis_host_scan.py
```

## 2) Env file (mode 600)

```bash
sudo install -m 600 /dev/null /etc/sinexis/host-protect.env
sudoeditor /etc/sinexis/host-protect.env
```

Contents (placeholders only):

```bash
SINEXIS_API_BASE=https://sinexis.app
SINEXIS_HOST_AGENT_TOKEN=<paste from Guard /guide — never commit>
SINEXIS_AGENT_ID=<Guard agent UUID from /guard>
SINEXIS_QUARANTINE_ROOT=/var/lib/sinexis/quarantine
```

Missing `SINEXIS_API_BASE` / token / agent id → helper **exit 4**, no POST.

## 3) Timer (5 minutes)

Instance name **must** be the Guard UUID:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sinexis-host-protect@<GUARD-UUID>.timer
sudo systemctl start sinexis-host-protect@<GUARD-UUID>.service   # one-shot poll now
systemctl is-active wazuh-agent
systemctl list-timers 'sinexis-host-protect@*'
```

Do **not** print `journalctl` if it might include the token.

## 4) Prove heartbeat, then Scan now

1. SPA **`/guard`**: `last_helper_poll_at` (helper heartbeat) is set and not stale (~20 minutes). Wazuh keep-alive is **not** enough.
2. SPA **`/host`**: add a site whose `root_path` exists **on that VM** (lab: `/var/www/host-protect-fixture`). Adding a site **before** a live helper poll is allowed but Scan now will stay `pending_agent` / fail closed.
3. **Scan now**. Hits appear only after the helper POSTs `/api/host/agent/results`.

Lab API smoke (not Playwright; default refuses public prod unless override):

```bash
export GUARD_LAB_APP_BASE GUARD_LAB_EMAIL GUARD_LAB_PASSWORD
export GUARD_LAB_ALLOW_PUBLIC_PROD=1   # only when you intend public origin
./scripts/host-protect-lab-smoke.sh --prepare-fixture --require-helper-heartbeat
```

Optional one-shot poll over SSH (still does not print tokens):

```bash
./scripts/host-protect-lab-smoke.sh --prepare-fixture --trigger-helper-poll --require-helper-heartbeat
```

Full Guard enroll/unenroll still uses wipe-first **§4.1** (`scripts/guard-lab-enroll-smoke.sh`). This smoke **does not** enroll.

## 5) Honesty for AM

| Say | Do not say |
|-----|------------|
| Helper on **their** VM walks the web root | “SaaS already scanned the VPS disk” |
| Scan waits until helper POSTs | Green completed + mock webshell |
| Guard enroll ≠ Host Protect helper | One click on `/host` installs files |

Package metadata: [`packaging/host-protect-helper/README.md`](../packaging/host-protect-helper/README.md). Spec slice C: [`specs/imunify-class-onbox.md`](specs/imunify-class-onbox.md).

## 6) Host WAF on the same helper (one page)

Do **not** paste the snippet onto `sinexis.app` edge nginx. Customer (or lab) VPS only.

| Step | Honest check |
|------|----------------|
| Copy snippet in `/host` WAF tab | Clipboard only. Does **not** include or reload nginx. |
| Write file on VPS | Menu **4** / `--write-waf-snippet` → `/etc/nginx/sinexis-waf.snippet.conf` only. |
| Include + reload | Menu **5** / `--apply-waf-vhost /etc/nginx/sites-enabled/<site>` — you name the file. Refuses `sinexis.app` edge. Needs ModSecurity module. |
| Env for ingest | `SINEXIS_WAF_SITE_ID=<host_sites UUID>` and `SINEXIS_WAF_AUDIT_LOG=/var/log/modsec_audit.log` in `host-protect.env`. systemd unit needs `ReadOnlyPaths=-/var/log/modsec_audit.log`. |
| Live rows in SPA | After nginx actually matches **and** helper poll POSTs `/api/host/agent/waf-events`. Simulate is preview only (`mock.sqli.1`). |
| Duplicate probes | API drops identical path+rule+method+action within ~10 minutes. |

Prove loopback (lab): `GET` a fixture path that returns **403**; then trigger helper poll. SPA WAF table should show the **real** `rule_id`, not only Simulate.
