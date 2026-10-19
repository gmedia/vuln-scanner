# Admin
## Admin console — wave 1 (`/admin`, `/admin/users`, `/admin/users/:id`)

**Retired 2026-10-12:** `/admin/pricing` is removed. Wave-1 references to its quick link and wave-2 inclusion below record the original design, not current navigation. `/admin/hpp` stays.

Print §§0–8 and every SPA section above stay locked. This section is the **dark SPA** contract for the first three admin surfaces: the dashboard, the user list, and the user detail. Wave 2 (`/admin/hpp`, `/admin/invoices`, `/admin/email-logs`, `/admin/blog`, `/admin/ai`, plus `/admin/skus` and `/admin/simulator` added 2026-10-13/14) reuses this grammar. `/admin/pricing` is retired.

### 0. Research Log (Admin wave 1)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as the ops consoles and the account area. Not Stripe marketing; not Linear indigo `#5e6ad2`.
- Sibling harvest: `WorkspaceShell` / `ProfileShell` / `AuthCard` rail shells, `HostKpiStrip` / `DashboardKpiStrip` (`StatTile` + `SiemRail`), `HostHitsList` (rail inside the first cell, mobile card + desktop row), `EmptyState` island grammar, `SiemRail`.
- Current admin diagnosis: `AdminDashboard` KPI cards were `CardContent` circles with a tinted icon (no rail); the two charts and the quick-links block were flat `Card` + `CardHeader`; `AdminUsers` was a flat `Card` with an ad-hoc muted-circle empty state and rail-less table rows; `AdminUserDetail` was 18 `Card` uses with no rail and inline `red-600` / `green-600` feedback boxes; no admin page had a rail.
- Imagen drafts: skipped — existing SPA + sibling P15 grammar is the reference; no extra imagegen deps.
- Lazyweb pack: skipped this session — sibling P15 is the harvest.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** An **operator console** on existing Sinexis SPA tokens. Signature: KPI tiles whose **rails encode the metric** (users sky / scans primary / findings orange / credits-in primary / credits-used amber), then chart + quick-link shells with a primary rail, then user rows whose **rail encodes account state** (unverified amber / admin primary / plain muted), then a detail pair whose rails encode verification and credit-mutation outcome. Green `--primary`, not Linear indigo. Sora + Red Hat Mono. Not nested Card-in-Card, not a filled masthead.

### 1. Atmosphere & Identity

Admin is internal: platform stats, user accounts, credit adjustments. It must feel like the Guard/SIEM/Assets/Uptime/Host/Dashboard/ScanDetail/Schedules/Profile/Workspace ops family inside AppShell — same rail grammar, same hairline shells — while staying plainer than the customer surfaces (no marketing energy).

The one memorable moment: the **KPI rail row**. Five metrics read left to right with distinct rail colours, so an operator sees "who / how much / how risky / supply / consumption" before reading a single number.

Do **not** use a filled green masthead, a marketing hero, or a generic icon-in-circle. Loading is skeleton rows / skeleton tiles (users list `TableRowSkeleton rows={5} columns={8}`; user-detail profile `rows={4} columns={4}`, credit-adjust `rows={3} columns={3}`), not a spinner in a Card.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | KPI tiles, shells, table wrapper, mobile rows |
| Ink | `--foreground` | Emails, KPI values, shell titles |
| Meta | `--muted-foreground` | Labels, dates, hints, counts |
| Accent | `--primary` `hsl(142 71% 45%)` | Scans / credits-in rail, admin row rail, verified profile rail, quick-link hover, CTAs |
| Users | `bg-sky-600` rail | `Total users` tile, credits chart shell |
| Findings | `bg-orange-600` rail | `Total findings` tile |
| Credits used | `bg-amber-600` rail + `bg-amber-500/[0.04]` wash | `Credits used` tile, unverified user row, unverified profile shell |
| Danger | `bg-destructive` rail + `bg-destructive/[0.04]` wash | Credit-mutation error, resend failure |
| Idle | `bg-border` rail | Plain user rows, quick links |

