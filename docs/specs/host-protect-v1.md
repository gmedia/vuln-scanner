# Spec: Host Protect v1 (P12 — on-box web malware control plane)

**Status:** **S0 draft** (2026-08-30). Docs only. Do **not** implement until the user uses an explicit verb (`implement` / `buat` / `kerjakan` S1+).
**Goal:** first **on-host web malware** surface for orgs that already run **Guard thin** — named web paths, scheduled file/YARA (or Clam) scan, incidents in product, **opt-in quarantine** — **without** cloning Imunify360 (no PHP Proactive Defense, no KernelCare, no cPanel plugin in v1).
**Epic:** **P12**. Does **not** replace P5 Guard, P7 SIEM, or P1 Scan attach. Does **not** jump GTM / Scan SKU lock.
**Depends:** P2 Workspace (JWT `org_id`) · P3 Assets (optional link) · P5 Guard enroll (agent on VPS) · P7 SIEM cases (incident hand-off).
**Commercial (working, not P0 lock):** [`docs/commercial/sku-host-protect.md`](../commercial/sku-host-protect.md) — **list IDR unset** until product owner locks.
**Inspiration (not a clone):** CloudLinux Imunify360 job-to-be-done for GMD relations who already buy “Imunify on the panel”: *know which web roots are dirty, isolate without SSH guesswork*. Positioning: **sit beside** Imunify on shared cPanel farms; **attach** on GMD VPS/colo that have no panel suite.

**Not this epic:** Imunify rulesets/UI copy, ModSec/Coraza WAF (S6+), PHP runtime hooks, live kernel patch, auto password-reset, WebShield CAPTCHA, Imunify Email, CageFS-class shared-host isolation.

---

## 0) Relation to existing modules (read first)

| Surface | Job | Route |
|---------|-----|--------|
| **Scan attach (P1)** | External exposure on a schedule | `/` Dashboard, `/schedules`, ScanDetail |
| **Assets (P3)** | Named scan targets (IP/domain) | `/assets` |
| **Guard (P5)** | Host watched + critical OS alerts | `/guard` — inventory, level ≥12, enroll |
| **SIEM (P7)** | Analyst search + cases | `/siem` — **not** Discover on `/guard` |
| **Host Protect (this spec)** | **Web roots on that host**: malware hits, quarantine | **New** `/host` — **not** a rewrite of `/guard` |

**Hard rules:**

1. Do **not** ship Host Protect UI under “Guard” or “SIEM.” Sidebar item **distinct**.
2. Do **not** merge malware file hits into `scan_findings`.
3. Do **not** treat Playwright as agent enroll. Live lab: wipe-first **only** if user asks full Guard e2e; **do not** wipe `sx-erpstg`. Prefer a **separate web-root fixture** on lab agent, not production ERP.
4. Do **not** copy Imunify trademarks, screenshots, or proprietary signatures into the product.

If sales later wants “one security page,” that is **navigation after S5** — not a reason to delete Guard thin.

---

## 1. Problem

| Gap today | Pain |
|-----------|------|
| Scan is **outside-in** (nmap/headers/CVE) | Relasi hosting bertanya “kayak Imunify”: webshell di `public_html`, bukan CVE nginx |
| Guard is **OS/agent** critical | Tidak ada katalog *situs* / docroot per VPS |
| SIEM is **events** | Tidak ada alur “file X → quarantine → restore” |
| Imunify lives **in the panel** | GMD VPS/colo often **no** cPanel; AM cannot show a GMD-branded control plane |
| Auto-clean without backup | Merusak CMS; tiket lebih mahal dari malware |

Need a **thin control plane**: register web paths on an enrolled host, scan on a schedule, show hits, optional **quarantine** with audit — hybrid human cleanup remains valid.

---

## 2. Goals

