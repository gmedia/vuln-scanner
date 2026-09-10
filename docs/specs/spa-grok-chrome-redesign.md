# Spec: SPA chrome redesign (Grok2API reference, Sinexis green)

**Status:** **S0 draft** (this file). **Do not implement S1+ until the user names a slice + `buat` / `implement`.**
**Goal:** Authenticated SPA chrome and page density closer to `/home/ubuntu/referensi_design_light_dark.zip` (Grok2API light/dark), while **keeping Sinexis `--primary` green** `hsl(142 71% 45%)`.
**Suggested epic label:** **P15** (visual). Does **not** jump P12–P14 product work. Does **not** change Guard/SIEM/WAF behaviour.
**Reference PNGs:** extract locally from the zip; **do not commit** PNGs or the zip.
**North star product:** still Scan attach / Sinexis — not a Grok2API clone (no “Model routes”, no method chips in our nav).

---

## 0) Conflicts with existing markdown (must resolve in this epic)

These docs **win today** unless a slice below explicitly patches them **in the same PR**.

| Doc | What it says | Conflict with this epic | Resolution |
|-----|----------------|-------------------------|------------|
| [`theme-v1.md`](theme-v1.md) §3, §6 | Theme = tokens + toggle **only**. **Layout (top header vs grok2api sidebar) is out.** Do not combine S1 token move with a layout PR. Primary CTA stays **green**, not inverted black/white. | This epic **is** the layout PR that theme-v1 deferred. Reference uses **neutral** filled CTAs (black/white Save). | **Override layout non-goal** for P15 only. **Keep** `--primary` green for brand CTAs (`new-scan-cta`, scan submit, Get started). **Do not** invert primary to black/white. Settings “Save” may use `variant="default"` (green) or `secondary` — **not** a second brand color. |
| [`theme-v1.md`](theme-v1.md) §6 elevation | Hairline border only; **no** `shadow-*` on Card/Dialog/etc. Density: `p-4`, table `h-8` / `py-1.5`. | Aligns with reference. Keep. | No change. |
| [`shadcn-ui-migration.md`](shadcn-ui-migration.md) | **Do not restyle kit files** to match one screenshot. Frozen e2e testids. Card padding `p-6` / `pt-0`. | Reference wants looser chrome, denser tables, no top bar. Kit restyle is forbidden. | **Layout + tokens + page wrappers only.** If density needs `p-4` on Card globally, that is a **named S1 token/class** change with Vitest on `Card.test.tsx` — not per-page opacity hacks. Prefer page `className` overrides over editing `Card.tsx` unless S1 says so. |
| `AGENTS.md` + guide **§10** | Public marketing + SPA share one family. Landing: `h-12` header, BrandMark, `max-w-6xl`. SPA: kit only; filter bars = Credit History. | Removing app `h-12` Header **does not** remove Landing `h-12`. Two chrome families already exist (registry § Chrome families). | **Landing / auth / HTML islands keep `h-12`.** Only **AppShell** drops the sticky product header (S2). Update §10 + registry in **S2 PR**. |
| [`AGENT_PAGE_REGISTRY.md`](../AGENT_PAGE_REGISTRY.md) | App chrome = Sidebar + Header. Recapture set after chrome/token change. | Header geometry changes. | Patch table “Chrome families” in S2. Recapture after S2 and after each page wave. |
| Guide **§1.3** / handoff | Product backlog is attach/Host Protect, not UI. | This epic is visual-only. | Do **not** reorder P0–P14. P15 is opt-in. One-line pointer in guide §9 when S0 merges. |
| Filter-bar law (Credit History) | Equal `gap-3`, `h-10`, no `grid-cols-12` + far-right Apply. | Reference settings is **label-left / control-right**. | **Keep filter-bar law** on list pages (credit, SIEM, admin tables). **Settings/Profile** may use two-pane (S5) without breaking filter bars. |
| Frozen testids (shadcn spec §1) | Never rename / wrap away. | Header currently owns `user-menu`, `sign-out`, `header-credits`. | **Move nodes, keep ids.** If Header unmounts, those testids **must** still exist (sidebar footer or compact toolbar). |
| Playwright ≠ Guard enroll | Unchanged. | Guard page visual only. | S6 must not touch enroll scripts. |

