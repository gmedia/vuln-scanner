# Host Protect helper — AM install (lab + customer VPS)

Public-repo safe: **no IPs, tokens, SSH users, or customer docroots** in this file.

This is **not** a second enroll daemon. Guard (`wazuh-agent`) stays the identity. The helper only walks allowlisted web roots and POSTs JSON to Sinexis.

**Lab:** SSH alias **`tc5` only**. Do **not** wipe `sx-erpstg`. Fixture path must stay under `/var/www`, `/srv/www`, or `/home` (default `/var/www/host-protect-fixture`).

**Debian `.deb`:** build with `./scripts/build-host-protect-deb.sh` (writes `dist/sinexis-host-protect_*_all.deb`). Package **Depends: wazuh-agent** — do not install on machines without Guard. Env file is **not** in the package payload except as `/usr/share/doc/.../host-protect.env.example` (empty token). `postinst` copies the example to `/etc/sinexis/host-protect.env` only if missing (mode 600). Enable the timer with the Guard UUID after filling the token.

**How to get the files (not curl|bash):** the wrapper needs the **whole helper directory**, not a lone `sinexis-install.sh`. From a workstation:

1. Clone `https://github.com/gmedia/vuln-scanner` then `cd packaging/host-protect-helper`, **or**
2. Open [that folder on GitHub](https://github.com/gmedia/vuln-scanner/tree/main/packaging/host-protect-helper) → Download ZIP / copy the tree AM was given, **or**
3. Optional `.deb` from a [GitHub Release](https://github.com/gmedia/vuln-scanner/releases) (verify SHA256).

Copy that directory onto the VPS (scp/rsync). Then:

**Wrapper (P14 C2):** `sinexis-install.sh` in that directory — not `curl | bash`, does **not** install `wazuh-agent`.

```bash
# Non-interactive (preferred). Token stays in a 600 file, not argv.
sudo ./sinexis-install.sh --agent-id <GUARD-UUID> \
  --token-file /root/host-agent.token \
  --api-base https://sinexis.app

# Optional TTY prompts (do not pipe into this):
sudo ./sinexis-install.sh --interactive

# Preview only:
./sinexis-install.sh --dry-run --agent-id <GUARD-UUID> --token-file /root/host-agent.token
```

`--deb path.deb` runs `dpkg -i` first. `--from-tree` (default) copies `sinexis_host_scan.py` + units from this directory. Lab: `--skip-wazuh-check` only on a throwaway VM — never customer.

Copy-from-tree (no dpkg) still works:

## 0) Prerequisites

1. Org has **Guard** enabled; agent enrolled and **online** (SPA `/guard`). Product enroll is **not** Playwright — see [`AGENT_EXECUTION_GUIDE.md`](AGENT_EXECUTION_GUIDE.md) **§4.1** for wipe-first lab.
2. Copy the **Guard agent UUID** from `/guard` (product `id`, not the Wazuh numeric id).
3. Copy **Host agent token** from the same Guard enroll / Host Protect helper copy block on `/guide` (header `X-Host-Agent-Token`). Never paste it into git, tickets, or screenshots.
4. Public API origin (example shape only): `https://sinexis.app` — use the origin the customer actually uses.

## 1) Files on the VM

On the **enrolled** VM (after `wazuh-agent` is running):

```bash
sudo mkdir -p /usr/lib/sinexis/host-protect /etc/sinexis /var/lib/sinexis/quarantine /var/www /srv/www
sudo chmod 700 /var/lib/sinexis /var/lib/sinexis/quarantine /etc/sinexis
# /srv/www may be empty; systemd ReadWritePaths used to fail 226 if the dir was missing.

# From a checkout of this repo (or a tarball AM was given — not curl|bash):
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
