# Sinexis Host Protect helper (on-box)

Add-on for an enrolled **wazuh-agent** VM. Walks allowlisted web roots and POSTs JSON to `/api/host/agent/results`. Not a second enroll daemon.

## Lab (tc5 only)

Do **not** wipe `sx-erpstg`. Use a fixture folder under `/var/www`, `/srv/www`, or `/home`.

1. Download from the product origin (not a git clone, not curl|bash): `wget -O sinexis-install.sh 'https://sinexis.app/install/sinexis-install.sh'` then `chmod +x`. First line must be `#!/usr/bin/env bash`. Payloads embedded; **not** a git clone; never `curl | bash`. On a TTY: `sudo ./sinexis-install.sh` — prints setup status (no tokens; audit **size vs unread cursor**, last-2k parse), then menu (1) install `wazuh-agent` (needs `manager_host` from enroll), (2) configure Host Protect helper (`--token-file`), (3) both, (4) write Host WAF snippet file only (`/etc/nginx/sinexis-waf.snippet.conf`; **no** vhost include, **no** `nginx -t`/`reload`), (5) write snippet **and** include it in **every `server {}`** of a vhost **you name** (`--apply-waf-vhost PATH`; `nginx -t` + reload; refuses `sinexis.app` edge), (6) status, (7) set WAF ingest keys + poll once (`--configure-waf-ingest --waf-site-id`), (8) poll once (`--poll-once`). Optional: `dpkg -i` from `./scripts/build-host-protect-deb.sh`.
2. `Depends: wazuh-agent` — start after `wazuh-agent.service`.
3. Environment file `/etc/sinexis/host-protect.env` (mode 600): ingest URL + `X-Host-Agent-Token` from Guard enroll. **Never commit tokens.**
4. Enable `sinexis-host-protect@.timer` with the Guard agent UUID as instance.
5. Poll interval: timer `OnUnitActiveSec=5min`. SaaS worker **does not** mount this disk.
6. systemd unit: `ProtectSystem=strict` plus `ReadWritePaths=/var/lib/sinexis /var/www /srv/www /home` so poll can walk jail roots and (when S11 helper jobs exist) rename into quarantine. Missing env/token → helper exit **4**, no POST. Env file **mode 600**.

**AM copy-paste:** [`docs/host-protect-helper-am.md`](../../docs/host-protect-helper-am.md) (env placeholders; no tokens in git).

Smoke: enqueue a Host Protect scan in the SPA, then run `python3 sinexis_host_scan.py poll --agent-id <uuid>` on **tc5**. Hits appear only after POST. Poll also runs queued **quarantine/restore** jobs and POSTs `/api/host/agent/commands/ack`. Pending SPA status is not on-disk quarantine. Lab API: [`scripts/host-protect-lab-smoke.sh`](../../scripts/host-protect-lab-smoke.sh) `--require-helper-heartbeat` (optional `--trigger-helper-poll`).

ClamAV is optional (`Recommends: clamav`). Skip if `clamscan`/`clamdscan` is absent. CI images must not require Clam.

## On-write watch (inotify, lab tc5 only)

`python3 sinexis_host_scan.py watch --agent-id <uuid>` watches **only allowlisted site roots** (`/var/www`, `/srv/www`, `/home` — never whole disk) and fires `POST /api/host/agent/request-scan {agent_id, site_id}` on write, then runs the existing poll/scan flow once. Per-site cooldown defaults to 15 min to avoid storms; debounce defaults to 60 s quiet window.

- Install: `sinexis-host-watch@.service` (`Requires=wazuh-agent`, `Restart=always`) — enable with the Guard agent UUID: `systemctl enable --now sinexis-host-watch@<uuid>.service`. Alternative: keep the 5-min `sinexis-host-protect@.timer` poll and run `watch --watch-once` from cron — the fallback mtime sweep needs no daemon.
- Optional dependency: `inotify-tools` provides `inotifywait` (`-m -r -e close_write,moved_to,create`). When absent, the helper falls back to an mtime sweep every 30 s with the same file/byte caps as scan (500 files, 1 MB, skips `.git`/`node_modules`/`__pycache__`/`.quarantine`).
- Roots: discovered from SaaS (`GET /api/host/agent/watch-sites`, else jobs site list filtered `watch_on_write`), else `SINEXIS_WATCH_ROOTS` (colon-separated, jail-validated). Env knobs in `host-protect.env.example`: `SINEXIS_WATCH_DEBOUNCE`, `SINEXIS_WATCH_COOLDOWN`, `SINEXIS_WATCH_STATE_DIR`, `SINEXIS_WATCH_ROOTS` (env file stays mode 600).
- Lab tc5 only. Enable `watch_on_write` per site in SPA `/host` first; backend debounces per site (15 min) and caps org concurrency (2).
