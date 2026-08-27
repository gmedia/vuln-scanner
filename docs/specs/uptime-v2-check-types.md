# Spec: Uptime check types v2 (P8.x)

**Status:** Draft — planning only. **Do not implement** until an explicit implement verb + this spec is named.
**Goal:** Extend P8 Uptime beyond GET+TCP so colo/VPS and hospitality attach can cover **200-but-wrong**, **authenticated health**, **NAT/cron jobs**, and (later) **DNS integrity** — without becoming Pingdom/Checkly.
**Epic:** **P8.x** (follow-on to [`uptime-v1.md`](uptime-v1.md) S1–S5 + [`status-page-v1.md`](status-page-v1.md)). Does **not** replace Scan, Guard, SIEM, or public status HTML.
**Depends:** v1 monitors (`http` \| `tcp`), SKU seats, SSRF `assert_public_host`, queue `uptime_check`, SPA `/uptime`.
**Commercial:** Still **no per-ping credits**. Seats stay **Basic 1 / Pro 3 / Multi 10** enabled monitors. Do **not** sell check-type as a SKU. Heartbeat **shares the same seat** in v2 (simpler than Better Stack’s split heartbeat SKU).
**Not this epic:** Slack/webhooks, subscriber mailing, auto-open incidents, Playwright/browser, gRPC, multi-region, customer probe VMs, UDP as a product type, ICMP as default, ACME in-app, nested status pages. **Timeout / expect_status SPA + edit:** [`uptime-advanced-settings.md`](uptime-advanced-settings.md) (S0 draft).

---

## 0) Relation to v1 (read first)

| Surface | v1 | v2 |
|---------|----|----|
| Types | `http` GET, `tcp` connect | Same + **HTTP options** (keyword invert, method/headers/body) + **`heartbeat`** + optional **`dns`** |
| Keyword | HTTP substring, first 64 KiB, invert in DB/API **without SPA toggle** | Invert in SPA; still **not** a separate `check_type` |
| TLS | Warn ≤14d, email `tls`, not down | **Verify fail = down**; expiry N days = **degraded** + existing daily email |
| Probe | Egress pull only | Pull **and** inbound heartbeat ingest |
| Status page | Component → `monitor_id` | Unchanged; new types may be mapped by display name only |
| Public page | Display name + up/down/degraded/unknown | **Never** raw URL, IP, auth headers, heartbeat token |

**Hard rules (inherit v1):**

1. New types still **must not** write `scan_findings` / `guard_alerts`.
2. SPA stays **`/uptime`** (create form + filters). Heartbeat copy-URL lives on the same page, not a new product nav.
3. SSRF: public DNS + block RFC1918/link-local/metadata unless `UPTIME_ALLOW_PRIVATE` (lab).
4. `check_type` column is `String(10)` today — **widen before** adding names longer than 10 chars. Prefer short tokens: `http`, `tcp`, `heartbeat`, `dns`, `ping`.
5. Confirm-before-down **2 fails / 1 success** applies to **pull** probes. Heartbeat uses **missed beat + grace**, not consecutive HTTP fails.

---

## 1. Problem

v1 answers “does GET or TCP connect succeed?” Customers still hit:

| Gap | Pain |
|-----|------|
| HTTP 200 + error HTML / maintenance / deface | Keyword exists; **invert** not in UI |
| `/health` needs `POST` or `Authorization` | GET-only; no headers/body |
| Cert invalid vs cert expiring | Mixed mental model (warn vs down) |
| Backup cron / PMS job / NVR behind NAT | Nothing to pull; need **push** |
| DNS hijack / fat-finger A record | Not a nameserver product; need **expected A/AAAA** |
| “Just ping the router” | ICMP dropped by cloud/SG → false down (v1 non-goal; stays **flagged P2**) |

---

## 2. Goals

