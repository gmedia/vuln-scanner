# Spec: shadcn/ui migration (SPA Sinexis / VulnScanner)

**Status:** plan only — **do not implement** until an explicit verb (`implement` / `buat` / `kerjakan`) **and** CI on the current UI PR is green.
**Surface:** in-app SPA (`sinexis.app` dashboard), not a new marketing site.
**Depends:** kit already in `frontend/src/components/ui/` · sidebar-03 shipped · visual wave popover/calendar/Guard/Guide on `feat/shadcn-popover-calendar-guard-guide` (PR #341, may land after this doc).
**Not this epic:** mass Dependabot, password-eye unless requested, Command palette, RHF `form`, hard rebrand, Guard/Wazuh features, SIEM query builder.

---

## 0) Why

Default shadcn primitives already look correct. DIY markup (`window.confirm`, native `<details>`, `ul.divide-y`, stacked Cards instead of Tabs, Recharts pie outside Chart, handmade pagers) is what keeps producing screenshot corrections.

**North star:** one primitive kit, opaque popover/card tokens, copy and **e2e testids frozen**.

---

## 1) Frozen e2e testids (never rename / wrap away)

| Testid / id | File |
|-------------|------|
| `user-menu`, `sign-out`, `header-credits` | `Header.tsx` |
| `org-switcher`, `org-switcher-menu`, `org-option-*`, `org-members-link` | `OrgSwitcher.tsx` |
| `new-scan-cta` | `Dashboard.tsx` |
| `siem-since`, `siem-until` | `Siem.tsx` (`DateTimePicker` `id`) |
| `guide-desktop-toc` | `UserGuide.tsx` |
| `guard-state`, `guard-disabled`, `guard-host-enroll-steps`, `guard-agent-install-steps`, `guard-distro-install-commands`, `guard-enroll-token-row`, `guard-agents`, `guard-alerts` | `Guard.tsx` (+ Guide distro block) |

Card padding stays `p-6` / `pt-0`. Do not restyle kit files to “match screenshots” with one-off opacity/glass.

---

## 2) Kit inventory (as of this spec)

### Installed under `frontend/src/components/ui/`

alert, Badge, Button, Calendar, Card, DatePicker, DateTimePicker, Dialog, dropdown-menu, Input, Label, Popover, Progress, ScrollArea, Select, Separator, sheet, sidebar, Skeleton, Table, Tabs, Textarea, Tooltip, breadcrumb.

### Installed but unused (or only tests / sidebar)

| Primitive | Notes |
|-----------|--------|
| **Dialog** | Tests only — wire to confirms |
| **Tabs** | Tests only — ScanDetail / SIEM / Guard |
| **breadcrumb** | No page imports — AppShell optional |
| **Tooltip** | Sidebar only |
| **Sheet** | Mobile sidebar only |
| **Popover** | Via DatePicker / DateTimePicker only |

### Not installed (official catalog ~46)

accordion, alert-dialog, avatar, carousel, chart, checkbox, collapsible, command, context-menu, drawer, form, hover-card, input-otp, menubar, navigation-menu, pagination, radio-group, resizable, slider, sonner, switch, toggle, toggle-group, aspect-ratio.

**Do not add** unless a wave below names them: carousel, menubar, context-menu, slider, aspect-ratio, input-otp (no 2FA), resizable, navigation-menu (sidebar-03 is enough).

---

## 3) Waves (one PR per wave)

Verify **locally** (`cd frontend && rtk vitest …` on touched tests) **before push**. Do not poll CI. Do not work on `main`.

### Wave A — confirms + unused kit (S)

**Add/use:** `alert-dialog` (or existing `Dialog` if confirm pattern fits).

| Target | Today | After |
|--------|--------|--------|
| Guard Cabut token | `window.confirm` | AlertDialog; keep `aria-label` / row testid |
| Schedules delete | `window.confirm` | Same |

**Out of scope:** password visibility, org switcher.

### Wave B — Tabs on dense pages (S–M)

**Use existing `Tabs.tsx`.** Do not change frozen ids.

| Page | Today | After |
|------|--------|--------|
| ScanDetail | Stacked Cards | Tabs: findings / diff / export — keep `export-executive`, `rescan-button` |
| SIEM | Search + cases stacked | Tabs: Cari event / Kasus — keep `siem-since` / `siem-until` |
| Guard (optional) | Token / agen / alert Cards | Tabs only if layout stays one scroll; **do not** shrink agent table |

### Wave C — lists that are not Table (S)

| Page | Today | After |
|------|--------|--------|
| WorkspaceSettings members/invites | `ul.divide-y` | `Table` or Card rows using Table primitives |
| Schedules list | `ul.divide-y` | `Table` + Empty copy |

Keep `invite-*`, `members-list`, `schedule-create-card`.

### Wave D — pagination (S–M)

**Add:** `pagination`.

| Page | After |
|------|--------|
| CreditHistory | shadcn Pagination under Table |
| AdminUsers | Same if list is paged |

### Wave E — Accordion for long copy (M)

**Add:** `accordion` and/or `collapsible`.

| Page | Today | After |
|------|--------|--------|
| UserGuide distro install | native `<details>` | Accordion; **update** `UserGuide.test.tsx` (`closest("details")`) |
| Guard distro commands | long Card | Accordion; keep `guard-distro-install-commands` |

User Guide **desktop TOC** stays Card + ScrollArea + `guide-desktop-toc`. Do not replace TOC with Accordion.

### Wave F — feedback + charts (M)

| Item | After |
|------|--------|
| Success/error after mutations | **sonner** (keep destructive `Alert` for page-level errors) |
| `SeverityChart.tsx` Recharts pie | shadcn **chart** wrapper, keep `severity-chart-content` |
| AdminDashboard KPI | optional small **chart**; no fake data |

### Wave G — optional / skip unless asked

| Item | Why skip by default |
|------|---------------------|
| Password eye → icon Button | Previously rejected; e2e login |
| **command** palette / org combobox | Breaks `org-switcher*` |
| **form** (RHF + zod) | Low visual ROI, high test churn |
| **switch** for Guard enable | Freeze `guard-state` |
| **avatar** in Header | Freeze `user-menu` |
| **breadcrumb** in AppShell | Nice-to-have after sidebar |
| Landing hero rewrite | Copy/brand locked; Card grid is enough |
| Native `input type=file` in MobileUpload | Keep; tests query `input[type=file]` |

---

## 4) Mapping table (leftover → primitive)

| Location | DIY | shadcn | E2E risk | Effort |
|----------|-----|--------|----------|--------|
| Guard / Schedules | `window.confirm` | alert-dialog | Low if copy stays | S |
| ScanDetail / SIEM | Stacked Cards | Tabs | Med — freeze export/siem ids | S–M |
| Workspace / Schedules | `ul.divide-y` | Table | Med | S |
| Credit / AdminUsers | Custom pager | pagination | Med | S–M |
| UserGuide / Guard distro | `<details>` | accordion | **High** — tests | M |
| Mutations | Inline text | sonner | Low | S |
| SeverityChart | Raw Recharts | chart | Low | M |
| AdminDashboard | Number Cards | chart optional | Low | M |
| Filter findings | Text Input only | checkbox + dropdown-menu | Med | S |
| Header | lucide User | avatar (optional) | **High** | S |
| OrgSwitcher | dropdown-menu | command — **no** | **High** | L |
| Auth | Eye `<button>` | — skip | Med | S |
| MobileUpload | hidden file input | — keep native | Med | — |
| AppShell | no crumbs | breadcrumb | Low | S |

---

## 5) Install convention

```bash
cd frontend
npx shadcn@latest add <component> --yes
```

- Prefer official files under `frontend/src/components/ui/`.
- Do **not** hand-roll a second Accordion/Pagination.
- Do **not** commit `opencode.json` or lockfile churn unless the add command requires it and CI needs it.
- Tokens: `--background`, `--card`, `--popover` opaque; no `bg-card/50` + `backdrop-blur` on chrome that sits under menus.
- Calendar nav: prev/next **absolute** on caption row (`left-1` / `right-1`), not `static` (breaks month buttons).

---

## 6) Verification (every wave)

1. Vitest for touched files on **this host** before push.
2. `lsp` / eslint clean on edited TSX.
3. Playwright selectors: grep the freeze list after edits.
4. No production hosts, ports, emails, passwords, enroll tokens in `*.md`.
5. One concern per PR (`feat/` or `fix/` from latest `main`).
6. Do not poll CI.

---

## 7) Suggested first PR after #341 merges

**Wave A only:** replace `window.confirm` with AlertDialog on Guard + Schedules.

Then Wave B (Tabs) **or** Wave C (Table lists), not both in one PR.

---

## 8) Out of product scope

P0 SKU, P3 assets, GTM, live Wazuh, SIEM S3+ API, Dependabot mass-merge — see [`AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md). This file is **UI kit debt only**.
