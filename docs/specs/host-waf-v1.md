# Spec: Host WAF v1 (P13 — on-box web request filter control plane)

**Status:** **S0–S5 shipped**; **P14 F** adds **protect** on **Host Multi** (customer nginx `SecRuleEngine On`). Product **P12 Host Protect** is on `main` (malware files). This epic is **HTTP request filtering** for the **same Guard-enrolled VPS**, not a rewrite of `/host` scans. **Coraza on Sinexis edge / full CRS = not this product.**
**Goal:** first **WAF attach** that GMD relations can describe as “Imunify-like request block” **without** cloning Imunify360, ModSecurity commercial rules, or putting Coraza on the **Sinexis public edge**.
**Epic:** **P13**. Does **not** replace P12 file malware, P5 Guard, P7 SIEM, or P1 Scan. Does **not** jump GTM / Host Protect IDR lock.
**Depends:** P2 Workspace · P5 Guard enroll · P12 `host_sites` (policy is **per site**, same `root_path` / agent).
**Commercial (working):** extend [`docs/commercial/sku-host-protect.md`](../commercial/sku-host-protect.md) **H7** — WAF is a **Host Multi+** (or later SKU line). List IDR **unset**. AM must not invoice from this file.

**Inspiration (not a clone):** Imunify360 “Proactive Defense / WAF” job: *stop obvious HTTP exploit noise on a VPS without SSH-editing nginx*. Positioning: **sit beside** Imunify on cPanel farms; **attach** on GMD VPS/colo with nginx/Caddy and no panel suite.

**Not this epic:** Imunify trademarks/rulesets, PHP Proactive Defense, KernelCare, CAPTCHA/WebShield, email anti-spam, putting Coraza in `nginx/sinexis.app.conf`, CrowdSec as the product, CRS paid packs in git.

**Follow-on:** protect-on-customer-nginx is **P14 slice F** / **wave 2** — [`imunify-class-onbox.md`](imunify-class-onbox.md) §7. Protect mode is **Host Multi** only; snippet still never for `sinexis.app` edge.

---

## 0) Relation to Host Protect (read first)

| Surface | Job | Route |
|---------|-----|--------|
| **Host Protect (P12)** | Files on disk: YARA/Clam, quarantine | `/host` — sites, hits, isolate |
| **Host WAF (this spec)** | **Requests** to that site: allow/deny/log | **Same SPA `/host`** with a **WAF** tab — **not** `/guard`, **not** `/siem` |

**Hard rules:**

1. Do **not** ship WAF under “Guard” or “SIEM.”
2. Do **not** merge WAF events into `scan_findings` or `host_hits` (different domain: HTTP vs file).
3. Do **not** treat Playwright as enroll. Live lab: **not** `sx-erpstg` (customer ERP, different account). **tc5** is the Sinexis Guard lab agent VM — Host WAF `--apply-vhost` may copy a **lab fixture** snippet there. Never paste onto `sinexis.app` edge.
4. Do **not** copy Imunify/OWASP commercial rule text into the product UI.
5. **Sinexis edge** (`sinexis.app` host nginx) stays **out** of this epic. WAF runs on the **customer VPS** (or a lab fixture), not as a global reverse-proxy for the SaaS.

If sales wants “one security page,” that is **tabs on `/host`**, not a new sidebar item in v1.

---

## 1. Problem

| Gap today | Pain |
|-----------|------|
| Host Protect sees **webshell files** | Relasi still ask “kayak Imunify WAF”: SQLi/RCE **in flight** |
| Scan is outside-in | Does not block POST to `xmlrpc.php` |
| Guard is OS/agent | No HTTP filter policy in SaaS |
| Putting Coraza on Sinexis nginx | Protects **us**, not the customer site |

---

## 2. Goals