Rails are **redundant** with the KPI value colour / Badge / notice copy. Never color-only status.

### 3. Typography

SPA scale. Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` (frozen) |
| Subtitle | `text-sm` | 400 | `dashboardSubtitle` / `usersSubtitle` / `detailSubtitle` |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Total users / scans / findings / credits |
| KPI value | `font-mono text-2xl font-bold tabular-nums` | 700 | Counts, tinted by tone |
| Shell title | `text-sm font-medium tracking-wide` | 500 | `h3` — Overview / Credits / Quick links / Users / Profile / Credit adjustment |
| Mono record | `font-mono text-xs` / `text-sm` | 400 | Email, credits, dates |
| Table head | `text-[10px] uppercase tracking-wider` | 500 | Email / Role / Verified / Credits / Scans / Created / Last login / Actions |

Tabular numerals on every count and date. Body copy stays the i18n `admin` catalog (EN+ID).

### 4. Spacing & Layout

4px base. **No** filter bar at page level (the user search lives inside the Users shell).

| Token | Value | Usage |
|-------|-------|-------|
| --space-1.5 | 6px | Field label→control gap |
| --space-2 | 8px | Row inner, KPI gap on mobile |
| --space-3 | 12px | KPI gap `sm`, search grid gap |
| --space-4 | 16px | Shell pad, chart grid gap |
| --space-6 | 24px | Page stack (`space-y-6`), detail grid gap |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`).
- **page-grid** — KPI `grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-5`; charts `grid gap-4 2xl:grid-cols-2`; quick links `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`; detail `grid gap-6 lg:grid-cols-2 lg:items-start`.
- **scroll-body-shell** — AppShell owns document scroll.
- **list-detail** — **not** used (detail is a route).

Responsive:

- `<md`: user rows are full-width cards (`md:hidden`) with a leading rail; the table is `hidden md:block`.
- `≥md`: user rows are a `table-fixed` table inside a bordered rounded wrapper, rail inside the first cell.

**Frozen contracts** (`src/test/admin/*` + `e2e/admin*.spec.ts`): `h2` on all three routes; `Manajemen pengguna` / `Detail pengguna`; card title `Pengguna`; the seven `th` labels; `table tbody tr`; `td span:has-text('Admin')`; `\d+ total`; `input[placeholder='Cari email...']`; `Pengguna tidak ditemukan`; `button:has-text('Lihat')` → `/admin/users/:id`; `getByText("Profil", { exact: true })`; `getByRole("heading", { name: "Penyesuaian kredit" })`; **`label:has-text('Jumlah') + input`** and **`label:has-text('Deskripsi') + input`** (Label must stay the immediate previous sibling of its Input); `button:has-text('Sesuaikan kredit')` / `'Konfirmasi perubahan kredit'`; `25 credits`; `7 scans performed` (Trans span structure); `Joined …` / `Bergabung …`; `Unverified` badge keeps the yellow variant; `admin-kpi-chart` keeps `data-bars="scans,findings"`; `admin-credits-chart`; **`.animate-pulse` count ≥ 5 while loading and exactly 0 when loaded**; five KPI tiles each render `0` when stats are undefined; quick links `/admin/users` + `/admin/blog` + `/admin/email-logs` (no `/admin/pricing`). Loading columns: users list `TableRowSkeleton rows={5} columns={8}` (8 `th`); user-detail profile `rows={4} columns={4}`, credit-adjust `rows={3} columns={3}`.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `AdminShell` | kit `Card` + `relative overflow-hidden pl-4` + `SiemRail(adminRailClass(tone))` + optional wash | primary / success / danger / warn / info / alert / idle |
| `AdminShellHead` | `border-b border-border px-4 py-3` + icon chip + `h3` + hint + optional aside | static |
| `AdminShellBody` | `px-4 py-4` | static |
| `AdminIconChip` | `h-8 w-8 rounded-md border bg-muted/40` + muted icon | static |
| `AdminKpiTile` (`admin-kpi-{kind}`) | thin `kind → tone` wrapper over `StatTile` (`icon` + `railClass` + `valueClassName`) | loading → `skeleton`; value tinted by `kpiValueClass(tone)` |
| `AdminNotice` | `relative overflow-hidden rounded-md border bg-card px-3 py-2 pl-4` + rail + `text-xs` | danger / success / warn |
| User row | mobile card `relative … pl-4` + rail; desktop first cell `relative pl-4` + rail | unverified warn / admin primary / plain idle |
| Detail profile shell | `AdminShell` + rail by verification | verified primary / unverified warn |
| Detail credit shell | `AdminShell` + rail by `mutationTone` | idle primary / pending info / success primary / error destructive |
| Empty / not-found | island `rounded-xl border border-border bg-muted/40` | users empty / user not found |