**Non-conflicts (keep as-is):** `blog-v1.md` (not AppShell); `guard-v1.md` / `siem-v1.md` (features); `i18n-v1.md`; `capacitor-shell-v1.md` (safe-area: still `pt-[env(safe-area-inset-top)]` on remaining chrome).

---

## 1) Visual law (locked unless user overrides)

| Topic | Lock |
|-------|------|
| Brand primary | **`hsl(142 71% 45%)`** both themes. BrandMark `XIS` accent. Scan/Attach primary buttons stay green. |
| Selected nav | **Neutral pill** (`bg-muted` / `bg-sidebar-accent`), **not** primary fill. No left accent bar. |
| AppShell header | **No sticky `h-12` product bar** after S2. Page **title lives in the content column**. |
| Relocated chrome | Org switcher, credits (`header-credits`), theme, i18n, `user-menu` → **sidebar footer cluster** and/or a **thin page toolbar** (no second `h-12` strip). |
| Sidebar | Flush with canvas (same `--background` / `--sidebar`). Hairline `border-r` optional; **no** contrast strip. |
| Radius | Keep `--radius: 0.75rem` (theme-v1). Pills / segmented = `rounded-full`. |
| Elevation | Hairline only (theme-v1). |
| Copy | Do **not** paste Grok2API product strings. Keep i18n catalogs. |
| Kit | No native `<select>`. No primary native `<button>`. |
| HTML islands | **Out of P15** unless a later named slice. Tokens already rhyme Landing. |

---

## 2) Execution slices (one PR each — execute in order)

Do **not** combine S2 layout with a page restyle. Do **not** work on `main`. `GIT_MASTER=1`. Push + `gh pr create --fill`; do not poll CI.

### S0 — this spec (docs only)

**Do:** this file. Optional one-line in `docs/AGENT_EXECUTION_GUIDE.md` §9 pointing here. **Do not** rewrite theme-v1 body except a “superseded for layout by P15” note if the user asks in the same PR.

**DoD:** merged markdown. No app code.

**Out:** tokens, AppShell, pages.

---

### S1 — tokens / density only (no layout)

**Files:** `frontend/src/index.css` (and scrollbar if still hardcoded). Optional: Card default padding **only if** Vitest `Card.test.tsx` updated.

**Do:** Confirm light/dark already match theme-v1 table (`#FAFAFA` / `#0A0A0A`). Tweak `--sidebar` to **same family as canvas** (flush). Table/input density utilities if missing.

**DoD:** Default dark still looks like today except flush sidebar tokens. `html.dark` default unchanged. Vitest theme + Card if touched.

**Out:** AppShell, Header, pages.

---

### S2 — AppShell chrome (the layout PR)

**Files:** `AppShell.tsx`, `Header.tsx`, `Sidebar.tsx`, tests `Header.test.tsx` / Sidebar tests, `docs/AGENT_PAGE_REGISTRY.md` chrome table, guide §10 **App** row only.

**Do:**
- Remove sticky product `header.h-12` from AppShell (keep `SidebarTrigger` for mobile — e.g. floating or first row of content).
- Sidebar: BrandMark + version optional; nav pills; **footer:** Admin gear already exists — add **user-menu, sign-out, header-credits, org-switcher, ThemeSwitcher, LanguageSwitcher** without dropping testids.
- Content: `max-w-6xl` / `2xl:max-w-[90rem]` unchanged.
- Safe-area inset moves to SidebarInset top padding.

**DoD:** `Header.test.tsx` still finds `user-menu`, `sign-out`, `header-credits` (update queries if DOM parent changed). Playwright `e2e` that click those ids still pass locally if run. Landing **untouched**.

**Out:** page-level KPI/tables; Landing; blog `_shell`.

---

### S3 — Dashboard + page title pattern

**Files:** `pages/Dashboard.tsx`, shared `PageHeader` (new, layout-only) if needed.

**Do:** Large in-content title. KPI row density (`gap-4`). Keep `new-scan-cta`. Empty state = island panel, **real** Scan IP / schedule links (theme-v1).

