# Blog source (Bahasa Indonesia, layperson)

Markdown here is the **seed / editorial source** for CMS posts. Live copy lives in the database (`blog_posts`). Do not put prices, IPs, or images in these files (`img` is rejected by the renderer).

Canonical public URLs: `https://sinexis.app/blog/:slug`

| Slug | Topic | Pillar |
|------|--------|--------|
| `apa-itu-sinexis` | Product overview | `exposure` |
| `scan-domain-website` | Domain / website scan | `exposure` |
| `scan-ip-server` | IP / server scan | `exposure` |
| `jadwal-scan-attach` | Scheduled attach scans | `exposure` |
| `kredit-dan-paket` | Credits (no IDR) | `exposure` |
| `aset-dan-workspace` | Assets + workspace | `exposure` |
| `uptime-situs-nyala` | Uptime | `availability` |
| `guard-dan-siem` | Guard vs SIEM (honest scope) | `onbox` |

## Pillar rules

`blog_posts.pillar` is a nullable `String(32)` with a CHECK constraint. The only
allowed values are the four public pillars:

| Pillar | Meaning |
|--------|---------|
| `exposure` | Outside-in scan / attach / assets / credits |
| `onbox` | Guard, on-box visibility, SIEM scope |
| `availability` | Uptime and status-page topics |
| `ai` | AI Gateway topics |

`/blog` groups published posts in that order and renders `NULL` under **More**.
New posts should set a pillar in the admin form. Leave it empty only when the
post genuinely spans pillars or predates this taxonomy — do not invent a fifth
id. The migration backfills the eight seeded rows above by slug; it is a no-op
when a slug is missing, so renamed/deleted posts keep working.

S3 leaves the shared island footer unchanged. The umbrella slice owns the footer
line (`_shell` is also used by `/terms` and `/privacy`), so this slice does not
alter legal-page chrome.

Publish via admin JWT (`POST /api/admin/blog/posts` then `.../publish`). Idempotent on slug (409 if exists).

**Live `/blog` is the database.** Editing these files does not change production until an admin updates the matching slug (or recreates the post). Keep copy layperson Bahasa; no prices, IPs, or images.

Editorial notes (2026-09): Scan = outside-in posture (DAST-class baseline, not business logic). Attach = scheduled control, not SIEM. Guard = thin Wazuh inventory + critical alerts. SIEM Cases = Postgres incident tickets, not a Wazuh plugin. Host Protect = on-box helper, never invented malware. Do not quote IDR.