KPI tone map: users → info (sky), scans → primary, findings → alert (orange), credits-in → primary, credits-used → warn (amber).

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150–200ms | ease-out | Row hover `bg-muted/50`, quick-link arrow nudge |
| Spin | CSS `animate-spin` | linear | Submit spinner (kit Button) |
| Press | kit Button `scale` | — | Do not restyle kit |

- GPU only. No layout animation, no ping.
- `prefers-reduced-motion`: only the kit spinner animates.
- **Do not add `animate-pulse` on a loaded surface** — the dashboard test asserts zero pulses after load.

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows, no nested Card-in-Card, no `rounded-3xl`, no filled masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| KPI tiles | `rounded-lg border bg-card` + rail | Dashboard metrics |
| Shells | kit `Card` + `pl-4` + rail + tone wash | Charts, quick links, users, profile, credit adjust |
| Table | `rounded-md border` wrapper + rail inside the first cell | Desktop user rows |
| Empty islands | `rounded-xl border border-border bg-muted/40` | Users empty, user not found |

P15 flatten: the KPI strip is **not** inside PageHeader and **not** inside a shell. Header is title + subtitle + leading icon only.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with KPI value colour / Badge / notice copy.
- PageHeader `h2` is the only level-2 heading; shell titles are `h3`.
- Every field has a kit `Label` + `htmlFor`; the Label stays the immediate previous sibling of its Input (e2e uses the adjacent-sibling selector).
- Primary actions are kit `Button`; mobile user rows use a native full-width `<button>` (allowed card row).
- `role="alert"` on failure notices, `role="status"` on success notices.
- `prefers-reduced-motion`: only the kit spinner animates.

#### Personas

- **Platform admin** (primary): read stats → drill into users → adjust credits.
- **Admin scanning the list**: rail distinguishes unverified (amber) from admin (primary) without reading badges.
- **Admin adjusting credits**: two-step confirm; destructive rail on failure, primary on success.
- **Unverified user detail**: amber profile rail + resend affordance.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Admin pages keep local query/mutation state | 3 pages | This slice restyles chrome only; extracting hooks mixes visual with module work | Named extract |
| Duplicate mobile card + desktop table row markup | AdminUsers | Frozen both-surface rendering; `useIsMobile` would drop one tree | Named a11y slice |
| `adminChrome` tone maps mirror `authChrome` / `profileChrome` / `workspaceChrome` | chrome | Small per-surface tone maps beat a premature shared ops-chrome module | Keep until a named ops-chrome PR |
| Wave 2 admin pages still use plain `Card` | `/admin/hpp`, `/admin/invoices`, `/admin/email-logs`, `/admin/blog`, `/admin/ai` | Explicitly out of scope for wave 1. `/admin/pricing` retired 2026-10-12 | Wave 2 |
| `AdminUsers.test.tsx` still mocks `@/components/ui/Card` | test | Harmless: `AdminShell` composes the real `Card` through the mock | Named test cleanup |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## Admin console — wave 2A (`/admin/hpp`; `/admin/pricing` retired)

