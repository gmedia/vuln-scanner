# Blog source (Bahasa Indonesia, layperson)

Markdown here is the **seed / editorial source** for CMS posts. Live copy lives in the database (`blog_posts`). Do not put prices, IPs, or images in these files (`img` is rejected by the renderer).

Canonical public URLs: `https://sinexis.app/blog/:slug`

| Slug | Title (H1) |
|------|--------|
| `apa-itu-sinexis` | Sinexis menempel di rak yang sudah Anda bayar |
| `scan-domain-website` | Scan domain melihat website seperti pengunjung melihatnya |
| `scan-ip-server` | Scan IP mengetuk pintu server dari internet |
| `jadwal-scan-attach` | Scan Attach: yang dibaca adalah perubahannya |
| `kredit-dan-paket` | Kredit: saldo yang kelihatan sebelum scan jalan |
| `aset-dan-workspace` | Aset punya nama. Workspace adalah orangnya. |
| `uptime-situs-nyala` | Uptime: lampu toko masih nyala, atau sudah padam |
| `guard-dan-siem` | Guard tipis, SIEM belakangan. Keduanya bukan Scan. |

Publish via admin JWT (`POST /api/admin/blog/posts` then `.../publish`). Idempotent on slug (409 if exists).

**Live `/blog` is the database.** Editing these files does not change production until an admin updates the matching slug (or recreates the post). Keep copy layperson Bahasa; no prices, IPs, or images.

Voice: operator-honest, no flattery, no invented CVEs. Scan = outside-in posture (not business logic). Attach = scheduled control plus diff, not SIEM. Guard = thin Wazuh inventory plus critical alerts. SIEM Cases = app tickets, not a Wazuh plugin. Host Protect = on-box helper, never invented malware. One `wazuh-agent` per VM. Host WAF stays on the customer box. Do not quote IDR. Do not claim 24/7 watch, Imunify clone, or pentest replacement.
