# Spec: Uptime Monitor v1 (P8 — external probe)

**Status:** **S1–S5 on `main`** (#397) — Q1–Q8 locked (include seats, 60s, RFC1918 off unless `UPTIME_ALLOW_PRIVATE`, HTTP+TCP, email only, no status page, flag on, epic P8).
**Goal:** sellable **external availability** checks on the same colo/VPS/domain already on Scan attach — “is the site/port up?” between weekly scans.
**Epic:** **P8** (new). Does **not** replace P1 Scan, P3 Assets, P5 Guard, or P7 SIEM.
**Depends:** P2 Workspace (JWT `org_id`, membership) · P3 `scan_assets` (optional FK) · existing SMTP (`app.services.email`) · Celery beat pattern (`schedules.run_due`).
**Commercial:** **not** a new list-price SKU in this draft. Default: **include monitor seats in existing Scan tiers** (see §8). Human/P0 follow-up if finance wants a separate `service_id`.
**Not this epic:** Pingdom clone, multi-region Anycast, public status pages, synthetic transactions, RUM, on-call rotations, merging checks into Guard/SIEM/`scan_findings`.

---

## 0) Relation to existing modules (read first)

| Surface | Job | Cadence | Must not become |
|---------|-----|---------|-----------------|
| **Scan attach (P1)** | Exposure / CVE / baseline | weekly–monthly | HTTP ping |
| **Assets (P3)** | Named targets + SKU cap | n/a | Monitor CMDB |
| **Guard (P5)** | Host agent + critical Wazuh | poll minutes | External HTTP from the box |
| **SIEM (P7)** | Analyst search + cases | on demand | Uptime event warehouse |
| **Uptime (this spec)** | **Outside-in** HTTP/TCP from **our probe** | **1–5 min** | Scan job, Wazuh rule, SIEM case |

**Hard rules:**

1. **New tables + new queue** — do **not** overload `scan_schedules` (beat is 5 min and jobs are heavy nmap/OSV).
2. **Do not** write uptime results into `scan_findings` or `guard_alerts`.
3. **Do not** put the SPA under `/guard` or `/siem`. Route **`/uptime`** (or `/monitors`).
4. Optional **link** `asset_id` (nullable) — same target can have a scan schedule **and** a monitor; 1:1 monitor per asset in v1 if linked.
5. Probe identity is **SaaS egress**, not the customer’s Wazuh agent.

---

## 1. Problem

Scan attach answers “what vulns appeared this week.” Colo/VPS customers still ask AM: **“kenapa web down tadi malam?”** Guard answers host compromise, not “nginx 502 from the internet.”

| Gap today | Pain |
|-----------|------|
| No outside-in check | AM cannot attach a cheap “kita pantau 24/7” line on existing SID |
| Weekly scan ≠ availability | False sense of uptime |
| Health endpoints are **our** stack (`/health`) | Not customer targets |
| Email notify exists only for **new critical/high scan diffs** | No down/up email |

**Wedge B (upsell):** one HTTP check on the public site of a VPS/colo already invoiced.
**Wedge A (hospitality):** booking / Wi‑Fi captive / PMS URL later — **not** v1 depth.

---

## 2. Goals

1. Org-scoped **monitors**: name, type (`http` \| `tcp`), target, interval, timeout, enabled.
2. **HTTP(S) GET** (follow redirects cap, expected status class, optional keyword in body, optional TLS expiry warning).
3. **TCP connect** to host:port (SSH/SMTP/custom) — no banner scrape in v1.
4. **Confirm-before-alert:** N consecutive failures (default **2**) then **down**; **1** success then **up** (avoid flapping).
5. **Email** on state change (down / up) via existing SMTP; Bahasa default (`locale`).
6. **SPA `/uptime`:** list + sparkline/last 24h uptime % + last error (sanitized); Sidebar distinct from Guard/SIEM.
7. **SKU seat cap** (not per-ping credits): Basic **1** · Pro **3** · Multi **10** enabled monitors (align asset seats unless §11 overrides).
8. Tests: IDOR, interval floor, confirm logic, no SSRF to RFC1918/metadata by default.
9. Docs: this spek; **no** customer URLs/IPs in git.
10. Degraded: probe/worker down → last error on monitor; API must not 500.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| Multi-region probes / “3 continents agree” | Ops + false-positive complexity; v1 = **one probe region** (edge app/worker) |
| Public status page (`status.customer.com`) | Legal + branding; later P8.x |
| Browser synthetic / login flows / multi-step | Not attach SKU |
| ICMP ping as product default | Often blocked; HTTP/TCP cover colo web + ports |
| Webhooks / Telegram / Slack | Email first (reuse SMTP); integrator later |
| Per-check **credit debit** | 1-min checks would burn Scan credits; seats are the meter |
| DNS-only, keyword regex engines, SSL full scoring | TLS days-left warning is enough |
| IPv6-only, HTTP POST bodies, mTLS client certs | v1 GET/TCP |
| On-call, PagerDuty, ack SLA | Human AM still owns renew |
| Merging into Guard/SIEM/scan | Domain split |
| Customer-supplied probe VMs | Pattern A: **our** egress |
| Hard rebrand / GTM finance rows | Must not gate |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| Tenancy | `organization_id` + Workspace roles (viewer read; member+ CRUD; admin+ delete all) |
| Probe | **Single region** from existing worker host (new Celery queue `uptime_check`) |
| Interval | Default **60s**; min **60s**; max **15 min** |
| Timeout | Default **10s**; max **30s** |
| HTTP | GET; max redirects **3**; success = **2xx–3xx** unless `expect_status` set |
| Keyword | Optional substring in body (first 64 KiB); case-sensitive default **false** |
| TLS | Warn if cert expires in **≤14 days** (email once / 24h); not a “down” |
| TCP | Connect only; success = handshake within timeout |
| Confirm | **2** fails → down; **1** OK → up |
| Retention | Check samples **7 days**; state events **90 days** |
| Timezone display | `Asia/Jakarta` |
| Locale | UI/email **id** (i18n keys) |
| SSRF | Block link-local, loopback, RFC1918, metadata IPs **unless** platform flag `UPTIME_ALLOW_PRIVATE=true` (lab only) |
| User-Agent | `SinexisUptime/1.0` (+ public docs later) |
| Credits | **No debit per check** |
| Feature flag | `UPTIME_ENABLED` default **true** in code after S1; CI can keep on. Not SIEM-style off unless ops asks |

---

## 5. Industry notes (research summary)

Thin products that match attach (Uptime Kuma, Healthchecks, StatusCake, Hetrix “cheap”):

- v1 is **HTTP + interval + email on state change**, not a full APM.
- **Retries/confirm** beat multi-region for false 502s on a single VPS.
- Public status pages are a **different SKU** (comms, not monitoring).
- Do not run checks from the same box as the target (Guard agent) — that hides upstream/ISP failure.

Sinexis should look like **Kuma-thin inside Workspace**, billed as Scan add-on seats — not Better Stack.

---

## 6. Actors

| Actor | Notes |
|-------|--------|
| Org viewer | List monitors, 24h %, last status |
| Org member | Create/edit monitors within SKU cap |
| Org admin/owner | Delete; pause all |
| Platform admin | Abuse disable; not hotel owner via `is_admin` |
| AM / ops | Quote “pantau HTTP” on existing SID; no new finance row required for v1 seats |

---

## 7. Data model (sketch)

### 7.1 `uptime_monitors`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | UUID FK | required |
| `created_by` | UUID FK users | |
| `asset_id` | UUID NULL FK `scan_assets` | optional; unique if set |
| `name` | str | |
| `check_type` | `http` \| `tcp` | |
| `target` | str | URL or `host:port` normalized |
| `interval_seconds` | int | ≥ 60 |
| `timeout_seconds` | int | |
| `expect_status` | int NULL | HTTP only |
| `keyword` | str NULL | |
| `keyword_invert` | bool | default false (fail if missing) |
| `enabled` | bool | |
| `state` | `unknown` \| `up` \| `down` \| `degraded` | `degraded` = TLS warn only |
| `consecutive_fails` | int | |
| `last_checked_at` | timestamptz NULL | |
| `last_status_code` | int NULL | |
| `last_error` | str NULL | sanitized, no secrets |
| `next_check_at` | timestamptz | beat cursor |
| `notify_email` | str NULL | default creator email |
| `created_at` / `updated_at` | timestamptz | |
| unique | `(organization_id, check_type, target)` among enabled | |

### 7.2 `uptime_samples` (hot, short TTL)

| Column | Notes |
|--------|-------|
| `monitor_id`, `checked_at`, `ok` bool, `latency_ms`, `status_code`, `error` | Partition or delete job > 7d |

### 7.3 `uptime_events` (state machine)

| Column | Notes |
|--------|-------|
| `monitor_id`, `from_state`, `to_state`, `at`, `notified` bool | Down/up/TLS warn |

Do **not** store response bodies.

---

## 8. Commercial / SKU fit

| Scan tier | Asset cap (P3) | **Uptime seats (proposal)** |
|-----------|----------------|------------------------------|
| Basic | 1 | **1** HTTP or TCP |
| Pro | 3 | **3** |
| Multi | 10 | **10** |

- **Included** in Scan add-on (no third invoice line in v1) — fastest GTM.
- Alternate (open §11): paid **Uptime add-on** IDR TBD — **do not invent list price** in git until user locks P0.
- Overage: hard block create/enable (same as assets), not silent fair-use.

---

## 9. API sketch (not binding)

| Method | Path | AuthZ |
|--------|------|-------|
| `GET` | `/api/uptime/monitors` | viewer+ |
| `POST` | `/api/uptime/monitors` | member+; SKU cap |
| `PATCH` / `DELETE` | `/api/uptime/monitors/{id}` | member+/admin policy |
| `GET` | `/api/uptime/monitors/{id}/samples?from=` | viewer+; max 7d |
| `GET` | `/api/uptime/monitors/{id}/events` | viewer+ |
| `POST` | `/api/uptime/monitors/{id}/pause` | member+ |

All org-scoped. IDOR tests mandatory.

**Worker:** Celery `uptime.run_due` every **15s** (select `next_check_at <= now()`, limit 50) → `uptime.check` on queue `uptime_check`. Do not use `ip_scan` / `domain_scan` workers (nmap contention).

**Compose:** new service `worker_uptime` (or attach to a light worker). Beat entry next to `schedules.run_due`. Deploy via `deploy-services.sh` including the new worker — **never** volume-wipe postgres.

---

## 10. SPA sketch

- Route **`/uptime`**. Sidebar: Uptime / Monitor (i18n `id`).
- Table: name, type, target (truncated), state badge, 24h %, last latency, last check.
- Form: URL or host:port, interval, keyword optional, notify email.
- Empty: CTA from `/assets` “Pantau HTTP aset ini”.
- No world map, no public badge.

---

## 11. Open questions (user before S1)

| # | Question | Recommendation |
|---|----------|----------------|
| **Q1** | Include seats in Scan SKU vs new `service_id`? | **Include** until finance asks |
| **Q2** | Min interval 60s vs 5 min? | **60s** default; 5 min allowed |
| **Q3** | Allow RFC1918 if customer colo only has private IP? | **Off** by default; lab flag |
| **Q4** | TCP in v1 or HTTP-only? | **Both** — colo often cares :443 and :22 |
| **Q5** | Webhook v1? | **No** — email only |
| **Q6** | Public status page? | **No** |
| **Q7** | Feature flag default? | **On** after S1 (unlike SIEM) |
| **Q8** | Epic letter in guide? | **P8** after P7; GTM still parallel; do not jump Guard lab |

---

## 12. Slices (implement only after explicit verb)

| Slice | Deliverable | Depends |
|-------|-------------|---------|
| **S0** | This spek + pointer in guide/handoff (docs PR) | — **this file** |
| **S1** | Model + Alembic + CRUD API + AuthZ + SSRF + SKU cap | S0 + Q1–Q4 |
| **S2** | Worker queue + beat `uptime.run_due` + confirm state machine + samples | S1 |
| **S3** | Email down/up (+ TLS warn throttle) | S2 |
| **S4** | SPA `/uptime` + Sidebar + i18n | S1 |
| **S5** | Compose worker, ops notes, pytest+Vitest, edge smoke (lab URL only) | S2–S4 |

Default order: **S0 → S1 → S2 → S3 → S4 → S5** (S4 can parallel S3 after S1).

---

## 13. Acceptance (epic-level, after implement)

- [ ] Org CRUD monitors; IDOR green
- [ ] HTTP GET + TCP; confirm-2 fails before down email
- [ ] Up email on recovery; no mail storm (one event per transition)
- [ ] SKU hard cap 1/3/10 enabled
- [ ] SPA `/uptime`; not under Guard/SIEM
- [ ] No bodies/secrets/customer URLs in git; UA `SinexisUptime/1.0`
- [ ] Private IP blocked unless lab flag
- [ ] Scan/Guard/SIEM tables untouched

---

## 14. Abuse, legal, ops

- Interval floor + per-org cap + global worker concurrency (e.g. 20 in-flight).
- Timeouts always; no unbounded redirects.
- Document probe UA so customer firewalls can allowlist.
- ToS later: monitoring is **best-effort**, not SLA 99.99 unless GMD sells a separate SLA (human).
- Do not probe third-party sites the org does not own (honour target = org asset; no open “monitor google.com” in marketing). Soft unique per org is not enough — **product copy**: only own properties.
- Lab smoke: use a dedicated lab vhost, not random internet.

---

## 15. References

- Guide §1.3 (insert P8 when S0 merges); §4 git/deploy
- [`scan-attach-v1.md`](scan-attach-v1.md) — beat/notify **pattern**, not tables
- [`assets-v1.md`](assets-v1.md) — optional `asset_id`
- [`workspace-v1.md`](workspace-v1.md) — AuthZ
- [`guard-v1.md`](guard-v1.md) / [`siem-v1.md`](siem-v1.md) — **do not merge**
- `backend/app/services/email.py`, `workers/tasks/schedules.py`

---

*S0 locked 2026-08-24. Implementation in progress on `feat/uptime-v1`.*