**Retired 2026-10-12:** `/admin/pricing`, its GET/PUT API, and the `pricing` table are removed. The AdminPricing diagnosis, frozen contracts, and accepted debt below are historical; AdminHpp contracts still apply.

Print §§0–8 and every SPA section above stay locked. This section is the **dark SPA** contract for the HPP cost surface. `/admin/pricing` is retired. It reuses the wave-1 `AdminShell` / `adminChrome` grammar verbatim — no new primitives — so only the deltas and the HPP-specific tone rules are recorded here.

**Added 2026-10-13/14:** `/admin/skus` (SKU catalog editor + read-only locked bundle/annual card) and `/admin/simulator` (ephemeral what-if calculator) are admin pages that reuse this same `AdminShell` / `adminChrome` grammar — no new primitives. They are not given separate sections here; their behaviour contracts live in [`docs/specs/sinexis-invoice-v1.md`](../../docs/specs/sinexis-invoice-v1.md) and [`docs/specs/admin-hpp-v1.md`](../../docs/specs/admin-hpp-v1.md).

### 0. Research Log (Admin wave 2A)

- Reused wave-1 routing (`linear.app` density + existing Sinexis tokens). No new reference pull.
- Sibling harvest: wave-1 `AdminShell` / `AdminShellHead` / `AdminShellBody` / `adminChrome`; `HostKpiStrip` rail language; `EmptyState` island grammar.
- Current diagnosis: `AdminHpp` was **20 `Card` uses** — the biggest remaining `Card` debt in the repo — with rail-less rates/overhead/costs/report sections and line-margin cards; `AdminPricing` was a kit `Alert` banner + one `Card` with a muted-circle empty state; neither had a rail, and neither had any e2e (so the only safety net is the unit suite).
- Imagen / Lazyweb: skipped — wave-1 grammar is the reference; AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** Same operator console as wave 1. Deltas: **cost surfaces read amber**, the report range reads **sky**, a **negative line margin reads destructive**, and unallocated overhead escalates the report rail to **amber**.

### 1. Atmosphere & Identity

HPP is an internal finance surface. It must read as the same console as wave 1 — same hairline heads, same rail geometry — while the tone vocabulary says "this is cost, not revenue".

The one memorable moment: the **line-margin rail**. A profitable line reads primary, a loss-making line flips destructive, so a bad SKU is visible before the numbers are read.

Do **not** use a filled green masthead or a marketing hero. Loading is `TableRowSkeleton` (HPP rates `rows={5} columns={4}`, costs `rows={2} columns={5}`, report `rows={5} columns={7}`), empty is an island. The retired pricing skeleton (`rows={4} columns={3}`) no longer applies.

### 2. Color

Reuse the wave-1 `AdminTone` map. Deltas:

| Role | Token / class | Usage |
|------|----------------|-------|
| Rates | `--primary` rail | `hpp-rates-card` (`admin-pricing-card` retired) |
| Cost pools | `bg-amber-600` rail | `hpp-overhead-card`, `hpp-costs-card`, cost-line rows, unallocated report |
| Report range | `bg-sky-600` rail | `hpp-report-filters` |
| Line margin | `--primary` rail | positive margin (`marginTone`) |
| Line margin loss | `bg-destructive` rail + `text-destructive` value | negative margin |
| Leftover banner | retired with `/admin/pricing` | `pricing-leftover-banner` no longer rendered |
| Idle | `bg-border` rail | empty states |

### 3. Typography

Unchanged from wave 1. HPP keeps `text-[10px] uppercase` table heads, `font-mono tabular-nums` for every IDR figure, and `text-[11px]` hints.

### 4. Spacing & Layout

Unchanged from wave 1. Deltas:

- HPP rates/costs/report tables are wrapped in `overflow-hidden rounded-md border border-border` (matching the wave-1 user table).
- Cost form grid stays `grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`.
- Line margins stay `grid gap-3 sm:grid-cols-2`.
- Pricing rows: mobile cards `space-y-2 md:hidden`, desktop table `hidden md:block`.

**Frozen contracts** (`src/test/admin/AdminHpp.test.tsx`; `AdminPricing.test.tsx` deleted 2026-10-12): `hpp-overhead-card` / `hpp-costs-card` / `hpp-report-filters` / `hpp-line-scan` / `hpp-line-host`; the costs-card **label order** `["Date", "Category", "Amount (IDR)", "Note"]`; `getAllByDisplayValue(1000)`; the three HPP hint strings (per-seat SKU, not credits); `Report range`; `estimasi` badge; `Margin (estimasi)` **×4** (scan/host/uptime/guard since 2026-10-14 — the card count moved 2→4, see below); `(97%)`; the host-cogs-capped sentence; `TableRowSkeleton rows={5} columns={4}` on HPP rates load, `rows={2} columns={5}` on HPP costs, `rows={5} columns={7}` on HPP report. Historical pricing contracts (`pricing-leftover-banner`, `Pricing configuration`, `Scan credit seed (archive)`) no longer apply.

**Line margins 2→4 (2026-10-14):** `hpp-line-uptime` and `hpp-line-guard` were added (Uptime/Guard COGS keys `uptimecheck`/`guardagent` + their own `line_margins` entry). The testid template `hpp-line-${row.line}` was already generic, so only the count assertion (`length === 2` → `4`) and the fixture changed. `hpp-line-scan` / `hpp-line-host` keep their names. Card titles come from `marginLineLabel()` (`hppLineScan` / `hppLineHost` / `hppLineUptime` / `hppLineGuard`).

### 5. Signature Components & States

No new primitives. Tone sources:

| Surface | Tone |
|---------|------|
| HPP rates | primary |
| HPP overhead | warn |
| HPP costs (+ each cost-line row) | warn |
| HPP report filters | info |
| HPP line margin | `marginTone(row.margin_idr)` |
| HPP report | `reportTone(report.unallocated_overhead_idr)` |
| Pricing leftover banner | retired |
| Pricing archive | retired |

Empty states are `rounded-xl border border-border bg-muted/40` islands: `hpp-rates-empty`, `hpp-costs-empty`. `admin-pricing-empty` is retired.

### 6. Motion

Unchanged from wave 1 (micro hover only; no ping).

### 7. Depth & Surface