1. **Policy per `host_sites` row:** mode `off` \| `detect` \| `protect`; default **off**.
2. **SaaS is the control plane:** CRUD policy + list recent events. Enforcement engine is **pluggable**.
3. **S1–S3:** mock engine (no Coraza binary in CI). Flag `HOST_WAF_ENABLED` default **false** → API **404**.
4. **S4+:** optional **Coraza** (or nginx `modsecurity` / `lua-resty`) **on the enrolled VPS**, config **generated** from policy (CRS **paranoia 1** subset **or** a tiny in-repo rule pack — **not** Imunify DB).
5. **Events:** method, path (truncated), rule id, action `log` \| `block`, status, timestamp. **No** raw body dump in v1 (exfil).
6. **AuthZ:** viewer+ list; admin+ change mode; member+ cannot flip protect.
7. **SPA:** WAF tab on `/host`; kit only; frozen testid `host-waf-panel`.
8. **SIEM hand-off (S3):** optional case on **block** of class `rce`/`sqli` — reuse P7; no `full_log`.
9. **Tests:** flag-off 404, IDOR, role matrix, path/host allowlist if any listen address is stored.
10. **Docs:** this file + guide P13; **no** IPs/secrets in git.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| Coraza on **Sinexis** public nginx | Wrong tenant |
| Full CRS 4 + paranoia 4 in git | Noise + license/ops |
| Auto-learn / ML | Out of v1 |
| TLS termination product | Customer already has nginx |
| Replacing Cloudflare / Imunify | Beside, not clone |
| PHP runtime hooks | Imunify PD — out |
| cPanel plugin | Q later |
| Same PR as Host Protect malware engine | Different tables |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| Flag | Prod compose default **true** (API). Local/CI **false**. Per-site mode still **off**. |
| Mode | `off` |
| Engine S1–S3 | **mock** (insert 0–1 synthetic event on “simulate”) |
| Engine S4 | Coraza **or** nginx snippet **generated**; install = **hybrid/ops** on VPS |
| Listen | Do **not** store customer public IPs in git; policy has **no** listen IP field in S1 (site + agent only) |
| Body | Never persist request body |
| SKU | WAF **not** on Host Basic in working SKU; Pro/Multi **detect** OK; **protect** = Multi or owner lock |
| Require Guard | **Yes** (same as P12) |

---

## 5. Data model (S1)

### 5.1 `host_waf_policies`

- `id` UUID PK
- `organization_id` FK orgs CASCADE
- `site_id` FK `host_sites` CASCADE **unique** (one policy per site)
- `mode` `off` \| `detect` \| `protect`
- `engine` `mock` \| `coraza` \| `nginx_modsec` (S1: only `mock` writable)
- `paranoia` int 1–4, default **1**
- `updated_by` FK users
- timestamps

### 5.2 `host_waf_events`

- `id` UUID PK
- `organization_id`, `site_id`, `policy_id` (SET NULL)
- `action` `log` \| `block`
- `rule_id` string (e.g. `mock.sqli.1`, later `CRS-942100`)
- `method` string ≤8
- `path` string ≤256 (truncated)
- `http_status` int nullable
- `created_at`

No unique on path (flood is a later rate-limit problem; S1 list last 100).

---

## 6. API (S1)

Prefix `/api/host/waf`. JWT + org. Flag off → **404**.

| Method | Path | Role | Notes |
|--------|------|------|--------|
| GET | `/policies` | viewer+ | join site name |
| PUT | `/sites/{site_id}/policy` | admin+ | upsert; `engine` `mock` \| `coraza` \| `nginx_modsec` (S4+) |
| GET | `/events` | viewer+ | `site_id` filter, limit 100 |
| POST | `/sites/{site_id}/simulate` | member+ | mock event if mode ≠ off (still synthetic; engine field is for snippet) |
| GET | `/sites/{site_id}/snippet` | admin+ | generated nginx/Coraza include; **no** listen IP; never for `sinexis.app` edge |

---

## 7. Slices

| S | Deliverable | DoD |
|---|----------------|-----|
| **S0** | This spek + SKU H7 note + guide P13 | Merged docs; **no** app code |
| **S1** | Models + Alembic + API + flag | pytest AuthZ/IDOR; flag-off 404 |
| **S2** | SPA WAF tab on `/host` | vitest; testid `host-waf-panel` |
| **S3** | Optional SIEM case on mock block | no `full_log` |
| **S4** | Coraza/nginx **generator** + ops runbook | **not** auto-SSH to `tc5`; lab vhost only |
| **S5** | Live lab smoke (disposable vhost) | `scripts/host-waf-lab-smoke.sh`; never ERP/`tc5`; no edge nginx |
| **S5b** | SPA copy snippet | `host-waf-copy-snippet`; toast warns against sinexis.app edge |

---

## 8. Open questions (owner)

| Q | Topic | Default if unanswered |
|---|--------|------------------------|
| **W1** | Separate SKU vs Host Multi | **Host Multi includes detect**; protect billed later |
| **W2** | CRS vs tiny in-repo rules | **Tiny mock + S4 generator**; CRS as ops overlay |
| **W3** | Agent vs worker applies config | **Ops/hybrid S4**; SaaS does not SSH |
| **W4** | IPv6 / HTTP/2 | Out of S1 |

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Protect mode 403s the CMS admin | Default off; detect first; paranoia 1 |
| False “we run WAF on sinexis.app” | Docs + AM copy: **customer VPS** |
| Event PII (tokens in query) | Truncate path; strip `?` in S1 |
| Legal | No Imunify IP |

---

## 10. Agent notes

- New branch from latest `main`. Atomic commits. `GIT_MASTER=1`.
- Do not print IPs/tokens. Do not wipe ERP.
- Speak Bahasa with the user; this spec stays English.