1. **P0-A:** SPA toggle `keyword_invert` (HTTP only); i18n; tests.
2. **P0-B:** Optional HTTP **method** (`GET` \| `HEAD` \| `POST`), **headers** (allowlist), **body** (size cap); secrets never on status page.
3. **P0-C:** TLS **verify failure → `down`**; expiry ≤ threshold → `degraded` (keep 14d default, email once/24h).
4. **P1-A:** `heartbeat` monitors: opaque token URL, pending until first ping, missed-beat job, grace.
5. **P1-B:** `dns` monitors: public resolve A/AAAA vs expected set.
6. **P2:** `ping` (ICMP) **only** behind `UPTIME_ICMP=1` + docs that probe IPs must be allowed.
7. Tests: IDOR, SSRF on any new resolver path, header redaction, heartbeat token unguessable, no UDP.
8. Docs: this file; **no** customer hosts/IPs/tokens in git.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| **UDP** check type | Amplification (DNS/NTP); handshake-less; Better Stack requires `required_keyword` for a reason. Revisit only with tiny payload + expected short reply + rate limit — **not v2** |
| ICMP as **default** in the type dropdown | v1 locked; false downs (Hetrix/UptimeRobot). P2 flag only |
| JSONPath / JSON Schema assertions | Keyword on `/health` covers 90%; P0-B body + keyword is enough |
| DNS **nameserver** (query customer BIND) | Different product (MSP). v2 = **record integrity** only |
| Playwright / multi-step / gRPC | Other SKU / metered |
| Custom TCP/UDP **payload** from user | Arbitrary bytes to arbitrary hosts = scanner |
| Per-type SKU or credit debit | Industry sells count+interval; we sell seats |
| Slack, mailing list, auto-incidents | Status-page / comms epic |
| Follow redirects to private IPs | SSRF |
| Showing `Authorization` / heartbeat URL on **public** `/status/{slug}` | Secret |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| Seat meter | One enabled monitor = one seat, **including heartbeat and dns** |
| Interval (pull) | Unchanged: default 60s, min 60s, max 900s |
| Heartbeat grace | `interval_seconds + 60` (missed if no ping in that window) |
| Heartbeat first state | `unknown` / pending until **first** successful ping |
| HTTP methods | `GET` (default), `HEAD`, `POST` |
| Header allowlist | `Authorization`, `Accept`, `Content-Type`, `X-Api-Key`, `User-Agent` (UA still default `SinexisUptime/1.0` if omitted) |
| Header denylist | `Host`, `Content-Length`, hop-by-hop (`Connection`, `Transfer-Encoding`) |
| Body cap | 8 KiB request; response keyword still first **64 KiB** |
| Keyword | Case-insensitive substring; invert = fail if **present** |
| TLS verify | Enabled for HTTPS; failure = **down** |
| TLS expiry | ≤14 days = **degraded** + email `tls` ≤1/24h; not down |
| DNS | A + AAAA; expected set **exact match** of resolved addresses (order-insensitive) |
| Ping | Off unless `UPTIME_ICMP=1`; 3 echo, success = ≥1 reply |
| Confirm (pull) | 2 fails → down; 1 OK → up |
| Retention | Unchanged 7d samples / 90d events |
| SSRF | Unchanged |
| Public status | Display name + state enum only |

---

## 5. Industry notes (research summary)

Better Stack, UptimeRobot, Pingdom, Checkly, StatusCake, Hetrix:

- **Keyword** is an HTTP option (or sibling type), not ICMP.
- **API** in UptimeRobot ≈ HTTP + assertions; Checkly splits API vs uptime. For attach: **extend HTTP**, don’t add `api` enum.
- **Heartbeat** is always **push** + unique URL + grace; Better Stack meters heartbeats separately — we **don’t** in v2.
- **SSL expiry** is a sidecar on HTTPS (24h-ish), not a new monitor.
- **DNS** means either nameserver probe **or** record watch — we take **record watch**.
- **UDP** is rare and dangerous from cloud egress.
- **Ping** is last-resort; many targets drop ICMP.

Sinexis v2 should still look like **Kuma-thin inside Workspace**, not Checkly synthetics.

---