1. **Org-scoped web sites** (`host_sites`): display name, absolute path on agent, optional CMS hint, optional FK to `scan_assets` and/or `guard_agents`.
2. **SKU hard cap** on site count (working: Basic **1** · Pro **3** · Multi **10** paths) — independent of Scan asset cap unless owner later unifies.
3. **Scheduled + on-demand malware scan** of those paths via **Guard agent** (wodle / custom script): YARA and/or ClamAV; **mock client in CI**.
4. **Hits table** (path, class, first/last seen, status `open` \| `quarantined` \| `ignored` \| `restored`).
5. **Opt-in quarantine** (move file to org-scoped quarantine dir + deny execute) + **restore**; default **off** for auto; admin+ only.
6. **Incident hand-off:** critical class (webshell/backdoor) → optional SIEM case; email using existing notify patterns.
7. **SPA `/host`:** list sites, last scan, hits, quarantine actions. shadcn; i18n id/en; selected locale/theme chips **must not** be primary green (existing AppShell pattern).
8. **AuthZ:** viewer+ read; member+ request scan; admin+ CRUD sites, quarantine, ignore.
9. **Tests:** IDOR, path traversal rejection, cap, mock scan, quarantine audit, flag-off 404.
10. **Docs:** this spek + SKU working file + guide P12 row. **No** IPs, enroll keys, customer docroots in git.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| **Imunify360 clone / CloudLinux license replacement** | Different product; legal + years of shared-host edge cases |
| **PHP Proactive Defense / ionCube-style runtime** | Needs PHP SAPI module; S6+ research |
| **KernelCare / HardenedPHP** | Third-party live patch; out |
| **ModSecurity / Coraza WAF / virtual patch WP** | S6+; false-positive = downtime |
| **cPanel / Plesk / DirectAdmin plugin** | S6+ only if ops names the panel |
| **Shared-host many-UID one kernel (CageFS)** | v1 = **one agent / one VM** (VPS/colo) |
| **Auto malware rewrite / “safe cleanup” of PHP** | Quarantine only; hybrid ticket for reconstruct |
| **Force password reset WP/cPanel** | Dangerous without panel API |
| **WebShield CAPTCHA / L7 anti-bot** | Edge/CDN later |
| **Imunify Email / outbound spam queue product** | Out |
| **Herd CloudAV / sample upload to third parties** | Privacy; optional later with DPA |
| **Windows / IIS** | Linux agent first |
| **Discover / raw logs on `/guard`** | SIEM stays on `/siem` |
| **Merge into `scan_findings`** | Separate domain |
| **PII / lab IPs / real `public_html` paths of customers in markdown** | Public repo |

---

## 4. Defaults (locked unless user overrides)

| ID | Topic | Default |
|----|--------|---------|
| **D1** | Topology | **One Guard agent per VM**; sites are paths **on that agent**. No shared-kernel multi-tenant scanner in v1. |
| **D2** | Positioning | **Attach beside** Imunify where panel already has it; **primary** on GMD VPS/colo without Imunify. |
| **D3** | Cleanup | **Quarantine + restore** only. **No** automatic in-place clean. Auto-quarantine **off** until org admin enables. |
| **D4** | Scanner | Pluggable: **mock** (CI) · **YARA** (preferred signatures we maintain) · optional **ClamAV** if present on image. Do not vendor Imunify DB. |
| **D5** | Schedule | Beat-driven per site; default **daily**; cap concurrent scans per org (e.g. 2). |
| **D6** | Path policy | Absolute POSIX path; must be under an **allowlist prefix** configured per agent (e.g. `/var/www`, `/home/*/public_html` pattern **server-side**). Reject `..`, NUL, non-UTF8, symlink escape (resolve + prefix check). |
| **D7** | Flag | `HOST_PROTECT_ENABLED` default **false** in CI and until ops injects. API/SPA **404** / feature-off copy when false. |
| **D8** | Credits | Working: on-box scan **bundled** (cost **0**) **or** pricing key `hostscan` (≤10 chars) if owner wants meter. **Do not** mix with HPP. Seed 0 if metered. |
| **D9** | AuthZ | viewer+ list/hits; member+ `POST .../scan`; admin+ site CRUD, quarantine, restore, ignore, toggle auto-quarantine. Platform `is_admin` ≠ org owner. |
| **D10** | SIEM | Create case **only** for classes `webshell` \| `backdoor` (configurable). Do not dump file bytes into case notes. |
| **D11** | Lab | Do **not** wipe live ERP agent. Fixture dir on lab VM or extra VM. `GUARD_LAB_ALLOW_PUBLIC_PROD` rules unchanged. |
| **D12** | Language | Spec English; user chat Bahasa; UI i18n catalogs. |

---

## 5. Actors

| Actor | Notes |
|-------|--------|
| **Org viewer** | List sites + hits; no quarantine |
| **Org member** | On-demand scan |
| **Org admin / owner** | CRUD sites, quarantine/restore, auto-quarantine flag |
| **Platform admin** | Flag/ops; not automatic all-org file access via UI bugs |
| **SaaS worker** | Dispatches scan job to agent channel (Wazuh wodle / existing Guard worker pattern) |
| **Host agent** | Runs scanner as constrained user; cannot scan outside allowlist |
| **AM / hybrid** | Tickets for reconstruct; not in-app SOAR |

---

## 6. Architecture (thin)

```text
┌─────────────┐  JWT org_id   ┌──────────────────────────┐
│ SPA /host   │ ────────────► │ FastAPI Host Protect API │
│ sites+hits  │ ◄──────────── │ AuthZ, path policy, DTOs │
└─────────────┘               └────────────┬─────────────┘
                                           │
                    ┌──────────────────────┼─────────────┐
                    ▼                      ▼             │
              Postgres               Guard worker        │
              host_sites             (enqueue)           │
              host_scans                                 │
              host_hits                                  │
              host_quarantine                            │
                                           │
                                           ▼
                                    Agent on VPS
                                    (YARA/Clam in jail)
```

Wazuh remains **transport + inventory**. Product APIs are org-scoped only. Scanner results **project** into Postgres; do not require tenants to query Indexer for file hits.

---

## 7. Data model (proposed)

Align with existing SQLAlchemy (`UUID`, timestamptz, CheckConstraints, descriptive Alembic ids). Names illustrative.

### 7.1 `host_sites`

| Column | Type | Notes |
|--------|------|--------|
| `id` | UUID PK | |
| `organization_id` | FK orgs | required |
| `guard_agent_id` | FK guard_agents | required in v1 (must be enrolled) |
| `asset_id` | FK scan_assets nullable | optional link |
| `name` | str | display |
| `root_path` | str | absolute, validated |
| `cms_hint` | enum nullable | `wordpress` \| `laravel` \| `unknown` \| … |
| `enabled` | bool | |
| `auto_quarantine` | bool | default false |
| `created_at` / `updated_at` | timestamptz | |

**Unique:** `(organization_id, guard_agent_id, root_path)`.

### 7.2 `host_scans`

Job row: `queued` \| `running` \| `completed` \| `failed`; `trigger` `schedule` \| `manual`; `started_at` / `finished_at`; `error` sanitized; `hit_count`.

### 7.3 `host_hits`

| Column | Notes |
|--------|--------|
| `rel_path` | relative to site root (never store customer hostname as required) |
| `class` | `webshell` \| `backdoor` \| `malware` \| `spam_seo` \| `suspicious` |
| `engine` | `yara` \| `clam` \| `mock` |
| `rule_id` | our rule name, not Imunify |
| `status` | `open` \| `quarantined` \| `ignored` \| `restored` |
| `sha256` | optional |

### 7.4 `host_quarantine_events`

Audit: actor user id, hit id, action `quarantine` \| `restore`, timestamps, destination basename only (not full host inventory dump).

---

## 8. API (sketch)

Prefix `/api/host`. All require JWT + org membership. Flag off → **404**.

