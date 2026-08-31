# Spec: Host Protect v1 (P12 — on-box web malware control plane)

**Status:** **S0–S6 shipped on `main`** (#501–#511). Control plane + worker-local YARA walk. Prod compose default **true** (API/worker). Local/CI **false**. **S7–S12** = honest on-box scan (docs 2026-08-31). S7 honesty gate (no mock persist when root missing) is **#533**. WAF/Coraza/cPanel remain **out**. SKU list IDR **unset**.
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
| **Second enroll daemon (`sinexis-scan` systemd)** | D1: one `wazuh-agent` per VM; helper is add-on only |
| **Wazuh AR/wodle as findings bus** | Locked: POST JSON to FastAPI (Q7=A). AR = later escalation only |
| **SaaS SSH / bind-mount customer FS** | Worker never sees VPS disks |
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
| **D4** | Scanner | Pluggable: **mock** (CI/lab **only**, `HOST_PROTECT_ALLOW_MOCK`) · **YARA/needles** on the **agent VM** (S10) · optional **ClamAV** **S12** if binary present. Do not vendor Imunify DB. |
| **D5** | Schedule | Beat-driven per site; default **daily**; cap concurrent scans per org (e.g. 2). |
| **D6** | Path policy | Absolute POSIX path; must be under an **allowlist prefix** configured per agent (e.g. `/var/www`, `/home/*/public_html` pattern **server-side**). Reject `..`, NUL, non-UTF8, symlink escape (resolve + prefix check). |
| **D7** | Flag | Prod compose default **true** (API + `worker_ip` + beat). Local/CI **false**. API/SPA **404** / feature-off copy when false. |
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
| **SaaS worker** | Enqueues scan; **does not** read customer disks. After S10: waits for agent ingest or fails `unreachable_root` |
| **Host helper** | Add-on on the **same VM** as `wazuh-agent`; YARA/needles in jail; **POST JSON** to SaaS (not a second enroll daemon) |
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
                              wazuh-agent (enroll + inventory)
                              + Host Protect helper (Depends wazuh-agent)
                              POST JSON findings → FastAPI ingest
                              (YARA/needles in path jail; no file bytes)
```

Wazuh remains **enroll + inventory + liveness**. **Results bus (locked 2026-08-31):** helper **POST JSON** to FastAPI — **not** Wazuh AR/wodle as the findings pipe, **not** Indexer as product store, **not** a second long-running `sinexis-scan` daemon. Product APIs stay org-scoped. Do not require tenants to query Indexer for file hits.

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

## 10. Slices (S0–S6 shipped; S7–S12 planned)

| S | Deliverable | DoD | **Git** |
|---|----------------|-----|---------|
| **S0** | This spek + SKU working + guide pointer | Merged docs; **no** app code | **#501** |
| **S1** | Models + Alembic + CRUD API + cap + flag | pytest AuthZ/IDOR/path; flag-off 404 | **#502** |
| **S2** | Mock scanner + scan jobs + beat stub | CI green without Clam/YARA | **#503** |
| **S3** | SPA `/host` + i18n | vitest; frozen testids | **#504** |
| **S4** | Hits → SIEM case + email for webshell/backdoor | no `full_log`; no `scan_findings` | **#505** |
| **S5** | Quarantine/restore + audit; auto-quarantine default off | tests for path jail | **#505** |
| **S6** | Local signature walk (in-repo `.yar` strings) + mock fallback | pytest engine + job fallback; no Imunify DB; no WAF | **#511** |

**S6+ HTTP WAF** is **P13**, not a Host Protect malware slice: [`host-waf-v1.md`](host-waf-v1.md).

### 10.1 Honest on-box (S7–S12) — owner lock 2026-08-31

**Q7–Q11** (session): results = **POST JSON to SaaS**; epic 1 = **scan on-box, quarantine disk later**; package = **add-on Depends `wazuh-agent`**; engine = **YARA/needles only**; missing path = **fail closed in prod**, mock **only** CI/lab.

| S | Deliverable | DoD (agent-executable) | Out of this slice |
|---|----------------|------------------------|-------------------|
| **S7** Honesty gate | Never persist `MOCK_HITS` on public origin. `HOST_PROTECT_ALLOW_MOCK` for CI/lab only. Failed scan `unreachable_root`, `hit_count=0`, no SIEM. SPA copy: path not on agent. | `rg MOCK_HITS` + pytest: mock flag off + missing dir → **zero** `cache.php` rows; SIEM not called. Flag-on + `run_mock_host_scan` still 1 fixture hit. | New engine, `.deb`, Clam |
| **S8** Spek/contract (this docs wave) | JSON ingest shape, token rules, jail, non-goals, AM copy | This section merged; **0** `backend/` `workers/` `frontend/` in the docs PR | App code |
| **S9** Ingest API | `POST /api/host/agent/results` (name freeze in implement PR). Per-agent hashed token (**not** global `ApiKey`, **not** user JWT). Cap findings size. Bind `scan_id` + `guard_agent_id` + org. | pytest IDOR: org A token cannot write org B `host_hits`. Oversize → 413. Replay/expired token → 401. | Wodle as bus |
| **S10** On-box YARA | Helper script + drop-in (unit or cron); `Depends: wazuh-agent`; allowlist `/var/www` `/srv/www` `/home`; timeout/nice; same in-repo needles; `yara` CLI **optional** if on PATH. POST to S9. | Lab **tc5 fixture** (not worker bind, not ERP): needle hit on that disk. CI green **without** Clam/yara packages. Path outside jail → non-zero, no POST. | Clam, Windows, second systemd agent |
| **S11** On-disk quarantine | `mv` inside jail to `/var/lib/sinexis/quarantine/<site-id>/` (0700, noexec, not under docroot); restore reverse; audit `dest_basename`. Fail command → **do not** set `quarantined`. Auto still off. | Lab quarantine then restore on fixture. pytest jail. | Auto-clean PHP |
| **S12** Clam optional | Extra `engine=clam` hits **iff** `clamscan`/`clamdscan` present | Skip if binary absent; no CVD in git | Required Clam in CI image |

**Honest-scan epic (implement later):** S7 + S9 + S10. **S11** separate PR. **S8** is this documentation.

**Mock policy (locked):**

1. Persist `engine=mock` / `MOCK_HITS` **only** when `HOST_PROTECT_ALLOW_MOCK=true` **and** origin is not public (`sinexis.app` / `vs.appmedia.id`).
2. Else: `host_scans.status=failed`, `error=unreachable_root` (sanitized), no hit rows, no SIEM/email.
3. SPA: never a green completed scan with a toy webshell when the agent did not scan.

**JSON ingest (illustrative — freeze in S9 PR):** `scan_id`, `agent_id`, `engine` (`yara`\|`needles`), findings[]: `rel_path`, `class`, `rule_id`, `sha256`. **No** file bytes, **no** `full_log`.

**Packaging:** add-on that **Depends** `wazuh-agent`. **No** second enroll, **no** unsigned “Sinexis agent” that replaces Wazuh. `curl | bash` is not v1.

**Lab:** fixture on **Guard agent (`tc5`)**, not worker FS, never `sx-erpstg`. Wipe-first only for full Guard e2e. No IPs/tokens in git.

**AM (until S10 lab + H4/H9):** do **not** say “kami scan malware di VPS Anda” after S7-only. After S10 lab: pilot on named folder. Invoice only after IDR lock.

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
| **Q7** | Results transport | **POST JSON to SaaS** (locked 2026-08-31). Not AR/wodle bus |
| **Q8** | First honest epic | **On-box scan**; disk quarantine = **S11** |
| **Q9** | Package | **Add-on Depends `wazuh-agent`**, not dual daemon |
| **Q10** | Engine v1 | **YARA/needles**; Clam = **S12** |
| **Q11** | Missing agent path | **Fail closed** in prod; mock **CI/lab flag only** |

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

- S0–S6 already on `main`. **S7–S12** are specified here; **do not implement** app code until the user says `implement` / `buat` / `kerjakan`. New branch from latest `main`; never implement on `main`.
- Atomic conventional commits; **ONE COMMIT = FAILURE** for 3+ unrelated files.
- Prefix git with `GIT_MASTER=1`.
- Do not print tokens/IPs. Do not commit PNG recaptures.
- Do not tell the user to SSH Alembic after a green **main** deploy.
- Speak Bahasa with the user; this spec stays English.

---

## 14. Success (product)

v1 is successful when an org with an enrolled VPS can: **name a web root**, **run a scan**, **see a webshell hit**, **quarantine and restore**, without SSH — and AM can describe it as **Sinexis Host Protect**, not “Imunify but worse.”

Lab (not Playwright): [`scripts/host-protect-lab-smoke.sh`](../../scripts/host-protect-lab-smoke.sh) after Guard enroll. Fixture path only — never `sx-erpstg`. Quarantine then restore on one hit; ignore only while `open` (not after ignore on the same row). `HOST_PROTECT_ENABLED` must reach **`worker_ip`** (and beat for `run_due`), not only the API. See [`docs/multi-host-ops.md`](../multi-host-ops.md) § Host Protect lab smoke.