**`PageHeader.leading` rule (locked):**
- **Child/detail only:** back via `PageHeaderBack` (`ScanDetail` → dashboard; `AdminUserDetail` → `/admin/users`).
- **Top-level sidebar pages:** title ± description ± `actions`. **No** back. **No** decorative product icon (match `/assets`).
- **Admin list pages:** decorative icon in `leading` is allowed.
- Do **not** add a `showBack` prop. Scan-not-found error CTAs are not `PageHeader`.

**DoD:** `Dashboard.test.tsx` / `e2e/dashboard.spec.ts` testids intact.

**Out:** charts geometry rewrite.

---

### S4 — Scan family (forms + detail)

**Pages:** `IpScanner`, `DomainScanner`, `MobileScanner`, `ScanDetail`, `Schedules`, `Assets`.

**Do:** PageHeader; keep two-column scan forms; frozen ids (`export-executive`, `rescan-button`, `schedule-create-card`). Filter/toolbar `h-10` law. Scan **forms** (IP/domain/mobile) and **Schedules** follow the S3 top-level rule (no header back). **ScanDetail** keeps `PageHeaderBack`.

**Out:** scanner API, coverage copy.

---

### S5 — Account: Profile + Workspace + Credit History

**Do:** Profile/Workspace **two-pane** inner nav (pills) **only if** it does not break `invite-*` / `members-list`. Credit History **filter bar unchanged** (reference for other lists). Workspace is a sidebar destination — **no** header back.

**Out:** org API.

---

### S6 — Attach: Guard, SIEM, Uptime, Status editor, Host Protect, AI, Guide

**Do:** PageHeader + empty islands (Guard empty = large rounded panel, **no fake Connect**). Keep all `guard-*`, `siem-since` / `siem-until` ids. **Playwright ≠ enroll.** Guard / SIEM / AI / Guide headers: **no** decorative `leading` icon (empty-state icons stay).

**Out:** Wazuh, flags, Host Protect honesty rules.

---

### S7 — Admin family

**Pages:** AdminDashboard, Users, UserDetail, Pricing, Hpp, Blog, EmailLogs, AdminAi.

**Do:** Same PageHeader + tables. Keep `nav-admin-*`. Do not mix HPP vs Pricing. Admin **lists** may keep a decorative icon. Admin **user detail** uses `PageHeaderBack` in `leading` (no extra back row, no `User` icon).

**Out:** HPP rates, CMS behaviour.

---

### S8 — Auth cards only (optional)

**Pages:** Login, Register, Forgot/Reset, VerifyEmail, NotFound.

**Do:** Card hairline, same tokens. **Keep Landing `h-12`.**

**Out:** marketing Landing rewrite (separate epic if ever).

---

### S9 — Recapture + freeze

**Do:** Registry §D recapture locally (light+dark). Do **not** git-add PNGs. Fix regressions only.

---

## 3) Explicitly out of this epic

- Landing / blog / legal / public status HTML restyle (unless S8 auth).
- Restyling every file under `components/ui/` to mimic Grok2API buttons (black Save).
- New primitives (command, menubar) unless a slice names them.
- Rebrand wordmark away from Sinexis.
- Combining with Host Protect / Guard feature PRs.

---

## 4) How an agent executes one slice

1. Boot: `gh pr list`, `GIT_MASTER=1 git checkout main && pull`, branch `feat/p15-sN-<desc>`.
2. Read **this file** + the conflict table — do not “fix” theme-v1 by deleting green CTAs.
3. Implement **only** that slice’s files.
4. Vitest on touched tests; eslint (no native select).
5. PR body: What / Files / Next steps = next slice letter.
6. Stop. Do not start S(n+1) in the same PR.

---

## 5) Suggested PR titles

| Slice | Title |
|-------|--------|
| S0 | `docs: P15 SPA grok-chrome redesign execution plan` |
| S1 | `feat: P15 S1 flush sidebar tokens` |
| S2 | `feat: P15 S2 AppShell without sticky header` |
| S3 | `feat: P15 S3 dashboard page header` |
| S4 | `feat: P15 S4 scan family density` |
| S5 | `feat: P15 S5 account two-pane` |
| S6 | `feat: P15 S6 attach surfaces chrome` |
| S7 | `feat: P15 S7 admin chrome` |
| S8 | `feat: P15 S8 auth cards` |
| S9 | `docs: P15 recapture notes` (no PNG commits) |
