# Blog source (Bahasa Indonesia, layperson)

Markdown here is the **seed / editorial source** for CMS posts. Live copy lives in the database (`blog_posts`). Do not put prices, IPs, or images in these files (`img` is rejected by the renderer).

Canonical public URLs: `https://sinexis.app/blog/:slug`

| Slug | Topic |
|------|--------|
| `apa-itu-sinexis` | Product overview |
| `scan-domain-website` | Domain / website scan |
| `scan-ip-server` | IP / server scan |
| `jadwal-scan-attach` | Scheduled attach scans |
| `kredit-dan-paket` | Credits (no IDR) |
| `aset-dan-workspace` | Assets + workspace |
| `uptime-situs-nyala` | Uptime |
| `guard-dan-siem` | Guard vs SIEM (honest scope) |

Publish via admin JWT (`POST /api/admin/blog/posts` then `.../publish`). Idempotent on slug (409 if exists).

**Live `/blog` is the database.** Editing these files does not change production until an admin updates the matching slug (or recreates the post). Keep copy layperson Bahasa; no prices, IPs, or images.

Editorial notes (2026-09): Scan = outside-in posture (DAST-class baseline, not business logic). Attach = scheduled control, not SIEM. Guard = thin Wazuh inventory + critical alerts. SIEM Cases = Postgres incident tickets, not a Wazuh plugin. Host Protect = on-box helper, never invented malware. Do not quote IDR.