## 6. Check-type matrix (this spec)

| `check_type` | Slice | Probe | Target shape | Extra fields |
|--------------|-------|-------|--------------|--------------|
| `http` | P0 | Egress GET/HEAD/POST | `https://…` public URL | keyword, invert, method, headers, body, expect_status, TLS |
| `tcp` | v1 (no change) | Connect | `host:port` | — |
| `heartbeat` | P1-A | **Inbound** POST | n/a (we mint URL) | `heartbeat_token` hashed, `last_ping_at` |
| `dns` | P1-B | Public resolve | hostname | `dns_record` `A`\|`AAAA`, `expected_values` JSON list |
| `ping` | P2 | ICMP echo | hostname | flag-gated |

**Keyword is not a row.** UI may show “HTTP (keyword)” as a **preset** that only reveals the keyword fields.

---

## 7. Schema / API (normative)

### 7.1 Alembic

- Widen `uptime_monitors.check_type` if needed (`String(16)`).
- Drop/replace CK `check_type IN ('http','tcp')` → include new tokens **per slice** (P0 may keep http/tcp only).
- Nullable JSON/text:
  - `http_method` `String(8)` default `GET`
  - `request_headers` JSON object (values stored; **API GET redacts** allowlisted secret keys)
  - `request_body` Text nullable
  - `heartbeat_token_hash` (sha256), `heartbeat_token_prefix` (8 chars for UI)
  - `last_heartbeat_at` timestamptz
  - `dns_record` `String(8)`, `expected_values` JSON list of strings
- Do **not** store raw heartbeat token after create response.

### 7.2 Create/update validation

- `keyword` / `keyword_invert` / method / headers / body / expect_status: **HTTP only** (v1 already rejects on TCP).
- Heartbeat create: ignore `target` from client; server sets placeholder `heartbeat://{id}` or similar **non-public** target; return `heartbeat_url` **once**.
- DNS: hostname public; expected values must be IPs of the chosen record type.
- Ping: reject unless `UPTIME_ICMP`.

### 7.3 Routes

| Method | Path | Notes |
|--------|------|-------|
| existing | `/api/uptime/monitors` | Accept new fields |
| `POST` | `/api/uptime/heartbeat/{token}` | **No JWT**. Constant-time lookup by hash. 204. Rate-limit per token. |
| `POST` | `/api/uptime/monitors/{id}/rotate-heartbeat` | Member+; new token once |

Public status HTML **must not** embed heartbeat URL.

---

## 8. Worker / probe

| Slice | Behavior |
|-------|----------|
| P0-B | `probe_http`: method, headers (filtered), body; still redirect cap 3 + SSRF on each hop |
| P0-C | TLS handshake: verify error → fail (down path); days-left ≤14 → apply degraded **after** HTTP success |
| P1-A | `uptime.run_due` **skips** heartbeat rows. New beat `uptime.heartbeat_due`: if `now > last_heartbeat_at + interval + 60s` (or never pinged after create+grace) → fail path / confirm |
| P1-B | Resolve A/AAAA via public resolver (not customer NS); compare sets |
| P2 | 3 echo; need `cap_net_raw` or unprivileged ping — **document worker image**; if ICMP not available, create API returns 501 |

Email kinds unchanged: `down` / `up` / `tls`. Heartbeat missed uses `down`.

---

## 9. SPA `/uptime`

- Filter **Protocol** adds types as they ship (`http` / `tcp` / `heartbeat` / `dns`).
- Create form: type `Select` (no native `<select>`). HTTP advanced in a **collapsed** block: method, headers (key/value rows), body, keyword, invert `Select` or checkbox + `Label`.
- Heartbeat: after create, **copy URL once** + warning; rotate button.
- Table: target column for heartbeat shows `heartbeat` + prefix, **not** full token.
- Design tokens / Credit History filter bar: already on `feat/uptime-ops-table` — v2 forms must keep `h-10`, `gap-3`, `Label`.