| Method | Path | Role | Notes |
|--------|------|------|--------|
| GET | `/sites` | viewer+ | paginated |
| POST | `/sites` | admin+ | cap check |
| PATCH/DELETE | `/sites/{id}` | admin+ | |
| POST | `/sites/{id}/scan` | member+ | enqueue |
| GET | `/sites/{id}/scans` | viewer+ | |
| GET | `/hits` | viewer+ | filters: status, class, site_id |
| POST | `/hits/{id}/quarantine` | admin+ | |
| POST | `/hits/{id}/restore` | admin+ | |
| POST | `/hits/{id}/ignore` | admin+ | |

No raw file download of malware samples in v1 (exfil risk). Optional later: platform-admin only + audit.

---

## 9. SPA

- Route `/host` (or `/protect` if `/host` collides — pick **`/host`** in S1 and freeze testid `host-page`).
- Sidebar: distinct from Guard/SIEM; label i18n `hostProtect` / `Host Protect`.
- Empty state: enroll Guard first if no agents; CTA outline vs primary per design system.
- Filter bar: copy Credit History (`gap-3`, `h-10`).
- **No** native `<select>` / primary native `<button>`.

---

## 10. Slices (S0–S5)

| S | Deliverable | DoD |
|---|----------------|-----|
| **S0** | This spek + SKU working + guide pointer | Merged docs; **no** app code |
| **S1** | Models + Alembic + CRUD API + cap + flag | pytest AuthZ/IDOR/path; flag-off 404 |
| **S2** | Mock scanner + scan jobs + beat stub | CI green without Clam/YARA |
| **S3** | SPA `/host` + i18n | vitest; frozen testids |
| **S4** | Hits → SIEM case + email for webshell/backdoor | no `full_log`; no `scan_findings` |
| **S5** | Quarantine/restore + audit; auto-quarantine default off | tests for path jail |

**S6+ (out of this PR series):** Coraza/CRS opt-in; CrowdSec/Wazuh active-response brute WP; panel plugin; PHP PD research spike.

---

## 11. Open questions (owner)

| Q | Topic | Default if unanswered |
|---|--------|------------------------|
| **Q1** | List IDR / `service_id` | SKU file stays **working**; AM must not invoice until lock |
| **Q2** | Meter `hostscan` credits vs bundled 0 | **Bundled 0** |
| **Q3** | Require Guard agent always | **Yes** v1 |
| **Q4** | YARA pack source | In-repo **minimal** rules + ops-private extra later; no Imunify DB |
| **Q5** | cPanel plugin timeline | **Not S1–S5** |
| **Q6** | Auto-quarantine for `suspicious` | **Never** auto; only `webshell`/`backdoor` if org enables |

---

## 12. Risks

| Risk | Mitigation |
|------|------------|
| False positive quarantine takes site down | Default off; restore; class `suspicious` never auto |
| Path escape / symlink | Resolve + prefix allowlist on agent **and** API |
| Agent compromise → scanner as root | Run scanner as dedicated user; no root YARA on `/` |
| Relasi expect Imunify WAF day one | AM copy: Host Protect v1 = **malware visibility + isolate**, not WAF |
| Legal | No Imunify IP; original UX; original rules |

---

## 13. Agent implementation notes

- Branch `feat/host-protect-s1-*` from latest `main`; never implement on `main`.
- Atomic conventional commits; **ONE COMMIT = FAILURE** for 3+ unrelated files.
- Prefix git with `GIT_MASTER=1`.
- Do not print tokens/IPs. Do not commit PNG recaptures.
- Do not tell the user to SSH Alembic after a green **main** deploy.
- Speak Bahasa with the user; this spec stays English.

---

## 14. Success (product)

v1 is successful when an org with an enrolled VPS can: **name a web root**, **run a scan**, **see a webshell hit**, **quarantine and restore**, without SSH — and AM can describe it as **Sinexis Host Protect**, not “Imunify but worse.”
