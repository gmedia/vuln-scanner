# Spec: Uptime advanced probe settings (P8.x)

**Status:** Draft — **docs only**. **Do not implement** until an explicit implement verb (`implement` / `buat` / `kerjakan`) **and** this spec is named.
**Goal:** Let operators set **probe reliability knobs** (timeout, expected HTTP status) on `/uptime` without false-downs on slow colo origins — **without** becoming Pingdom, Checkly, or a SKU entitlement matrix.
**Epic:** **P8.x** follow-on to [`uptime-v1.md`](uptime-v1.md) (S1–S5) and [`uptime-v2-check-types.md`](uptime-v2-check-types.md) (check types on `main` #451). Does **not** replace Scan, Guard, SIEM, or public status HTML.
**Depends:** Existing `UptimeMonitor` columns `timeout_seconds` / `expect_status`; SPA `/uptime`; queue `uptime_check`; SKU seats Basic 1 / Pro 3 / Multi 10.
**Commercial:** Still **no per-ping credits**. Seats unchanged. Do **not** sell “advanced settings” as a SKU or Pro-only 403.
**Not this epic:** UDP, multi-region, webhooks, JSONPath, mTLS, maintenance windows (P6), skip-TLS (deferred), user-editable confirm count (deferred), ICMP default on.

---

## 0) Relation to v1 / v2 (read first)

| Surface | Today (code on `main`) | This spec |
|---------|------------------------|-----------|
| HTTP extras | Method, headers, body, keyword invert **in create form** (v2) | **Do not re-spec.** Move into the same **collapsed Advanced** block |
| Timeout | API default **10**, max **30**; **not in SPA**; client `UptimeCreatePayload` omits it | **SPA + PATCH** |
| `expect_status` | API exact int; else probe treats **200–399** as OK; **not in SPA** | **SPA + PATCH** (HTTP only) |
| Confirm | Hardcoded `CONFIRM_FAILS=2` | **Unchanged** (not user-editable in S0) |
| Redirects | Probe `follow_redirects=True`, cap **3** | **Unchanged** |
| TLS verify | On; verify fail = **down**; expiry ≤14d = **degraded** | **No skip-verify** in S0 |
| Edit | PATCH schema exists; SPA **create-only** + pause/delete | **Edit form** for the same fields |
| Status page | Display name + state enum | **Never** timeout, URL, IP, headers, token |

**Hard rules (inherit):**

1. Do **not** write uptime results into `scan_findings` / `guard_alerts`.
2. SSRF unchanged (`assert_public_host`; `UPTIME_ALLOW_PRIVATE` lab only).
3. Confirm is **across ticks**, not N HTTP retries inside one `uptime.check`.
4. Seat overflow remains **HTTP 400** with existing copy (`Uptime seat limit for {sku} tier is {limit}`) — not 403.
5. Frozen e2e testids stay: `uptime-page`, `uptime-add`, `uptime-name`, `uptime-type`, `uptime-target`, `uptime-save`, `uptime-row`, `uptime-delete`, `uptime-pause`, `uptime-keyword-invert`, `uptime-heartbeat-url`.

---

## 1. Problem

AM can already create HTTP/TCP/heartbeat/DNS monitors. Operators still cannot:

| Gap | Pain |
|-----|------|
| Timeout stuck at 10s | Slow origin / TLS handshake on colo → false **down** |
| No expected status in UI | Health that returns **204** or **301** only cannot be expressed without API |
| Create-only SPA | Changing timeout after create requires curl |
| Flat form | v2 HTTP extras already long; more knobs without accordion = clutter |

This is **UI + edit debt** on fields the API already stores — not a new probe type.

---

## 2. Goals

1. SPA **collapsed Advanced** on create **and** edit: timeout, expected status (HTTP), plus existing v2 HTTP extras (method/headers/body/keyword/invert) in the **same** block.
2. Round-trip: omit timeout → **10**; `timeout_seconds: 31` → **422**; `expect_status` null → 200–399 class; set `204` → exact match.
3. **PATCH** from SPA (member+); viewer read-only.
4. i18n `id`/`en` keys for the new labels.
5. Tests: schema bounds, IDOR PATCH, public `/status/{slug}` body must **not** contain timeout / target URL / `Authorization`.
6. Docs: this file; pointer in the execution guide. **No** customer URLs/IPs in git.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| Re-implement method/headers/body/keyword invert | Already v2 |
| Heartbeat / DNS / ping / UDP | Other specs / flags |
| `confirm_fails` user 1–5 | Locked **2** unless a later Q reopens |
| `follow_redirects` toggle | Cap 3 stays; SSRF on hops already required |
| `tls_insecure` / skip verify | v2 lock: verify fail = down; colo self-signed = later Q |
| Basic-auth username/password fields | Use v2 `Authorization` header |
| Maintenance windows / mute | **P6** hospitality |
| Multi-region, webhooks, Slack, JSONPath, mTLS, Playwright | v1/v2 non-goals |
| Interval &lt; 60s | Worker load |
| Per-check credits / Pro-only knobs | Seats only |
| Native `<select>` / unlabeled inputs | Design system |
| Status-page fields | P11 leak rule |

---

## 4. Defaults (locked)

| Topic | Default |
|-------|---------|
| Timeout | **10s**; min **1**; max **30** (existing model) |
| Expected status | **null** → success **200–399**; if set, **exact** integer 100–599 |
| Confirm | **2** fails → down; **1** OK → up |
| Redirects | Follow, max **3** |
| TLS | Verify on; no skip |
| SKU | All tiers; same seat cap; knobs **not** gated |
| Accordion | Closed by default on create; open if edit has non-default timeout or `expect_status` set |
| Public status | Name + `up`/`down`/`degraded`/`unknown` only |

---

## 5. Q lock (session 2026-08-27)

| Q | Decision |
|---|----------|
| S0 meaning | **Expose** existing API knobs + **edit**; not new columns |
| TLS skip | **No** |
| Confirm editable | **No** (stay 2) |
| SKU | **All tiers** |
| Accordion | **Yes** — one Advanced block |
| Follow-redirects / confirm / skip-TLS | Deferred; reopen only with explicit implement + this file named |

---

## 6. UX

- Route stays **`/uptime`**. No new nav item.
- Create and **edit** (row action or dialog) share field set.
- **Advanced** = shadcn collapsible / accordion (not a second page).
- Controls: `Label` + `Input` / `Select`; height `h-10` (Credit History filter pattern).
- Timeout: number input, suffix seconds, HTTP **and** TCP (and ping if flag on). Hidden/disabled for **heartbeat** (ingest has no client timeout).
- Expected status: HTTP only; empty = class 2xx–3xx; placeholder `200`.
- New testids (add, do not remove frozen): `uptime-advanced`, `uptime-timeout`, `uptime-expect-status`, `uptime-edit`.
- Heartbeat URL still only on create/rotate (`uptime-heartbeat-url`).

---

## 7. API / model

**No Alembic in S0** if columns already exist (`timeout_seconds`, `expect_status`).

| Field | Create | PATCH | Notes |
|-------|--------|-------|-------|
| `timeout_seconds` | optional, default 10 | optional | 1–30 |
| `expect_status` | optional | optional, nullable to clear | HTTP only; 422 if set on tcp/dns/heartbeat/ping |

Client `frontend/src/api/uptime.ts` **must** include these on create/update.

Overflow seats: still **400**, not 403.

---

## 8. Probe

`uptime_probe.py` already applies monitor timeout and exact `expect_status`. S0 must **not** add in-tick retries.

Heartbeat / DNS / ping: ignore `expect_status`; timeout applies to DNS/TCP/ping connect only.

---

## 9. Slices (after implement verb)

| Slice | Deliverable |
|-------|-------------|
| **S1** | SPA Advanced accordion: timeout + expect_status + move v2 HTTP extras into it; i18n; client types |
| **S2** | Edit/PATCH UI for the same fields |
| **S3** | Tests: pytest bounds + IDOR; Vitest/Playwright testids; public status HTML must not leak |

**S3 deferred columns** (not in this draft): `confirm_fails`, `follow_redirects`, `tls_insecure`.

---

## 10. Acceptance (agent-executable)

Do **not** require a human to click. After implementation:

```bash
# Schema
cd backend && python -m pytest tests/test_uptime.py -q -k timeout
# expect: timeout_seconds 31 → 422; omit → stored 10; expect_status 200 round-trip

# Seat (unchanged)
# second enabled monitor on basic → HTTP 400 body contains "seat limit"

# Public status leak
curl -sS "$PUBLIC_BASE/status/$SLUG" | tee /tmp/uptime-adv-status.html
# assert: no monitor target URL, no "Authorization", no "timeout_seconds"
```

Playwright / Vitest: `[data-testid="uptime-advanced"]`, `uptime-timeout`, `uptime-expect-status`, `uptime-save`; frozen ids still present.

IDOR: PATCH other-org monitor → 403 or 404.

---

## 11. Files (expected)

- `frontend/src/pages/Uptime.tsx`
- `frontend/src/api/uptime.ts`
- i18n catalogs (`id` / `en`)
- `frontend/src/test/Uptime.test.tsx` (and e2e if present)
- `backend/app/schemas/uptime.py` only if validation gaps
- This spec + one-line pointer in `docs/AGENT_EXECUTION_GUIDE.md` §1.3 P8

---

## 12. Agent rules

- **Do not implement** until named + implement verb.
- Do not mass-merge Dependabot in the same PR.
- Do not recapture screenshots unless asked.
- Prefix git with `GIT_MASTER=1`; never commit on `main`; never commit secrets/IPs/PNGs.