Frozen e2e testids: `uptime-page`, `uptime-add`, `uptime-name`, `uptime-type`, `uptime-target`, `uptime-save`, `uptime-row`, `uptime-delete`, `uptime-pause`. Add `uptime-keyword-invert`, `uptime-heartbeat-url` without removing frozen ids.

---

## 10. Security

1. **SSRF** on HTTP/DNS/ping resolve — same `assert_public_host` / `resolve_public`.
2. **Redirects** must re-check IP after each hop.
3. **Headers:** redact `Authorization` and `X-Api-Key` in GET monitor, samples, events, emails, status page.
4. **Heartbeat token:** ≥128-bit random; store hash only; HTTPS only in prod docs; treat like enroll key — **never commit**, never print in agent logs at info.
5. **No UDP.**
6. **No user TCP payload.**
7. Rate-limit heartbeat ingest (e.g. 1/s per token).

---

## 11. SKU / flag

| Flag | Default | Role |
|------|---------|------|
| `UPTIME_ENABLED` | true (v1) | Master |
| `UPTIME_ALLOW_PRIVATE` | false | Lab SSRF override |
| `UPTIME_ICMP` | **false** | P2 ping |
| (optional) `UPTIME_HEARTBEAT` | true once P1-A merges | Kill switch |

Seats: count `enabled` rows of **all** types. At cap → existing 403 seat limit.

Publish status page SKU unchanged (pro/multi).

---

## 12. Build order (PRs)

| PR | Slice | Files (typical) | Done when |
|----|-------|-----------------|-----------|
| 1 | P0-A invert UI | `Uptime.tsx`, i18n, `Uptime.test.tsx`, worker test if missing invert | Toggle round-trips; HTTP 200 + invert fails |
| 2 | P0-B method/headers/body | Alembic, schema, `uptime_probe.py`, SPA advanced, redaction tests | POST `/health` with header; GET redacts secret |
| 3 | P0-C TLS split | `uptime_apply.py` + tests | Bad cert → down; expiring → degraded |
| 4 | P1-A heartbeat | Alembic, ingest route, beat, SPA copy/rotate, tests | Missed beat → down; token not in GET |
| 5 | P1-B dns | Alembic, probe, SPA, SSRF tests | Wrong A → down |
| 6 | P2 ping | Flag + probe + docs | 501 if flag off |

Do **not** mix heartbeat with HTTP advanced in one PR.

---

## 13. Tests (minimum)

- Schema: TCP still rejects keyword/headers.
- Invert: present → down; absent → up.
- Headers: `Host` rejected; `Authorization` stored, redacted on GET.
- Body > 8 KiB → 422.
- Heartbeat: 404 bad token; 204 good; rotate invalidates old; IDOR other org.
- DNS: expected mismatch → down; private resolved IP → fail closed (SSRF).
- Ping: create 422/501 when flag off.
- E2E: HTTP create/delete still uses `uptime-row` (table, not `listitem`).

---

## 14. Docs / hygiene

- Update [`uptime-v1.md`](uptime-v1.md) header: “check types v2 → `uptime-v2-check-types.md`”.
- Agent guide: one line under P8 — v2 spec exists; implement only when named.
- Public repo: no probe IPs, no real heartbeat URLs, no customer hostnames in examples (use `example.com`).

---

## 15. Acceptance (epic)

v2 **P0** is accepted when:

1. Invert + HTTP advanced + TLS split are on `main` with tests green.
2. Public status still never leaks URL/headers/token.
3. Seats unchanged.

v2 **P1** is accepted when heartbeat + DNS work in lab (`UPTIME_ALLOW_PRIVATE` as needed) without UDP/ICMP.

---

## 16. Opened questions (do not block P0)

1. Heartbeat URL on `sinexis.app` vs dedicated ingest host.
2. Whether Multi SKU gets extra heartbeat seats later (v2 = no).
3. Domain-expiry WHOIS (P2+, WHOIS rate limits) — **out** of this spec body.

**Default if unset:** ingest on existing API host; same seats; no WHOIS.
