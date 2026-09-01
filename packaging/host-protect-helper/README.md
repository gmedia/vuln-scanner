# Sinexis Host Protect helper (on-box)

Add-on for an enrolled **wazuh-agent** VM. Walks allowlisted web roots and POSTs JSON to `/api/host/agent/results`. Not a second enroll daemon.

## Lab (tc5 only)

Do **not** wipe `sx-erpstg`. Use a fixture folder under `/var/www`, `/srv/www`, or `/home`.

1. Copy `sinexis_host_scan.py` + `rules/` onto the agent (or install the Debian package when built).
2. `Depends: wazuh-agent` — start after `wazuh-agent.service`.
3. Environment file `/etc/sinexis/host-protect.env` (mode 600): ingest URL + `X-Host-Agent-Token` from Guard enroll. **Never commit tokens.**
4. Enable `sinexis-host-protect@.timer` with the Guard agent UUID as instance.
5. Poll interval: timer `OnUnitActiveSec=5min`. SaaS worker **does not** mount this disk.

Smoke: enqueue a Host Protect scan in the SPA, then run `python3 sinexis_host_scan.py poll --agent-id <uuid>` on **tc5**. Hits appear only after POST.

ClamAV is optional (`Recommends: clamav`). Skip if `clamscan`/`clamdscan` is absent.