Unchanged from wave 1: borders-only + 2px rails, no nested Card-in-Card.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- Unchanged from wave 1. Every field keeps `Label` + `htmlFor`; the HPP cost labels stay the immediate previous sibling of their control.
- HPP rate inputs keep `aria-label={item.key}` (frozen by `getAllByDisplayValue` usage and the table's `aria-label` contract).
- `/admin/pricing` is retired — do not restore a read-only credit-seed page.

#### Personas

- **Platform admin** (primary): adjust a unit rate → set overhead → journal a cost → read the report and line margins.
- **Admin reading margin**: a loss-making line flips destructive without reading the numbers.
- **Admin with unallocated overhead**: the report rail turns amber and the unallocated line shows.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `AdminHpp` still keeps 4 queries + 4 mutations in one file | page | This slice restyles chrome only; extracting hooks mixes visual with module work | Named extract |
| `AdminHpp` tests still mock `@/components/ui/Card` | test | Harmless: `AdminShell` composes the real `Card` through the mock. `AdminPricing` tests deleted 2026-10-12 | Named test cleanup |
| HPP cost lines only carry a rail on the first cell | page | Consistent with the wave-1 user table; a full row wash is unnecessary for a short journal | Keep |
| Wave 2B pages still use plain `Card` | `/admin/invoices`, `/admin/email-logs`, `/admin/blog`, `/admin/ai` | Explicitly out of scope for wave 2A | Wave 2B |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## Admin console — wave 2B (`/admin/invoices`, `/admin/blog`, `/admin/email-logs`, `/admin/ai`)

Print §§0–8 and every SPA section above stay locked. This section is the **dark SPA** contract for the last four admin surfaces. It reuses the wave-1/2A `AdminShell` / `adminChrome` grammar — no new primitives beyond four status-tone helpers — so only the deltas and per-page tone rules are recorded here.

### 0. Research Log (Admin wave 2B)

- Reused wave-1/2A routing and grammar. No new reference pull.
- Sibling harvest: `AdminShell` / `AdminShellHead` / `AdminShellBody`; the billing surface's `WorkspaceInvoiceCard` status-rail precedent; `HostHitsList` (rail inside the first cell, mobile card + desktop row); `EmptyState` island grammar.
- Current diagnosis: `AdminInvoices` (3 `Card` + 7 `CardHeader`) had a kit `Alert` banner, a flat SKU catalog, a flat create form, and a rail-less invoice table with a bare empty `<p>`; `AdminBlog` (2 `Card` + 5 `CardHeader`) had rail-less form + list and a bare empty `<p>`; `AdminEmailLogs` (1 `Card` + 3 `CardHeader`) had a rail-less table and an ad-hoc muted-circle empty state; `AdminAi` (1 `Card`) had a kit `Alert` feature-off and the four tab shells were plain `Card`s. None had a rail.
- Imagen / Lazyweb: skipped — wave-1 grammar is the reference; AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** Same operator console. Deltas: **invoice status drives the rail** (draft muted / sent amber / paid primary / void destructive) on both the row and the list shell; **blog** rails published primary vs draft muted; **email logs** rails failed destructive vs sent primary; **AI** feature-off is a warn shell and every tab shell is a primary `AdminShell`.

### 1. Atmosphere & Identity

These are the last internal surfaces: billing, content, deliverability, AI gateway. They must read as the same console as waves 1/2A — same hairline heads, same rail geometry — while each list's rail says its own status story.

The one memorable moment: the **invoice list rail**. A list containing a void invoice reads destructive, one with a sent invoice reads amber, one with only paid invoices reads primary — the money state is visible before any row is read.

Do **not** use a filled green masthead or a marketing hero. Loading is `TableRowSkeleton` (invoices catalog `rows={3} columns={5}`, invoices list `rows={4} columns={7}`, blog `rows={5} columns={4}`, email logs `rows={5} columns={6}`), empty is an island.

### 2. Color

Reuse the wave-1 `AdminTone` map. Deltas:

| Role | Token / class | Usage |
|------|----------------|-------|
| Banner / neutral shells | `bg-sky-600` (info) or `--primary` | `invoices-banner`, catalog/create shells, blog form, AI shells |
| Sent / warn | `bg-amber-600` rail | Sent invoice row + list shell; blog edit form; AI feature-off |
| Paid / published / sent-email | `--primary` rail + `bg-primary/5` wash | Paid invoice, published post, delivered email |
| Void / failed | `bg-destructive` rail + `bg-destructive/[0.04]` wash | Void invoice, failed email |
| Draft / idle | `bg-border` rail | Draft invoice, draft post |

### 3. Typography

Unchanged from wave 1/2A. Shell titles are `h3` at `text-sm font-medium tracking-wide`; every IDR figure stays `font-mono tabular-nums`; table heads stay `text-[10px] uppercase tracking-wider`.

### 4. Spacing & Layout

Unchanged from wave 1/2A. Deltas:

- Every table is wrapped in `overflow-hidden rounded-md border border-border` (matching waves 1/2A).
- `AdminBlog` form fields move to the repo standard `flex min-w-0 flex-col gap-1.5` (was `space-y-2`).
- Mobile card surfaces (`md:hidden`) keep their existing classes so the wave-1 AI test contracts hold.

**Frozen contracts** (`src/test/admin/*`): `admin-invoices-page`; banner copy `Sinexis bills Scan and Host SKUs`; `SX-202609-0001`; `invoice-create` disabled until org+sku; `invoice-paid-inv-1` / `invoice-send-inv-1` / `invoice-void-*`; `invoice-product` / `invoice-sku` and their `select-root` / `data-value` mock structure; `document.getElementById("inv-org")`; toast copy `Invoice marked sent (no email)` / `Marked paid — Host invoice; Scan org SKU unchanged`; `admin-invoice-print` / `admin-invoice-pdf` absent on draft, present on sent/paid; `invoice-print-sheet` / `invoice-print-bank`; `downloadAdminInvoicePdf("inv-1","SX-202609-0001")`; `blog-slug` / `blog-title` / `blog-excerpt` / `blog-locale` / `blog-body` / `blog-save`; `Blog` heading; `Email send logs`; `No send attempts recorded`; masked recipient + `Failed` + `SMTP timeout`; `Host WAF` label and filter option; `email-logs-pagination` + `Page 1/2/3` + `aria-current="page"`; `emailLogPageItems`; `admin-ai-*` mobile/desktop container classes (`space-y-2 md:hidden` / `hidden md:block`), `admin-ai-provider-card-p1`, `admin-ai-model-card-m1`, `admin-ai-usage-card-u1/u21`, tablist `data-variant="line"` + `w-full` (not `min-w-max`), `admin-ai-usage-pagination`, usage `listAiUsage({page:2,limit:20})`.

### 5. Signature Components & States

No new primitives. Tone sources:

| Surface | Tone |
|---------|------|
| Invoices banner | info (sky) |
| Invoices catalog / create | primary |
| Invoices list shell | `invoiceListTone(statuses)` (void → danger, sent → warn, paid → success, else idle) |
| Invoice row | `invoiceStatusTone(status)` |
| Blog form | warn when editing, primary otherwise |
| Blog list shell | `blogListTone` (published present → primary, else idle) |
| Blog row | `blogStatusTone` (published → primary, draft → idle) |
| Email logs shell | `emailListTone` (any failed → danger, else primary) |
| Email log row | `emailStatusTone` (failed → danger, else primary) |
| AI feature-off | warn |
| AI tab shells | primary |

Empty states are `rounded-xl border border-border bg-muted/40` islands: `admin-invoices-empty`, `blog-empty`, `email-logs-empty`.

### 6. Motion

Unchanged from wave 1 (micro hover only; no ping).

### 7. Depth & Surface

Unchanged from wave 1: borders-only + 2px rails, no nested Card-in-Card.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- Unchanged from wave 1. Every field keeps `Label` + `htmlFor`; the invoice/blog form labels stay the immediate previous sibling of their control where tests use the adjacent-sibling selector.
- Kit only: no native `<select>` in `src/` (tests mock `Select`, which is why the mocks still assert `select-root`).
- `prefers-reduced-motion`: only the kit spinner animates.

#### Personas

- **Platform admin** (primary): create/send/pay/void an invoice, write and publish a post, audit deliverability, manage the AI gateway.
- **Finance admin**: the invoice list rail reads void/sent/paid before the table is scanned.
- **Deliverability admin**: the email shell turns destructive the moment any send failed.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Wave-2B tests still mock `@/components/ui/Card` | tests | Harmless: `AdminShell` composes the real `Card` through the mock | Named test cleanup |
| `adminChrome` now carries invoice/blog/email tone maps | chrome | Consistent with the per-surface tone-map pattern already accepted in waves 1/2A | Named shared ops-chrome extract |
| `AdminAi` list components (`ProviderList` / `ModelList` / `UsageList`) keep their own container classes | components | Frozen by the wave-1 AI test contracts (`space-y-2 md:hidden`) | Keep |
| `AdminInvoices` / `AdminBlog` / `AdminEmailLogs` / `AdminAi` keep queries + mutations in the page | pages | This slice restyles chrome only | Named extract |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |
