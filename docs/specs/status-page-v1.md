# Spec: Status page v1 (P11 — public comms + custom domain)

**Status:** S1–S5 in repo (this epic). Flag `STATUS_PAGE_ENABLED` (default true in code).
**Goal:** org-scoped **public** availability page driven by existing Uptime monitors, plus **custom hostname** (CNAME). TLS for customer hosts is **Cloudflare for SaaS / orange-cloud** — not ACME inside the app container.
**Epic:** **P11**. Does **not** replace P8 Uptime probes, P10 blog, Guard, or SIEM.
**Depends:** P2 Workspace · P8 `uptime_monitors` · blog HTML-island pattern · host nginx.
**Commercial:** not a new list-price SKU. **Publish:** org `sku` in `{pro, multi}`. **Custom hostname:** `multi` only.
**Not this epic:** subscriber mailing list, Slack/webhooks, auto-open incidents from down, ACME in-app, nested pages, custom CSS/logo upload.
**Hostname lifecycle (buttons, TXT, later CF API / credits):** [`status-hostname-lifecycle.md`](status-hostname-lifecycle.md). First slice (API + SPA, stub CF) is in-repo; CF write API and credits remain later.

## Locked defaults

| Topic | Default |
|-------|---------|
| Tenancy | 1 published page per org |
| Platform URL | `https://sinexis.app/status/{slug}` |
| Custom host | CNAME → `STATUS_PAGE_CNAME_TARGET` (default `status-edge.sinexis.app`); public URL is **apex** `https://{custom}/` (`GET /status` by `Host`). `/status` on the custom host still works. Do not send visitors to `sinexis.app/status/{slug}` as the custom URL. |
| TLS | Edge (Cloudflare); origin serves HTTP island on `/status` |
| Incidents | Manual only |
| Public data | Display name + `up/down/degraded/unknown` — **never** raw monitor URL/IP |
| Roles | viewer read; member+ mutate page/components; admin+ incidents delete |

## Non-goals

Public blog merge, AppShell on the public page, writing back into `uptime_monitors`, ICMP, multi-region.

## Ops residual

Host nginx must proxy `/status` to backend (same as `/blog`). Customer custom domains need Cloudflare SSL for SaaS or a catch-all vhost — **not** generated `server_name` in git.
