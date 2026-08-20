# Spec: shadcn/ui migration (SPA Sinexis / VulnScanner)

**Status:** Wave A–F shipped (`main`, #349). Findings severity filter shipped (`main`, #351). Remaining: Wave G skip unless asked; AdminDashboard KPI optional.
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
| `export-executive`, `rescan-button` | `ScanDetail.tsx` |
| `siem-since`, `siem-until` | `Siem.tsx` (`DateTimePicker` `id`) |
| `guide-desktop-toc` | `UserGuide.tsx` |
| `severity-chart-content`, `severity-legend` | `SeverityChart.tsx` |
| `invite-email`, `invite-role`, `invite-submit`, `invite-form-card`, `members-list` | `WorkspaceSettings.tsx` |
| `schedule-create-card` | `Schedules.tsx` |
| `guard-state`, `guard-disabled`, `guard-host-enroll-steps`, `guard-agent-install-steps`, `guard-distro-install-commands`, `guard-enroll-token-row`, `guard-agents`, `guard-alerts` | `Guard.tsx` (+ Guide distro block) |

Card padding stays `p-6` / `pt-0`. Do not restyle kit files to “match screenshots” with one-off opacity/glass.

---

## 2) Kit inventory (as of this spec)

### Installed under `frontend/src/components/ui/`

accordion, alert, alert-dialog, Badge, Button, Calendar, Card, chart, DatePicker, DateTimePicker, Dialog, dropdown-menu, Input, Label, Pagination, Popover, Progress, ScrollArea, Select, Separator, sheet, sidebar, Skeleton, sonner, Table, Tabs, Textarea, Tooltip, breadcrumb.

### Installed but unused (or only tests / sidebar)

| Primitive | Notes |
|-----------|--------|
| **Dialog** | Tests / generic modal — confirms use **alert-dialog** |
| **Tabs** | ScanDetail + SIEM shipped (Wave B); Guard optional skip |
| **breadcrumb** | No page imports — AppShell optional |
| **Tooltip** | Sidebar only |
| **Sheet** | Mobile sidebar only |
| **Popover** | Via DatePicker / DateTimePicker only |

### Not installed (official catalog ~46)

avatar, carousel, checkbox, collapsible, command, context-menu, drawer, form, hover-card, input-otp, menubar, navigation-menu, radio-group, resizable, slider, switch, toggle, toggle-group, aspect-ratio.

**Do not add** unless a wave below names them: carousel, menubar, context-menu, slider, aspect-ratio, input-otp (no 2FA), resizable, navigation-menu (sidebar-03 is enough).

---

## 3) Waves (one PR per wave)

Verify **locally** (`cd frontend && rtk vitest …` on touched tests) **before push**. Do not poll CI. Do not work on `main`.

### Wave A — confirms + unused kit (S)

**Add/use:** `alert-dialog` (or existing `Dialog` if confirm pattern fits).

| Target | Today | After |
|--------|--------|--------|
| Guard Cabut token | ~~`window.confirm`~~ | AlertDialog; keep `aria-label` / row testid |
| Schedules delete | ~~`window.confirm`~~ | Same |

**Out of scope:** password visibility, org switcher.

### Wave B — Tabs on dense pages (S–M)

**Use existing `Tabs.tsx`.** Do not change frozen ids.

| Page | Today | After |
|------|--------|--------|
| ScanDetail | Stacked Cards | Tabs: findings / diff / export — keep `export-executive`, `rescan-button` |
| SIEM | Search + cases stacked | Tabs: Cari event / Kasus — keep `siem-since` / `siem-until` |
| Guard (optional) | Token / agen / alert Cards | Tabs only if layout stays one scroll; **do not** shrink agent table |

### Wave C — lists that are not Table (S)

**Shipped:** #346. Keep `invite-*`, `members-list`, `schedule-create-card`. Empty copy unchanged (`Belum ada anggota.` / `Tidak ada undangan tertunda.` / `Belum ada jadwal. Buat scan domain/IP mingguan atau bulanan di atas.`).

| Page | After |
|------|--------|
| WorkspaceSettings members/invites | `Table` (`members-list`, `invites-list`) |
| Schedules list | `Table` + empty copy outside table; AlertDialog Hapus stays |

### Wave D — pagination (S–M)

**Shipped:** #347. `Pagination.tsx` (buttons, not `<a>` — freeze `getByRole('button', { name: /previous page/i })`).

| Page | After |
|------|--------|
| CreditHistory | shadcn Pagination under Table; keep `Page n of m`, `aria-label` Previous/Next page, hide when `totalPages <= 1` |
| AdminUsers | Same; add matching `aria-label` |

### Wave E — Accordion for long copy (M)

**Shipped:** `main` (#348). Accordion on UserGuide + Guard distro. Keep `guide-desktop-toc` (not Accordion). Keep `guard-distro-install-commands`.

| Page | Today | After |
|------|--------|--------|
| UserGuide distro install | native `<details>` | Accordion; **update** `UserGuide.test.tsx` (`closest("details")`) |
| Guard distro commands | long Card | Accordion; keep `guard-distro-install-commands` |

User Guide **desktop TOC** stays Card + ScrollArea + `guide-desktop-toc`. Do not replace TOC with Accordion.

### Wave F — feedback + charts (M)

**Shipped:** `main` (#349). `sonner` + `chart`. No `next-themes`. Imports stay `@/components/ui/Card`. AdminDashboard KPI skipped.

| Item | After |
|------|--------|
| Success after mutations (Workspace invite/revoke/org/accept, Profile email/password, Guard enable/sync/token, Schedules create/toggle/delete) | **sonner** `toast.success` |
| Page-level / form-field errors | keep destructive `Alert` (not toast) |
| `SeverityChart.tsx` Recharts pie | shadcn **ChartContainer** + `ChartTooltip`; freeze `severity-chart-content` |
| AdminDashboard KPI | **skip** |

Findings table severity filter (leftover after Wave F): **shipped** `main` (#351). Search copy frozen (`Filter findings...` / `No matching findings`). `DropdownMenuCheckboxItem`; empty `Set` = all severities. Freeze `export-executive`, `rescan-button`.

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
| Filter findings | Text + severity dropdown | **shipped** #351 (`DropdownMenuCheckboxItem`) | — | S |
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

## 7) Suggested first PR after #351 merges

**Docs-only leftover is this file.** Next product UI only with an explicit verb:

- Optional: AdminDashboard KPI → `chart` (Low / M). Not P3/SIEM.
- Wave G (avatar Header, breadcrumb, command, RHF, Switch Guard, password-eye): **skip** unless asked. Avatar/`command` freeze `user-menu` / `org-switcher*`.

---

## 8) Out of product scope

P0 SKU, P3 assets, GTM, live Wazuh, SIEM S3+ API, Dependabot mass-merge — see [`AGENT_EXECUTION_GUIDE.md`](../AGENT_EXECUTION_GUIDE.md). This file is **UI kit debt only**.
