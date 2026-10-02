# Sinexis SPA Design System

## 0. Research Log

- Embedded refs: shortlisted `stripe` / `linear.app` / `supabase` → picked Layer A `redesign-skill` + Layer B `stripe` because this is an existing print surface, not greenfield, and the target is a finance document finance teams already file (Linear invoices *are* Stripe PDFs).
- Lazyweb: 2 queries (`saas invoice pdf print billing receipt`), 3 screens viewed (Midday OpenAI usage receipt, Accrual/Refero invoice preview, Stripe dashboard invoice card) → grammar taken: wordmark left / INVOICE+number+status right; two-column Bill from / Bill to; description+period in one cell; right-aligned totals; payment block under totals; hairline rules not filled thead.
- Imagen drafts: skipped — print-media CSS on an existing SPA sheet; no product-screen mock needed; Stripe PDF grammar + viewed receipts are the reference-fidelity contract.
- Skipped lanes: react-grab / react-scan / react-doctor install — print-only CSS/HTML inside an existing SPA; AGENTS.md forbids extra deps for a visual slice; no new interactive React surface.

**Direction (locked):** A paper receipt, not a dashboard card. Ink on white A4, Inter, one green accent on the SINE**XIS** wordmark and the paid chip. Hairlines, tabular IDR, no Palatino, no `#0a7`, no purple wash, no emoji.

## 1. Atmosphere & Identity

Sinexis print documents should feel like a filed bank-transfer invoice: quiet, precise, Indonesian-rupiah-native. The signature is the mono wordmark with a single green **XIS** and a 2px ink rule above the grand total — the one moment a GM remembers when they Save as PDF. Everything else is type, hairlines, and numbers that line up.

This is **not** the dark SPA chrome. Print always forces light paper (`#fff` / `hsl(0 0% 7%)` ink) regardless of `.dark`.

## 2. Color

Print reuses SPA `:root` tokens from `frontend/src/index.css`. No second palette.

### Palette

| Role | Token | Light (print) | Dark (SPA only) | Usage |
|------|-------|---------------|-----------------|-------|
| Paper | `--background` / forced `#fff` | `hsl(0 0% 98%)` → print `#fff` | `hsl(0 0% 4%)` | Print sheet always white |
| Ink | `--foreground` | `hsl(0 0% 7%)` | `hsl(0 0% 96%)` | Headings, totals, party name |
| Body | `--muted-foreground` | `hsl(0 0% 26%)` | `hsl(0 0% 55%)` | Address, period, payment copy |
| Wash | `--muted` | `hsl(0 0% 96%)` | `hsl(0 0% 12%)` | Payment box, sent chip |
| Line | `--border` | `hsl(0 0% 90%)` | `hsl(0 0% 100% / 0.08)` | Hairlines, table rules |
| Accent | `--primary` | `hsl(142 71% 45%)` | same | **XIS**, paid chip only |
| Paid wash | derived | `#dcfce7` / `#166534` | n/a | Paid status chip |
| Danger | `--destructive` | `hsl(0 84% 50%)` | `hsl(0 84% 60%)` | Not used on v1 invoice (no overdue) |

### Rules

- Accent is the wordmark **XIS** and the paid chip. Never a filled table header, never a gradient masthead.
- Print CSS sets `-webkit-print-color-adjust: exact` **and** `print-color-adjust: exact`. Design must still read if Chrome drops washes: hairline borders carry the structure.
- No `#0a7`, no Palatino, no Stripe purple `#533afd` on our paper.

## 3. Typography

### Scale (print)

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Wordmark | 22px / 1.375rem | 700 | 1.0 | 0.08em | SINE**XIS** (JetBrains Mono) |
| Kicker | 11px / 0.6875rem | 600 | 1.3 | 0.14em | `INVOICE` uppercase |
| Number | 16px / 1rem | 600 | 1.2 | 0 | `SX-YYYYMM-NNNN` tabular |
| Party name | 14px / 0.875rem | 600 | 1.4 | 0 | Bill-from / bill-to name |
| Body | 13px / 0.8125rem | 400 | 1.45 | 0 | Cells, payment, amounts |
| Label | 10px / 0.625rem | 600 | 1.3 | 0.10em | FROM / BILL TO / thead |
| Period | 11px / 0.6875rem | 400 | 1.4 | 0 | Line-item subline |
| Grand total | 16px / 1rem | 700 | 1.2 | 0 | Totals last row |
| Footer | 10px / 0.625rem | 400 | 1.5 | 0 | Thanks + legal |

### Font Stack

- Primary: `"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif` (`--font-sans`)
- Mono: `"JetBrains Mono", ui-monospace, Menlo, monospace` (`--font-mono`) — wordmark + invoice number + IDR
- Serif: none. Palatino is forbidden (blog-island drift).

### Rules

- Tabular numerals (`font-variant-numeric: tabular-nums`) on every money and date field.
- Body on paper may sit at 13px (print density). SPA UI stays ≥14px.
- Status chip is sentence-case i18n, not raw `sent`/`paid` as the only label — raw value may stay in `data-status`.

## 4. Spacing & Layout

### Base Unit

All spacing derives from **4px**.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Chip pad, period gap |
| --space-2 | 8px | Chip, label→name |
| --space-3 | 12px | Table cell pad, totals row |
| --space-4 | 16px | Payment box pad, footer pad |
| --space-6 | 24px | Table→totals |
| --space-8 | 32px | Header→parties, parties→table, totals→pay |

### Grid

- Paper: `@page { size: A4; margin: 16mm; }` — matches executive HTML. Do **not** also pad the sheet in print (no double margin).
- Header: flex, brand left, meta right.
- Parties: `grid-template-columns: 1fr 1fr; gap: 32px`.
- Totals: `width: 260px; margin-left: auto`.
- Line item: Description (title + period subline) | Seats | Amount. Qty/rate hours are out — this is a flat SaaS period.

### Rules

- `tr { break-inside: avoid }`. `thead { display: table-header-group }`.
- Do not set `min-height: 297mm` in `@media print` (blank second page). Screen preview may use it later; print must not.
- Payment block is **not rendered** unless `status === "sent"` (AuthZ + I8/I9). CSS-hiding a bank node on paid is not enough — omit the node.

## 5. Components

### InvoicePrintSheet

- **Structure**: `<article class="invoice-print-sheet">` → header (brand + meta) → parties → items `<table>` → totals → optional `.inv-pay` (`data-testid="invoice-print-bank"`) → footer.
- **Variants**: `sent` (bank box + amount due), `paid` (ref + amount paid, **no** bank account), unmounted when `invoice` is null.
- **Spacing**: Section 4. Hairline `--border`; grand-total 2px `--foreground` rule.
- **States**: default (hidden on screen via `.hidden`); print (`body.invoice-printing` + `@media print` visibility isolate). No hover/focus on the sheet itself — it is a document.
- **Accessibility**: `article` with `aria-label` = invoice number; party headings are `<h2 class="inv-label">`; table has `<th scope="col">`; bank fields are a labeled list, not one run-on sentence. Frozen testids stay: `invoice-print-sheet`, `invoice-print-bank`.
- **Motion**: none on the document. Print trigger is `requestAnimationFrame` → `window.print()` (existing hook).
- **Layout**: document stack. Isolation: keep current `visibility: hidden` on `body.invoice-printing *` then visible on `.invoice-print-sheet` — do not `display:none` the AppShell via `body > *` (would fight React roots). Buttons already `.no-print`.

### BrandMark (print)

Do **not** mount the SPA `BrandMark` `<Link>` in print (nav chrome). Recreate the wordmark as `SINE` + accent `XIS` in JetBrains Mono, matching `BRAND.markPrimary` / `markAccent`. Crosshair icon is optional and must not become a second logo.

Bill-from name is `BRAND.name` ("Sinexis"). There is **no** seller address / NPWP env — do not invent one. Bank holder is the account holder, not a street address.

Seats: infer from `sku` locally (`basic` 1 / `pro` 3 / `multi` 10). Not on the invoice JSON.

Tax: implicit 0 (I3). Subtotal equals total. No PPN row.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 100-150ms | ease-out | SPA Print button (existing Button) |
| Standard | 200-300ms | ease-in-out | unused on paper |
| Emphasis | — | — | none |
| Scroll-driven | — | — | none |

### Rules

- The print sheet has no animation. `window.print()` is the only “interaction”.
- SPA Print `Button` keeps existing hover/active/focus from the kit. Do not restyle `components/ui`.

## 7. Depth & Surface

### Strategy

**borders-only** on paper. No `box-shadow`, no cards, no 14px radius widgets.

| Type | Value | Usage |
|------|-------|-------|
| Default | 1px solid `hsl(0 0% 90%)` | Header rule, table rows, payment box, footer |
| Ink rule | 1px solid `hsl(0 0% 7%)` | Table thead underline |
| Grand | 2px solid `hsl(0 0% 7%)` | Totals last row |

Payment box may use `--muted` wash; if print drops backgrounds the 1px border still frames it.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA on the **SPA** Print button (existing kit focus ring).
- Print document: real headings, table headers, contrast ink/paper ≥ 4.5:1 (`hsl(0 0% 7%)` on `#fff`).
- Bank copy only when `status=sent`. Paid must not include `bank_account` text (I8/I9 + frozen tests).
- Language: `workspace` catalog `id`/`en`. Admin page still uses this sheet’s workspace keys.

### Personas (print)

- **GM / finance clerk** (primary): Save as PDF, file with bank transfer. Needs number, bill-to, amount IDR, bank block when unpaid.
- **Ops / platform admin**: same sheet from `/admin/invoices`; bill-to from `organization_name`.
- **Viewer**: no Print button (unchanged).

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| No seller address / NPWP | InvoicePrintSheet bill-from | Env is `INVOICE_BANK_*` only (I9/I10). Inventing an address would be a lie. | New env+API slice if ops names it |
| `visibility` isolation vs portal | `useInvoicePrint` | Existing S1b hook; portal rewrite is out of a visual redesign | Named slice if print chrome leaks |
| react-scan not wired | SPA entry | Print-only slice; no extra deps | Separate tooling PR |
| Tax / due-date fields | model | `tax_idr` implicit 0; no due column — period_end is the month bound | Invoice v2 if named |

---

# SIEM analyst console (`/siem`)

Print invoice (sections 0–8 above) is a **separate surface**. This section is the SPA `/siem` contract. Do not reuse print paper tokens, Palatino, or invoice hairlines on the console. Do not restyle kit files.

## 0. Research Log (SIEM)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + Layer B `linear.app` (ops density, luminance steps, one accent) stacked with `layout-skill` (list-detail / scroll ownership). Not Stripe marketing; not print invoice.
- Lazyweb: 6 queries viewed (`better-stack` logs, `sentry` logs, `okta` logs, `vercel` logs, `panther` cases, `torq` cases) under `/tmp/lazyweb-refs/` → grammar taken: labeled filter bar, dense event stream, left severity encoding, list-detail inspector, cases as incident list — not a CRUD form inside nested Cards.
- Sibling harvest: Inbox (`statusRailClass` 2px left rail), CreditHistory (equal `gap-3` labeled filter grid + KPI identity strip), UptimeKpiRow (rail tiles + live pulse), FindingsTable / `badgeVariants` (`critical|high|medium|low`).
- Imagen drafts: skipped — existing SPA + viewed SOC screens are the reference; no extra imagegen deps.
- Skipped lanes: react-grab / react-scan / react-doctor install — AGENTS.md forbids extra deps for a visual slice; `main.tsx` has none.

**Direction (locked):** A night-shift analyst console on existing Sinexis SPA tokens. Signature: a 2px severity rail on every event (critical red / high orange / medium yellow / low blue) plus a green live pulse on the indexer tile when the cluster is reachable. Inter + JetBrains Mono timestamps. Not a Wazuh dashboard, not nested Card CRUD.

## 1. Atmosphere & Identity

`/siem` is a **second product module** (spec `docs/specs/siem-v1.md`): controlled event search + cases. It must feel like Sentry/Better Stack logs — filter, stream, inspect — sitting inside AppShell, not a marketing page and not Guard inventory.

The one memorable moment: scanning the stream, the eye hits the rail before the copy. Critical rows carry a faint destructive wash; the selected row lifts with `bg-muted/50` and a primary ring on the rail.

## 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo `#5e6ad2` on our chrome (brand accent stays `--primary` green).

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Indexer tiles, filter bar, stream, inspector |
| Ink | `--foreground` | Rule title, case title |
| Meta | `--muted-foreground` | Timestamps, agent ids, KPI labels |
| Accent | `--primary` `hsl(142 71% 45%)` | Apply, create case, indexer reachable pulse, PageHeader leading |
| Critical rail | `bg-destructive` | rule_level ≥ 12 |
| High rail | `bg-orange-500` | ≥ 7 |
| Medium rail | `bg-yellow-500` | ≥ 4 |
| Low rail | `bg-blue-500` | < 4 |
| Open case | sky wash (existing) | status `open` |
| Ack case | amber wash (existing) | status `ack` |
| Closed case | primary/emerald wash | status `closed` |

Severity **chips** use kit `Badge` variants `critical|high|medium|low` — never ad-hoc `bg-red-600 text-white`.

## 3. Typography

SPA scale (not print 13px). Fonts already loaded: Inter Variable (`--font-sans`), JetBrains Mono (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` "SIEM" (e2e frozen) |
| Subtitle | `text-sm` | 400 | PageHeader description (ID e2e: "Pencarian event terkontrol + kasus") |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Indexer strip |
| KPI value | `font-mono text-lg font-bold tabular-nums` | 700 | Status / counts |
| Stream title | `text-sm` | 500 | Rule description |
| Stream meta | `font-mono text-[11px] tabular-nums` | 400 | Time, agent, event id |
| Inspector label | `text-[10px] uppercase tracking-wider text-muted-foreground` | 500 | Field names |
| Inspector value | `text-sm` / mono for ids | 400 | Field values |

Tabular numerals on every time, level, and count.

## 4. Spacing & Layout

4px base. Filter bar **must** copy Credit History: equal `gap-3` grid, each field `flex min-w-0 flex-col gap-1.5`, controls `h-10 min-h-10`. Frozen test: `siem-search-filters` keeps `gap-3` + `lg:grid-cols-3`; **no** `grid-cols-12`, **no** `xl:grid-cols-6`, **no** invisible Apply gutter.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, chip |
| --space-2 | 8px | Stream row inner |
| --space-3 | 12px | Filter gap, tile pad |
| --space-4 | 16px | Filter bar pad, inspector pad |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections.
- **page-grid** — indexer tiles `grid-cols-2 lg:grid-cols-4 gap-3`.
- **list-detail** — `xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)]`. Accordion `<1280px`; table + sticky inspector `≥1280px` (`useIsXl`).
- **scroll-body-shell** — AppShell owns document scroll. Inspector at xl: `sticky top-4 max-h-[calc(100dvb-8rem)] overflow-auto min-h-0`. Do not nest a second event-list scrollbar.

Page size: 10 rows on mobile (`useIsMobile`), 25 otherwise. Pager only when `length > pageSize`.

## 5. Components

### SiemIndexerStrip

- **Structure**: 4 tiles (indexer / min level / lookback / agents). Each tile: 2px left rail + uppercase label + mono value. Reachable indexer may mount `LiveDot` (Uptime chrome).
- **States**: reachable (primary rail + pulse), degraded (amber rail, no pulse), unreachable (destructive rail). Feature-off / loading: strip unmounted.
- **A11y**: text status, not color alone. `aria-hidden` on rails and pulse.

### SiemSearchFilters

- **Structure**: labeled Since / Until / Min level / Agent / Query / Apply. `data-testid="siem-search-filters"`.
- **States**: draft vs applied (Apply commits). Agent `Select` trigger keeps `[&>span]:line-clamp-none`.
- Frozen ids: `siem-since`, `siem-until`, `siem-level`, `siem-agent`, `siem-q`, `siem-apply`.

### SiemEventStream

- **Mobile/tablet**: stacked rows, 2px severity rail, expand in place (`aria-expanded`, `data-testid="siem-event-row"`).
- **xl**: `table-fixed` — Time / Level / Rule / Agent. Rule `break-words` (no truncate). Agent `break-all font-mono` (no `w-[10rem]`, no truncate). Selected row `bg-muted/50`. Auto-select first event.
- **Empty**: `data-testid="siem-events-empty"` copy, no skeletons / no `animate-pulse` after load.
- **Pager**: `data-testid="siem-event-pager"` above and below when needed.

### SiemEventDetail (inspector)

- **Structure**: labeled fields (id + copy, level chip, rule, agent, time) then create-case. `data-testid="siem-event-detail"`. Copy control `data-testid="siem-copy-id"`. Title input `data-testid="siem-case-title"`.
- **xl empty**: `data-testid="siem-event-detail-empty"`.
- Do not dump unlabeled `<p>` soup.

### SiemCasesPanel

- Incident list with status rail + table ≥md. Detail is a **section**, not a Card nested in a Card. Frozen `data-testid="siem-case-detail"`.

### Feature-off / no-agents

Keep `data-testid="siem-feature-off"` and `siem-no-agents"`. Composed empty islands (icon + one line), not a blank Card.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Row hover `bg-muted/40`, chip |
| Standard | 200ms | ease-in-out | Accordion `animate-in fade-in-0` |
| Pulse | CSS `animate-ping` | — | Indexer LiveDot only when reachable |
| Emphasis | — | — | none |

- GPU only: `opacity`, `transform`. No layout animation.
- `motion-reduce:animate-none` / `motion-reduce:transition-none` on pulse and accordion.
- Hover that changes nothing is slop — rows and buttons only.
- Press: kit Button `scale` only. Do not restyle kit.

## 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card.

| Type | Treatment | Use |
|------|-----------|-----|
| Tile / filter / stream | `border border-border bg-card rounded-lg` | Surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` | Severity / indexer / case status |
| Selected | `bg-muted/50` | Active event / case |
| Critical wash | `bg-destructive/[0.04]` | Stream row level ≥ 12 |

P15 flatten: one shell around search (filters + stream); inspector is a sibling pane at xl, not a Card inside the stream Card.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge text (`L{n} · {label}`).
- Every filter has `Label` + `htmlFor`. Event accordion is a `<button>` with `aria-expanded`.
- Copy-id has `aria-label` from i18n `copyId`.
- Heading remains `h2` "SIEM" via PageHeader (Playwright exact).
- `prefers-reduced-motion` kills ping and accordion fade.

### Personas

- **Org analyst / member** (primary): filter → scan stream → inspect → create case.
- **Owner / admin**: same + patch case status + notes.
- **Viewer**: search/list only; no create/patch.
- **Ops with flag off**: feature-off island, no fake dashboard.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| No raw `full_log` body | inspector | Spec default `SIEM_INCLUDE_FULL_LOG` false | Flag + named slice |
| Table row click (xl) not a `<button>` | stream table | Frozen `data-testid="siem-event-row"` on `TableRow`; keyboard via existing table semantics | Named a11y slice |
| Badge dark-leaning colors on light | `badgeVariants` | Kit-wide; do not restyle kit for one page | Design-system PR |
| Print `DESIGN.md` remains invoice-only in §§0–8 | this file | Two surfaces; merging would pollute print | Keep split |

---

# Guard fleet console (`/guard`)

Print invoice (sections 0–8) and SIEM (above) are **separate surfaces**. This section is the SPA `/guard` contract. Do not reuse print paper tokens. Do not restyle kit files. Reuse SIEM rail / empty-island grammar — do not invent a third chrome family.

## 0. Research Log (Guard)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + Layer B `linear.app` (ops density, luminance steps, one accent) stacked with `layout-skill` (stack + page-grid). Same routing as `/siem` (#873). Not Stripe marketing; not print invoice; not a Wazuh/CrowdStrike clone.
- Lazyweb: 6 queries (`crowdstrike falcon hosts`, `wazuh agents`, `sentinelone endpoints`, `endpoint protection agent inventory`, `daytona api keys`, `lago api keys`). Screens saved under `/tmp/lazyweb-refs/`. **Viewed grammar (not pixel copy):** SentinelOne / Fortinet endpoint pages = dense host table + status, not stacked marketing cards; secret-once APIs (Knock / Lago-class) = mono token + copy, shown once. Skipped Forbes/CNBC/Databricks hits (news, not product UI). Pack `generate_report` skipped (deprecated lazyweb path; sibling SIEM harvest is the in-repo contract).
- Sibling harvest: `SiemIndexerStrip` (2px rail KPI tiles + live pulse), `SiemRail`, `SiemEmptyIsland`, `UptimeKpiRow` / `HostOverview` (uppercase 10px labels, mono tabular values, `rounded-md border`), `HostInstallCard` (mono `pre` + copy, not a green soup), PageHeader (`h2` + subtitle + actions). Credit History filter bar is **out** — Guard has no filter row.
- Imagen drafts: skipped — existing SPA + SIEM grammar + viewed EDR/secret screens are the reference; no extra imagegen deps.
- Skipped lanes: react-grab / react-scan / react-doctor install — AGENTS.md forbids extra deps for a visual slice; `main.tsx` has none.

**Direction (locked):** A night-shift **fleet** console on existing Sinexis SPA tokens. Signature: a 4-tile KPI strip with 2px status rails (on = primary + pulse, degraded = amber, off = muted) plus agent/alert rows that carry the same rail before the copy. Enroll secret is a once-only primary-rail panel with JetBrains Mono — the one memorable moment after “Buat token”. Inter + mono IDs/timestamps. Not a Shield-cliché empty Card stack, not nested Card-in-Card, not full SIEM.

## 1. Atmosphere & Identity

`/guard` is P5 Wazuh-thin (spec `docs/specs/guard-v1.md`): org-scoped **agent inventory + critical alerts + per-org enroll**. It must feel like the SIEM/Uptime/Host ops family sitting inside AppShell — filter-less, denser than a settings page, quieter than SIEM search.

The one memorable moment: creating an enroll token, the eye hits a 2px primary rail and a mono secret with Copy — then the fleet table, where online/disconnected is a rail **before** the badge.

Do **not** use Lucide `Shield` as the page signature or empty-state hero (EDR cliché). Empty islands use `Monitor` (disabled / no agents) and `Siren` (no alerts, matching SIEM).

## 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo. No CrowdStrike red masthead.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | KPI tiles, enroll, agents, alerts |
| Ink | `--foreground` | Agent name, alert title |
| Meta | `--muted-foreground` | Timestamps, UUIDs, KPI labels |
| Accent | `--primary` `hsl(142 71% 45%)` | Enable, create token, on-rail, live pulse |
| On / online | `bg-primary` rail + emerald badge wash | Guard enabled, agent `active` |
| Degraded / disconnected | `bg-amber-500` rail + amber badge | Status degraded, agent disconnected |
| Pending | `bg-sky-500` rail + sky badge | Agent pending |
| Off / disabled / expired | `bg-border` rail + muted badge | Guard off, agent disabled, token expired/used |
| Critical alert | `bg-destructive` rail + `Badge variant="critical"` | Alert rows (level ≥ 12) |
| Once-secret | `border-primary/40 bg-primary/5` + primary rail | Enroll plaintext + Host Protect token once |

Agent **chips** stay kit `Badge` washes (emerald / amber / sky / muted) — never ad-hoc `bg-red-600 text-white`. Alert level chips use `Badge variant="critical"` as today.

## 3. Typography

SPA scale (not print 13px). Fonts already loaded: Inter Variable (`--font-sans`), JetBrains Mono (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` **"Guard"** (e2e frozen, exact) |
| Subtitle | `text-sm` | 400 | PageHeader description (ID e2e: "Pasang agen di host, lalu pantau inventori dan alert kritis") |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Identity strip |
| KPI value | `font-mono text-lg font-bold tabular-nums` | 700 | Counts; Guard on/off may be sentence-case i18n inside the tile |
| Section title | `text-sm tracking-wide` | 600 | Enroll / Agents / Alerts headers |
| Row title | `font-mono text-xs font-medium` | 500 | Agent name |
| Row meta | `font-mono text-[11px] tabular-nums` | 400 | UUID truncate, timestamps |
| Secret | `font-mono text-[11px] leading-relaxed break-all` | 400 | Enroll token, curl, distro commands |

Tabular numerals on every time and count. Body copy stays i18n `guard` catalog — do not change frozen e2e strings (`title`, `subtitle`, `enable`, `createToken`, `saveNow`, `revoke`, `sync`).

## 4. Spacing & Layout

4px base. **No** Credit History filter bar (Guard has no search/date/select row).

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, chip |
| --space-2 | 8px | Row inner, token card pad |
| --space-3 | 12px | Tile gap, tile pad |
| --space-4 | 16px | Section pad |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`).
- **page-grid** — KPI tiles `grid-cols-2 gap-3 lg:grid-cols-4` (same as `SiemIndexerStrip`).
- **scroll-body-shell** — AppShell owns document scroll. No nested fleet scrollbar.
- **list-detail** — **not** used. Guard is not SIEM inspect. Agents + alerts are stacked sections, not a split inspector.

Responsive:

- `<md`: agent/token **cards** (`guard-agent-card`, `guard-enroll-token-card`). Action stack `flex-col gap-2`, buttons `w-full min-h-9`.
- `≥md`: tables. Enroll table `min-w-[36rem]` **not** `table-fixed`. Agent table `min-w-[40rem]` **not** `table-fixed` (frozen unit tests). Horizontal scroll wrapper only.

PageHeader actions: Enable (when off + admin) or Sync (when on + admin). Sync keeps `min-h-11` (44px tap).

## 5. Components

### GuardKpiStrip

- **Structure**: 4 tiles — state / agents / critical alerts / last sync. Each tile: `SiemRail` + uppercase label + value. State tile mounts a live pulse when enabled and not degraded.
- **Frozen**: `data-testid="guard-state"` + `data-enabled="true"|"false"` on the **state value** (must still contain i18n `nyala` / `nonaktif` / `on` / `off`). Wrapper `data-testid="guard-kpi-strip"`.
- **States**: loading = skeleton tiles (no pulse). Status error = `data-testid="guard-status-error"` **instead of** the strip (session vs load copy unchanged). Feature off (Guard disabled) = strip still mounts (off rail) **above** the disabled island.
- **A11y**: text status, not color alone. `aria-hidden` on rails and pulse.

### GuardEnrollPanel

- **Structure**: one shell (`border border-border bg-card rounded-lg`) — header + labeled create row + token list. Not a Card nested in a Card.
- **Create row**: `Label` + `Input#enroll-label` + `Button` "Buat token" / "Create token". Equal `gap-2`, control `h-10`.
- **Once-secret** (`data-testid="guard-host-enroll-steps"`): 2px primary rail, `bg-primary/5`, mono secret in `<code>`, host steps `<ol>`, curl `<pre>` + copy, distro `Accordion` (`guard-agent-install-steps`, `guard-distro-install-commands`). Commands stay collapsed until trigger (frozen unit test).
- **Token list**: ready-first sort; expired `opacity-60`; revoke confirm dialog unchanged. Frozen `guard-enroll-token-row` / `guard-enroll-token-card`.
- **Host Protect once-token**: sibling alert `data-testid="guard-host-token-once"` — same primary-rail secret treatment, not a second green soup.

### GuardAgentsPanel

- **Structure**: one shell `data-testid="guard-agents"`. Empty: `SiemEmptyIsland` + `data-testid="guard-agents-empty"` (icon `Monitor`, copy `noAgents`).
- **Row**: 2px rail — online `bg-primary`, disconnected `bg-amber-500`, pending `bg-sky-500`, disabled `bg-border`. Name mono; UUID `CopyableId`; last seen + helper poll; version; asset chip `guard-asset-chip-{id}`; admin Select `guard-link-asset-{id}`; host-token `guard-host-token-issue`; disable `guard-disable-{id}`.
- **Do not** dump IP in the default row (keep current columns). Do not `table-fixed`.

### GuardAlertsPanel

- **Structure**: one shell `data-testid="guard-alerts"`. Empty: island + `guard-open-siem` link to `/siem`.
- **Rows**: 2px destructive rail + `Badge variant="critical"` `L{n}` + description + mono meta (time · agent · rule). Not a nested Card list.

### Disabled / error

- Disabled: `data-testid="guard-disabled"` composed island (`Monitor` + `disabledHint`), **not** `rounded-3xl` Shield hero.
- Errors: kit `Alert variant="destructive"` for mutations; status load uses `guard-status-error` copy (`sessionExpired` vs `loadStatusFail`).

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Row hover `bg-muted/40`, copy button |
| Standard | 200ms | ease-in-out | Accordion distro (`animate-in fade-in-0`) |
| Pulse | CSS `animate-ping` | — | KPI live dot only when Guard is on and not degraded |
| Emphasis | — | — | none |

- GPU only: `opacity`, `transform`. No layout animation.
- `motion-reduce:animate-none` / `motion-reduce:transition-none` on pulse and accordion.
- Hover that changes nothing is slop — rows and buttons only.
- Press: kit Button `scale` only. Do not restyle kit.
- Copy: clipboard then 2s "Disalin" / "Copied" on curl; Host Protect token same.

## 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`.

| Type | Treatment | Use |
|------|-----------|-----|
| KPI / enroll / agents / alerts | `border border-border bg-card rounded-lg` | Surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | State / agent / alert / once-secret |
| Once-secret | `bg-primary/5` + primary rail | Enroll + host-token plaintext |
| Expired token row | `opacity-60` | Used/expired still readable |

P15 flatten: KPI strip is **not** inside a status Card. Enroll, agents, and alerts are sibling shells — not a dashboard of stacked `CardHeader` icons.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / strong text (`nyala`, `online`, `L{n}`).
- Every form field has `Label` + `htmlFor` (`enroll-label`, asset Select).
- Copy / disable / revoke / host-token controls keep i18n `aria-label`s.
- Heading remains `h2` "Guard" via PageHeader (Playwright exact).
- `prefers-reduced-motion` kills ping and accordion fade.
- Never print enroll/host-token secrets into logs, toasts, or tracked markdown.

### Personas

- **Owner / admin** (primary): enable → mint enroll token → copy curl → sync → link asset / issue Host Protect token / remove agent.
- **Member**: view fleet + alerts; no enable / token / disable / host-token.
- **Viewer**: view only (no remove, no enroll).
- **Ops with Guard off**: KPI off + disabled island; no fake agents.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| Duplicate mobile + desktop agent/token markup | GuardAgents / Enroll | Frozen testids on both card and row; `useIsMobile` rewrite is out of a visual slice | Named a11y slice |
| `SiemRail` / `SiemEmptyIsland` imported into Guard | chrome | One rail primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| No IP column on agent table | agents | Current columns frozen by unit tests (`Last seen`, `Version`, `min-w-[40rem]`) | Named column slice |
| Lazyweb pack `generate_report` not filed | research log | Deprecated MCP path; in-repo SIEM harvest is the contract | Ignore |
| Print `DESIGN.md` remains invoice-only in §§0–8 | this file | Three surfaces; merging would pollute print | Keep split |

---

# Assets SPA (`/assets`)

Print §§0–8 and Guard SPA above stay locked. This section is the **dark SPA** contract for the asset registry — not paper, not Guard enroll.

## 0. Research Log (Assets)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid) and Layer B `linear.app` (ops density, luminance steps, one accent). Same routing as `/guard` / `/siem`. Not Stripe marketing; not print invoice; not a CMDB / AWS inventory clone.
- Sibling harvest: `GuardKpiStrip` (`KpiTile` + `SiemRail`, `grid-cols-2 gap-3 lg:grid-cols-4`), `SiemEmptyIsland`, `GuardAgentCard` / `GuardAgentsPanel` (mobile cards `md:hidden` + desktop table `hidden md:block`, 2px type rail before copy), `PageHeader`, kit `Progress` (`indicatorClassName`), `TableRowSkeleton`. Credit History filter bar is **already** the Assets filter contract (`AssetFilters` h-10 / gap-2) — do not restyle it into a 12-col Apply gutter.
- Current `/assets` diagnosis: SKU quota buried in PageHeader as a thin `h-1.5` bar; empty/loading are generic Cards; type is muted text with no rail; mobile cards are nested `bg-card` chips without a leading rail; desktop table is a flat spreadsheet; quota-at-cap has no urgency color.
- Imagen drafts: skipped — existing SPA + Guard/SIEM grammar is the reference; no extra imagegen deps.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.
- Lazyweb pack `generate_report`: skipped (deprecated path; in-repo Guard/SIEM harvest is the contract).

**Direction (locked):** A night-shift **registry** console on existing Sinexis SPA tokens. Signature: a 4-tile KPI strip that **owns** SKU quota (count/limit + urgency bar) plus domain/IP type counts, then a single list shell whose rows/cards carry a 2px **type rail** (sky domain / violet IP) before the name. Empty is a muted island with Globe, not a blank Card. Inter + mono targets. Not a CMDB graph, not nested Card-in-Card, not Guard hosts.

## 1. Atmosphere & Identity

`/assets` is P3 scan-side registry (spec `docs/specs/assets-v1.md`): named IP and domain **targets** for schedules and pack export — **not** Guard hosts. It must feel like the Guard/SIEM/Uptime ops family inside AppShell: denser than settings, quieter than SIEM search, with a filter bar (Assets *does* filter; Guard does not).

The one memorable moment: quota approaching the SKU cap, the eye hits an amber then destructive rail and bar **before** the Add button disables. Type is encoded in the rail, not a spreadsheet “Type” column as the only cue.

Do **not** use Lucide `Shield` (Guard/EDR cliché) or `Server` as a datacenter hero. Empty island uses `Globe` (named targets). Loading is skeleton rows, not a spinner in a Card.

## 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo. No AWS orange masthead.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | KPI tiles, list shell, mobile cards |
| Ink | `--foreground` | Asset name, KPI values |
| Meta | `--muted-foreground` | Target, type label, KPI labels |
| Accent | `--primary` `hsl(142 71% 45%)` | Add, empty CTA, quota OK rail/bar |
| Domain | `bg-sky-500` rail + sky type chip | Domain assets, Domains KPI tile |
| IP | `bg-violet-500` rail + violet type chip | IP assets, IPs KPI tile |
| Quota warn | `bg-amber-500` rail + amber `Progress` indicator | ≥70% and <90% of SKU cap |
| Quota cap | `bg-destructive` rail + destructive indicator | ≥90% or `count >= limit` |
| Scheduled | `bg-primary` rail when count > 0, else `bg-border` | Scheduled KPI tile |
| Guard linked | kit `Badge variant="info"` | Existing chip — do not recolor |

Type **chips** may use sky/violet washes (`bg-sky-500/15 text-sky-700 dark:text-sky-300` / violet equivalent). Tag colors stay `tagColorClass` / `tagColorStyle` — appearance only.

## 3. Typography

SPA scale (not print 13px). Inter Variable (`--font-sans`), JetBrains Mono (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` i18n `title` |
| Subtitle | `text-sm` | 400 | PageHeader description = `subtitle` only (quota **leaves** the header) |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Identity strip |
| KPI value | `font-mono text-lg font-bold tabular-nums` | 700 | Counts; quota value may include sku copy |
| Section title | `text-sm tracking-wide` | 600 | List `tableTitle` (sr-only / `data-slot="card-title"`) |
| Row title | `text-sm font-medium` | 500 | Asset name |
| Target | `font-mono text-xs tabular-nums` | 400 | IP / domain target |
| Filter | kit Input/Button `h-10` | 400 | `AssetFilters` unchanged contract |

Tabular numerals on every count and target. Body copy stays i18n `assets` catalog. Frozen unit strings: `skuLabel` (`Plan {{sku}} — {{count}} / {{limit}} assets`), `tableTitle` (`Assets`), empty CTA, filter labels. Do **not** rewrite those keys; add `kpiQuota` / `kpiScheduled` / `kpiDomains` / `kpiIps` only.

## 4. Spacing & Layout

4px base. Filter bar **is** Credit History grammar (already in `AssetFilters`): equal gap, controls `h-10 min-h-10`. Do not invent a second filter layout.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, chip |
| --space-2 | 8px | Card inner, filter gap |
| --space-3 | 12px | Tile gap, tile pad, mobile list pad |
| --space-4 | 16px | Section pad |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`): header → KPI → list/empty.
- **page-grid** — KPI tiles `grid-cols-2 gap-3 lg:grid-cols-4` (same as `GuardKpiStrip`).
- **scroll-body-shell** — AppShell owns document scroll. Horizontal scroll wrapper on desktop table only (`overflow-x-auto`). No nested list scrollbar.
- **list-detail** — **not** used. Assets is not SIEM inspect.

Responsive (frozen by unit tests — **both** trees stay in the DOM):

- `<md`: stacked cards `data-testid="assets-list-mobile"` with classes `space-y-2 p-3 md:hidden`. Each card `data-testid="asset-card-{id}"` keeps `rounded-lg` + `border-border`.
- `≥md`: table `data-testid="assets-list-desktop"` with classes `hidden md:block overflow-x-auto`.

Do **not** switch on `useIsMobile` (tests assert both surfaces). Duplicate markup is accepted debt (same as Guard agents).

PageHeader actions: Export pack dropdown + Add (`min-h-11 sm:min-h-10`) when `items.length > 0`. Empty uses island CTA only (`assets-empty-cta`) — **no** header Add (frozen).

## 5. Components

### AssetKpiStrip

- **Structure**: 4 tiles — quota / scheduled / domains / IPs. Each tile: `SiemRail` + uppercase label + value. Quota tile mounts kit `Progress` (`h-1.5`) with `indicatorClassName` from quota tone. Wrapper `data-testid="assets-kpi-strip"`.
- **Frozen copy**: quota tile **must** render i18n `skuLabel` (`Plan {{sku}} — {{count}} / {{limit}} assets` / ID equivalent) so existing unit tests keep matching.
- **States**: loading = `AssetKpiSkeleton` (4 tiles, no bar). Empty registry = strip still mounts (0 / limit, all zeros). At cap = destructive rail + bar; Add stays disabled.
- **A11y**: text status (`skuLabel`, counts), not color alone. `aria-hidden` on rails.

### Asset list shell

- **Structure**: one `Card` (or equivalent) `data-testid="assets-list"` with `[data-slot="card-title"]` text = i18n `tableTitle` (`Assets`) — frozen. Filters live in the header strip (`border-b`). Not a Card nested in a Card.
- **Loading**: `data-testid="assets-loading"` + `[data-slot="card-title"]` `Assets` + `TableRowSkeleton` (frozen).
- **Empty**: island `data-testid="assets-empty"` — `Globe` + `empty` + `emptyHint` + primary `Button` `assets-empty-cta` (`bg-primary`, `min-h-11`). Grammar: `rounded-xl border border-border bg-muted/40`, generous `min-h-[12rem] md:min-h-[16rem]`. Not a Shield hero, not `rounded-3xl`.
- **No match**: `data-testid="assets-no-match"` + `assets-clear-filters` unchanged.

### Asset card / row

- **Rail**: `SiemRail` — domain `bg-sky-500`, IP `bg-violet-500`, unknown `bg-border`. Card: `relative overflow-hidden … pl-4`. Row: rail in the name cell (`relative pl-4`), same as `GuardAgentsPanel`.
- **Type chip**: sky/violet wash next to the name (card) / in the type column (table) — redundant with the rail.
- **Frozen testids**: `asset-menu-{id}`, `asset-edit-{id}`, `asset-schedule-{id}`, `asset-delete-{id}`, `assets-watch-http`, `asset-tag-{tag}` / `asset-tag-card-{tag}`, `asset-guard-chip-{id}` / `-card`. Kebab still owns edit / schedule / watch HTTP / delete.
- **Target**: mono tabular, `break-all` on cards.

### AssetFormSheet

- Right `Sheet`. Fields keep `asset-name` / `asset-type` / `asset-target` / `asset-tags` / `asset-save`. Type + target disabled when editing. Kit `Label` + `Input` / `Select` only.

### AssetFilters

- **Do not restyle** for this slice. Frozen testids (`assets-filters`, `asset-search`, `asset-type-filter`, tag popover / colors). Segmented type control already encodes domain/IP/all.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Row hover (kit table `hover:bg-muted/50`), kebab |
| Standard | 200ms | ease-in-out | Sheet slide (kit) |
| Progress | 500ms | ease-out | Quota bar fill (kit `Progress`) |
| Emphasis | — | — | none (no ping on Assets) |

- GPU only: `opacity`, `transform`. No layout animation.
- Hover that changes nothing is slop — rows, tag chips, and buttons only.
- Press: kit Button only. Do not restyle kit.
- `prefers-reduced-motion`: kit sheet / progress already respect it; do not add a live pulse on Assets.

## 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested `Card` inside `Card`, no `rounded-3xl`.

| Type | Treatment | Use |
|------|-----------|-----|
| KPI tiles | `border border-border bg-card rounded-lg` + `SiemRail` | Quota / scheduled / type counts |
| List shell | `border border-border bg-card rounded-lg` | Filters + table / cards |
| Mobile card | same + leading rail | `<md` list |
| Empty / no-match | `rounded-xl border bg-muted/40` | Islands |
| Quota bar | kit `Progress` track `bg-muted`, indicator tone | Inside quota tile |

P15 flatten: KPI strip is **not** inside PageHeader and **not** inside the list Card. Header is title + subtitle + actions only.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA on SPA tokens. Rails are redundant with type chip + `skuLabel` / counts.
- Every form field has `Label` + `htmlFor`.
- Kebab keeps `aria-label` `actionsMenu`. Type filter is `role="group"` with `aria-label`.
- Heading remains `h2` via PageHeader.
- Never print customer targets into tracked markdown.

### Personas

- **Owner / admin / member** (primary): add named IP/domain → tag → schedule → pack export; feel the SKU cap before it hard-blocks.
- **Viewer**: list + filter only (no add / delete — AuthZ is API; UI still shows actions the API will reject).
- **Ops at cap**: destructive quota tile; Add + empty CTA disabled; `limitReached` toast on create.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Duplicate mobile + desktop asset markup | Asset list | Frozen testids on both card and row; `useIsMobile` would drop one tree | Named a11y slice |
| `SiemRail` imported into Assets | chrome | One rail primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| `AssetFilters.tsx` over 250 LOC | filters | Pre-existing; this slice does not restyle filters | Named filter split |
| Lazyweb pack `generate_report` not filed | research log | Deprecated MCP path; sibling Guard/SIEM harvest is the contract | Ignore |
| Print `DESIGN.md` remains invoice-only in first §§0–8 | this file | Three surfaces; merging would pollute print | Keep split |

---

# Page-nav line tabs (`/ai`, Host, SIEM, ScanDetail, Admin AI)

Print invoice, Guard, and Assets (above) are **separate surfaces**. This section is the SPA **page-nav** tab contract. Do not restyle kit default (pill) Tabs. Reuse existing Radix `Tabs.tsx` — do not invent a second tab primitive. Uptime range tabs stay pill.

## 0. Research Log (AI tabs)

- Embedded refs: shortlisted shadcn New York v4 `tabs.json` (`variant: default | line`) + sibling Host Protect / Uptime / SIEM pill tabs → picked kit `variant="line"` as a **second official variant**, not a page-local underline. Layer A `redesign-skill` + Layer B `linear.app` (ops density, one accent) stacked with `layout-skill` (stack). Not Stripe marketing; not print invoice.
- Lazyweb: skipped this slice — in-repo shadcn kit + Host Protect in-app count (`font-mono text-[11px] tabular-nums`) are the contract. No extra imagegen deps.
- Sibling harvest: `Tabs.tsx` default pill (`h-10 rounded-md bg-muted p-1`); Host Protect tab counts (not `Badge variant="critical"`); Credit History filter chrome is **out** — `/ai` has no filter row.
- Skipped lanes: react-grab / react-scan / react-doctor install — AGENTS.md forbids extra deps for a visual slice; `main.tsx` has none.

**Direction (locked):** Full-width underline **page-nav** on `/ai`, Host Protect, SIEM, ScanDetail, and Admin AI. Signature: a 2px `--foreground` underline (`after:h-0.5 after:bg-foreground`) under the active trigger, not `--primary`. Inter labels + lucide icons + mono counts via kit `TabCount`. **Keep pill:** UptimeDetail range (`data-testid="uptime-range-tabs"`) and other in-card segmented controls. Do not convert filter pills.

## 1. Atmosphere & Identity

Page-nav tabs sit under PageHeader (or after ScanDetail KPI tiles) as **page navigation**, not a segmented control inside a Card. They must feel like Linear/Supabase settings nav — quieter than SIEM search filters, denser than a marketing feature tab.

The one memorable moment: scanning the tab row, the eye hits a hairline `--border` list and a 2px ink underline on the active tab **before** the panel copy. Counts sit as muted mono via `TabCount`, never a critical Badge.

Do **not** restyle default `TabsList` to line. Callers that omit `variant` keep `bg-muted` pills.

## 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Wallet / keys / usage / catalog panels |
| Ink | `--foreground` | Active tab label + **line underline** |
| Meta | `--muted-foreground` | Inactive tab, counts, CardDescription |
| Line | `--border` | `TabsList variant="line"` bottom hairline |
| Accent | `--primary` `hsl(142 71% 45%)` | Create key, top-up CTA — **not** the tab underline |
| Pill wash | `--muted` | Default `TabsList` only (Uptime range + in-card pills) |

Underline is `after:bg-foreground`, **never** `after:bg-primary`. Counts are `text-muted-foreground`, not `Badge variant="critical"` / `bg-red-600`.

## 3. Typography

SPA scale. Fonts already loaded: Inter Variable (`--font-sans`), JetBrains Mono (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` **"AI Gateway"** |
| Subtitle | `text-sm` | 400 | PageHeader description |
| Tab label | `text-sm font-medium` | 500 | Wallet / Keys / Usage / Catalog (EN role names frozen) |
| Tab count | `font-mono text-[11px] tabular-nums` | 400 | Active-key count, usage `items.length` when > 0 |
| Panel hint | `text-sm` CardDescription | 400 | `keysHint` / `usageHint` / `catalogHint` / `baseUrlHint` |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Wallet stat tiles |
| KPI value | `font-mono text-lg font-bold tabular-nums` | 700 | Balance / keys / period billed |
| Secret / URL | `font-mono text-xs` / `text-[11px]` | 400 | Base URL, once-key |

Tabular numerals on every count, time, and IDR. Body copy stays i18n `ai` catalog — do not change frozen EN role names (`Wallet`, `Keys`, `Usage`, `Catalog`).

## 4. Spacing & Layout

4px base. **No** Credit History filter bar.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Icon/count gap (`gap-1.5` on triggers) |
| --space-2 | 8px | Row inner |
| --space-3 | 12px | Tile gap |
| --space-4 | 16px | `TabsContent` `mt-4`, panel pad |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`).
- **scroll-body-shell** — AppShell owns document scroll. Tab list is `w-full justify-start`, **not** `min-w-max` (no overflow strip).
- **list-detail** — **not** used. Each tab is a single panel.

`TabsList variant="line"`: `h-auto justify-start gap-1 rounded-none border-b border-border bg-transparent p-0`. Page passes `className="w-full justify-start"`.

URL `?tab=` (`replace: true`). Default tab **deletes** the param. Unknown `?tab` → default. ScanDetail patches `tab` through existing `patchFindingsParams` so `page`/`severity`/`sort`/`dir`/`q` are not clobbered.

| Page | Tabs | Default (deletes `?tab`) |
|------|------|--------------------------|
| `/ai` | wallet / keys / usage / catalog | wallet |
| `/host` | malware / waf | malware |
| `/siem` | search / cases | search |
| `/scan/:id` | findings / diff / export | findings |
| `/admin/ai` | providers / models / usage / topup / trial | providers |

## 5. Components

### Tabs (kit)

- **Default** (`variant` omitted): pill list `h-10 rounded-md bg-muted p-1`; active trigger `data-[state=active]:bg-background` + shadow. Uptime range (`uptime-range-tabs`) and in-card pills stay here.
- **Line** (`variant="line"`): hairline list + `data-variant="line"`. Active trigger underline via `group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100` (`after:h-0.5 after:bg-foreground`). Line mode kills pill wash (`bg-transparent`, `shadow-none`).
- Do **not** restyle kit files to match one screenshot. Frozen default tests: `bg-muted`, `data-variant="default"`. Frozen line tests: `bg-transparent`, `border-b`, `after:bg-foreground`, not `after:bg-primary`.

### Page-nav callers

Shared chrome: `TabsList variant="line" className="w-full justify-start"`. Icons `aria-hidden`. Counts via kit `TabCount` (null when `value <= 0`). Duplicate in-panel `CardTitle` matching the tab label is dropped.

- **`/ai`**: Wallet / Keys / Usage / Catalog. Frozen testids `ai-tab-wallet` … `ai-tab-catalog`. EN role names frozen. Counts: Keys = active keys; Usage = `items.length`.
- **Host Protect**: Malware / WAF. Frozen `host-tab-waf`. Icons `Bug` / `Shield`. Count: `overviewNeedsDecision` on Malware.
- **SIEM**: Search events / Cases (EN roles frozen). Icons `Search` / `FolderOpen`. Count: open cases on Cases. Search `CardTitle` and cases CardHeader title dropped.
- **ScanDetail**: Findings / Diff / Export (EN roles frozen). Icons `Crosshair` / `GitCompare` / `Download`. Count: `findingsCount` on Findings.
- **Admin AI**: Providers / Models / Usage / Top-up / Trial. Icons `Server` / `Boxes` / `ScrollText` / `Wallet` / `MessageSquare`. No `min-w-max` overflow strip. Usage CardTitle dropped.

### AiWalletPanel

- Extracted wallet card. Stat tiles (balance / active keys / period billed) + empty-wallet CTA + copyable `/v1` base URL. Not a second tab primitive.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 200ms | `transition-all` / `after:transition-opacity` | Trigger + underline opacity |
| Reduced | — | — | `motion-reduce:after:transition-none` |
| Emphasis | — | — | none |

- GPU only: `opacity` on the underline. No layout animation.
- Hover that changes nothing is slop — triggers only.
- Press: kit Button `scale` only. Do not restyle kit.

## 7. Depth & Surface

**borders-only**. No glass, no drop shadows on the line list (pill `shadow-sm` stays on **default** variant only).

| Type | Treatment | Use |
|------|-----------|-----|
| Line list | `border-b border-border bg-transparent` | Page-nav |
| Underline | `after:h-0.5 after:bg-foreground` | Active line trigger |
| Panels | kit `Card` | Wallet / keys / usage / catalog |
| Pill list | `bg-muted rounded-md` | Default variant only |

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Underline is redundant with `data-state="active"` + `text-foreground`.
- Radix Tabs: keyboard arrows, `role="tablist"` / `tab` / `tabpanel`.
- Icons `aria-hidden`. Visible labels from i18n (`tabWallet` …).
- Heading remains PageHeader `h2` "AI Gateway".
- `prefers-reduced-motion` kills underline opacity transition.

### Personas

- **Owner / member** (primary): wallet → mint key → copy `/v1` → scan usage / catalog.
- **Admin**: same + top-up CTA may point at `/admin/ai`.
- **Ops with flag off**: `ai-feature-off` island; no tabs.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Line `after:` classes on default triggers | `TabsTrigger` | Hidden unless `group-data-[variant=line]` + active; extracting a second Trigger would fork the kit | Keep group-data until a named kit split |
| Uptime range stays pill | `/uptime/:id` | In-card filter, not page-nav | Keep default variant |
| `AiWalletPanel` 8 readonly props | wallet panel | Extracted from page; grouping into a stats object is a follow-up | Named refactor |
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| Print `DESIGN.md` remains invoice-only in §§0–8 | this file | Five surfaces; merging would pollute print | Keep split |

# Status page ops console (`/uptime/status-page`)

Print §§0–8 and SIEM / Guard / Assets / page-nav above stay locked. This section is the **dark SPA** contract for the authenticated editor at `/uptime/status-page` — not public HTML `/status/{slug}`, not print, not the Uptime monitor list.

## 0. Research Log (Status page)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid) and Layer B `linear.app` (ops density, luminance steps, one accent). Same routing as `/guard` / `/siem` / `/assets`. Not Stripe marketing; not Linear indigo; not a public status-page clone of Better Stack's marketing skin.
- Sibling harvest: `GuardKpiStrip` / `SiemIndexerStrip` (`KpiTile` + `SiemRail`, `grid-cols-2 gap-3 lg:grid-cols-4`, live `GuardPulse` when healthy), `SiemEmptyIsland`, `GuardAgentCard` (mobile cards `md:hidden` + desktop table `hidden md:block`, 2px rail before copy), `PageHeader` `h2`. Identity / hostname / components / incidents stay **sibling shells**, not a dashboard of nested Card-in-Card icons.
- Current `/uptime/status-page` diagnosis (post-#868): `StatusHealthHero` is a flat `rounded-lg` card with no rail and no pulse; `StatusKpiRow` is three border tiles without `SiemRail`; stacked kit `Card`s for identity / DNS / components / incidents; empty components/incidents are ad-hoc muted boxes, not `SiemEmptyIsland`; incident mobile cards and desktop rows have wash but no leading rail. Correct-but-flat.
- Lazyweb screens viewed (6): Better Stack (overall banner + component rows), Google Apps Status (traffic-light overall), Splunk status (incident ops table), UptimeRobot (KPI counts + public URL), GetFernand (copyable DNS), mobile-alerts (stacked cards, 44px taps). Grammar taken: **overall health is the first read**; copyable DNS as secret-rail records; incidents table desktop / cards mobile; empty islands. Not pixel copies; not a second public-page skin.
- Imagen drafts: skipped — existing SPA + Guard/SIEM grammar is the reference; no extra imagegen deps.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice. Lazyweb `update.sh` failed (`set: Illegal option -o pipefail`); screens already on disk under `/tmp/lazyweb-refs/status-page/`.

**Direction (locked):** A night-shift **public-health command center** on existing Sinexis SPA tokens. Signature: a health hero whose **2px overall rail** (and pulse when operational + published) is the first thing the eye hits, then a 4-tile KPI strip, then DNS copy records with a primary rail (this page's "once-secret"), then a component board and incident ops list. One document scroll. Green `--primary`, not Linear indigo. Inter + mono paths. Not a public status marketing page, not nested Card-in-Card.

## 1. Atmosphere & Identity

`/uptime/status-page` is the workspace editor for the public status page (spec `docs/specs/status-page-v1.md`): slug/title, publish, custom hostname + TXT, Uptime components, hand-posted incidents. It must feel like the Guard/SIEM/Assets ops family inside AppShell: denser than settings, quieter than SIEM search. **No** page-nav tabs (single scroll). **No** Credit History filter bar.

The one memorable moment: when the page is published and overall is operational, the hero rail goes primary and a live pulse sits next to "All systems operational". When overall is major, the rail goes destructive **before** the operator opens Incidents. DNS pending is a primary-rail copy strip, not a nested muted soup.

Do **not** use Lucide `Shield` (Guard cliché) or a filled green masthead. Empty create uses `Radio` (broadcast). Empty components uses `Activity`. Empty incidents uses `Radio`. Loading is skeleton KPI tiles, not a spinner in a Card.

Public `/status/{slug}` is **out of scope** — do not restyle the FastAPI HTML island here.

## 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo `#5e6ad2`. No Better Stack purple wash.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Hero, KPI tiles, identity / host / board / incidents shells, mobile cards |
| Ink | `--foreground` | Titles, KPI values, incident titles |
| Meta | `--muted-foreground` | KPI labels, timestamps, public path, hints |
| Accent | `--primary` `hsl(142 71% 45%)` | Operational rail/pulse, published KPI, empty CTA, TXT secret rail, resolved incident rail |
| Degraded | `bg-amber-500` rail + `text-amber-500` | Overall degraded, pending TXT, investigating incident, component degraded |
| Partial | `bg-orange-500` rail + `text-orange-500` | Overall partial, identified incident |
| Major / down | `bg-destructive` rail + `text-destructive` | Overall major, hostname failed, component down, critical impact |
| Monitoring | `bg-sky-500` rail | Incident status `monitoring` |
| Idle | `bg-border` rail | Unpublished, hostname none, unknown |
| Open wash | `bg-amber-500/[0.04]` | Unresolved incident card/row (redundant with rail) |
| Down wash | `bg-destructive/[0.04]` | Component row when `down` |
| TXT secret | `bg-primary/5` + primary rail | Pending TXT copy strip (Guard once-secret grammar) |

Rails are **redundant** with Badge / strong text. Never color-only status.

## 3. Typography

SPA scale (not print 13px). Inter Variable (`--font-sans`), JetBrains Mono (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` i18n `title` ("Status page" / "Halaman status") |
| Subtitle | `text-sm` | 400 | PageHeader description |
| Hero kicker | `text-[10px] font-medium uppercase tracking-wider` | 500 | `overallLabel` |
| Hero value | `text-lg sm:text-xl font-semibold tracking-tight` | 600 | i18n overall sentence (`overallOperational` …) |
| Hero title | `text-sm truncate` | 400 | Page title under overall |
| KPI label | `text-[10px] font-medium uppercase tracking-wider` | 500 | Visibility / Components / DNS / Public URL |
| KPI value | `font-mono text-lg font-bold tabular-nums` (path: `text-sm`) | 700 | Counts, visibility word, hostname label, public path |
| Section title | `text-sm tracking-wide` CardTitle | 400 | Identity / hostname / components / incidents |
| Mono record | `font-mono text-xs break-all` | 400 | CNAME / TXT name / TXT value |
| Table head | `text-[10px] uppercase tracking-wider` | 500 | Component + incident columns |
| Incident title | `text-sm font-medium` | 500 | Card + table |
| Timestamp | `font-mono text-xs tabular-nums` | 400 | `formatStartedAt` |
| Disclaimer | `text-xs text-muted-foreground` | 400 | `disclaimer` |

Tabular numerals on every count and time. Body copy stays i18n `statusPage` catalog. Frozen EN roles: `Published` / `Unpublished`, `Waiting for TXT` / `Active` / `Failed` / `Not attached`, `TXT validation`, `Do not point A/AAAA at the origin.`, `Remove` (aria-label only on the icon button). Do not change those strings.

## 4. Spacing & Layout

4px base. **No** Credit History filter bar. **No** line tabs.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, chip gap |
| --space-2 | 8px | Row inner, copy-record pad |
| --space-3 | 12px | Tile gap, tile pad, form gap-3 |
| --space-4 | 16px | Section / card pad |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`).
- **page-grid** — KPI tiles `grid-cols-2 gap-3 lg:grid-cols-4` (same as `GuardKpiStrip`).
- **scroll-body-shell** — AppShell owns document scroll. One page scroll. Incident sheet (`Sheet` `side="right"`) is the only nested scroller (`overflow-y-auto`).
- **list-detail** — **not** used. Incidents are not a split inspector; edit is the existing right sheet.
- **cluster** — PageHeader actions (Publish / Open public), hostname buttons, component add row.

Responsive:

- `<md`: incident **cards** (`status-incidents-list-mobile` **must** keep `space-y-2 md:hidden`). KPI 2×2. Identity / hostname / add-component fields stack (`grid-cols-1`, `sm:grid-cols-2`). Controls `h-10 min-h-10`; icon remove `h-11 w-11` on mobile.
- `≥md`: incident **table** (`status-incidents-list-desktop` **must** keep `hidden overflow-x-auto md:block`) with a real `<table>`. Component board is a table at all breakpoints (horizontal scroll wrapper). Sheet `sm:max-w-lg lg:max-w-xl`.

PageHeader actions: Publish/Unpublish (`status-page-publish`) + Open public (`target="_blank"`). Keep `h2`.

Content stress: long slug / hostname / TXT token uses `break-all` / `truncate` + `min-w-0`. 375px: no horizontal scrollbar on primary content (table wrappers may scroll internally).

## 5. Components

### StatusHealthHero

- **Structure**: `relative overflow-hidden rounded-lg border border-border bg-card pl-4`. `SiemRail` from `overallRailClass`. Kicker `overallLabel` + overall sentence (`overallValueClass`) + truncated page title. Visibility `Badge` (`completed` / `info`).
- **Pulse**: `GuardPulse` when `published && overall === "operational"`.
- **Wash**: `bg-primary/5` overlay when operational + published; `bg-destructive/5` when published + major. Pointer-events none, `aria-hidden`.
- **States**: unpublished → muted value + `bg-border` rail, no pulse. Unknown overall → `overallUnknown`, border rail.

### StatusKpiRow

- **Structure**: 4 tiles — visibility / components (up · down) / DNS status / public path. Each tile: `SiemRail` + uppercase label + value. Wrapper `data-testid="status-kpi-strip"`. Grid `grid-cols-2 gap-3 lg:grid-cols-4`.
- **Rails**: published `bg-primary` else `bg-border`; components `bg-destructive` when `downCount > 0` else `bg-primary` when any up else `bg-border`; DNS via `hostnameRailClass`; public path `bg-border`.
- **Pulse**: visibility tile when published (same job as Guard state pulse).
- **Values**: visibility uses i18n `visibilityOn` / `visibilityOff` (not raw `true`). Public path `font-mono text-sm truncate`.

### StatusCopyRecord / TXT strip

- Copy row: `relative overflow-hidden … pl-4` + primary `SiemRail`. Frozen testids `status-copy-cname` / `status-copy-txt-name` / `status-copy-txt-value`. 44px copy hit target (`h-11 w-11`). Check icon `text-primary` when copied.
- Pending TXT wrapper: `bg-primary/5` + primary rail (Guard once-secret). Visible "TXT validation", "Waiting for TXT" (via hostname badge, not raw `pending_txt`), CNAME line `{{host}} → {{target}}`, `noAaaa`. Frozen `status-page-host`.

### StatusComponentBoard

- Empty: `SiemEmptyIsland` icon `Activity`, title `noComponents`.
- Rows: `relative`, first cell `pl-4` + `componentRailClass` (`up` primary / `down` destructive / `degraded` amber / else border). Down wash `bg-destructive/[0.04]`. Remove icon-only, `aria-label` i18n `remove`, frozen `status-component-remove-{id}`, visible text must **not** match `/Remove/`.

### StatusIncidentList / Card

- Mobile list frozen classes + `status-incident-card-{id}`. Card: `relative overflow-hidden … pl-4` + `incidentRailClass`. Unresolved wash kept. `status-incident-post-update-{id}` on open incidents. Title input is **not** on the card (sheet only).
- Desktop: frozen classes + `<table>` + `status-incident-row-{id}`. First cell `relative pl-4` + rail (Guard agent row grammar). Unresolved row wash kept.
- Empty: `SiemEmptyIsland` icon `Radio`, title `noIncidents`.
- Sheet: frozen `status-incident-sheet` with `right-0`; create testids unchanged.

### Empty create / loading

- No page: island (`rounded-xl border border-border bg-muted/40`) + `Radio` + copy in `status-page-empty` + slug/title `Label`+`Input` `h-10` + `status-page-create`. Not a blank Card.
- Loading: 4 skeleton tiles `h-[4.5rem] rounded-lg`, not a spinner.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Row hover `bg-muted/50`, copy button |
| Pulse | CSS `animate-ping` | — | Hero + visibility KPI only when published + (hero: operational) |
| Copy | 1500ms | — | Swap Copy → Check, then revert |
| Emphasis | — | — | none |

- GPU only: `opacity` on ping. No layout animation.
- `motion-reduce:animate-none` on `GuardPulse` (already in the primitive).
- Hover that changes nothing is slop — rows, buttons, copy only.
- Press: kit Button `scale` only. Do not restyle kit.
- Incident create/edit: existing right `Sheet`. Do not invent a modal.

## 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`, no filled green masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| Hero / KPI / shells / cards | `border border-border bg-card rounded-lg` | Surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | Overall, KPI, DNS copy, component, incident |
| TXT secret | `bg-primary/5` + primary rail | Pending hostname |
| Empty island | `rounded-xl border border-border bg-muted/40` (`SiemEmptyIsland`) | No page / no components / no incidents |
| Open incident | `bg-amber-500/[0.04]` + amber/orange/sky rail | Unresolved |

P15 flatten: KPI strip is **not** inside a status Card. Hero is a sibling of the KPI strip, not a CardHeader icon row.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / overall sentence / hostname label.
- Every form field has `Label` + `htmlFor` (slug, title, host, display name, incident fields).
- Copy / remove / incident menu keep i18n `aria-label`s. Remove is icon-only.
- Heading remains PageHeader `h2` i18n `title` (Playwright / unit).
- `prefers-reduced-motion` kills ping.
- Kit only: no native `<select>`; primary actions are `Button`.
- Frozen testids in `frontend/src/test/StatusPage.test.tsx` must survive (including mobile `space-y-2 md:hidden` and desktop `hidden overflow-x-auto md:block`).

### Personas

- **Owner / member who can manage** (primary): create page → set slug/title → publish → attach hostname / copy TXT → map monitors → post incidents.
- **Member without manage**: view + post updates; no incident delete (`canManageMembers` gate).
- **Empty workspace**: create island, no fake components.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| Duplicate mobile + desktop incident markup | StatusIncidentList | Frozen testids on both card and row | Named a11y slice |
| `SiemRail` / `SiemEmptyIsland` / `GuardPulse` imported into status | chrome | One rail/pulse primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| Public `/status/{slug}` HTML not restyled | FastAPI island | Authenticated SPA only; public must rhyme Landing | Named public-status slice |
| `StatusPage.tsx` already >250 LOC | page | Extracting identity/host would mix a visual slice with a module split | Named extract |
| Lazyweb pack `generate_report` not filed | research log | `update.sh` pipefail; screens on disk are the harvest | Ignore |
| Print `DESIGN.md` remains invoice-only in §§0–8 | this file | Multiple SPA surfaces; merging would pollute print | Keep split |

# Uptime ops console (`/uptime` + `/uptime/:id`)

Print §§0–8 and SIEM / Guard / Assets / Status / page-nav above stay locked. This section is the **dark SPA** contract for the authenticated monitor fleet (`/uptime`) and probe inspector (`/uptime/:id`) — not public `/status/{slug}`, not print, not the status-page editor.

## 0. Research Log (Uptime)

- Embedded refs: shortlisted `linear.app` / `stripe` / `sentry` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as `/guard` / `/siem` / `/assets` / `/uptime/status-page`. Not Stripe marketing; not Linear indigo `#5e6ad2`; not a Better Stack / UptimeRobot marketing clone.
- Sibling harvest: `GuardKpiStrip` / `AssetKpiStrip` / `StatusKpiRow` (`KpiTile` + `SiemRail`, `grid-cols-2 gap-3`, live `GuardPulse` when healthy), `StatusHealthHero` (2px overall rail + wash + pulse), `SiemEmptyIsland`, `GuardAgentCard` / `SiemEventMobileCard` (mobile cards `md:hidden` + desktop table `hidden md:block`, 2px rail in first cell), `PageHeader` `h2`. Fleet KPI and detail hero must be **sibling shells**, not nested Card-in-Card icon rows.
- Current `/uptime` diagnosis: `UptimeKpiRow` is three generic `rounded-md` border tiles (no rail, no pulse); `UptimeMonitorList` mobile cards and desktop `table-fixed` rows wash down-state but have no leading rail; empty filter/list is an ad-hoc muted box, not `SiemEmptyIsland`; sparkline 96×28 already exists. Correct-but-flat Card stack.
- Current `/uptime/:id` diagnosis: hero is a flat `rounded-lg` card with a muted protocol circle (generic icon-in-circle trap); `uptime-detail-kpi` is three border tiles without `SiemRail`; availability bar already has `segmentClass` / `buildBarSegments` (keep); outage rows and history cards have wash but no rail. `UptimeDetail.tsx` ~775 pure LOC — extract chrome, do not grow the page.
- Competitive grammar (Better Stack / Pingdom / UptimeRobot / Sentry, sibling P15): **fleet health is the first read** (up/down counts + pulse); probe target is a mono record under a state rail; availability is a **timeline bar**, not a sparkline-as-hero; outages are an ops list. Not pixel copies; not a second public-page skin.
- Imagen drafts: skipped — existing SPA + Guard/SIEM/Status grammar is the reference; no extra imagegen deps.
- Lazyweb pack: `/tmp/lazyweb-refs` empty this session; sibling P15 + competitive grammar above is the harvest. `update.sh` / `generate_report` not filed.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** A night-shift **probe command center** on existing Sinexis SPA tokens. Signature: fleet KPI whose **2px up-rail + live pulse** is the first thing the eye hits, then a monitor table/cards whose state rail reads before the name, then a detail hero whose rail/wash/pulse matches `StatusHealthHero`, then a 3-tile range KPI strip, then the existing availability timeline. One document scroll. Green `--primary`, not Linear indigo. Inter + mono paths. Not a marketing status page, not nested Card-in-Card.

## 1. Atmosphere & Identity

`/uptime` is the workspace fleet for outside-in HTTP/TCP/heartbeat/DNS/ping (spec `docs/specs/uptime-v1.md`): SKU-capped seats, filters, add/edit sheet, pause/delete. `/uptime/:id` is the probe inspector: range (6h / 24h / 7d + custom dates), range KPI, availability bar, outages, sample history. Both must feel like the Guard/SIEM/Assets/Status ops family inside AppShell: denser than settings, quieter than SIEM search. **No** page-nav tabs on the list. Detail range stays **pill** `TabsList` (`data-testid="uptime-range-tabs"`) — do **not** convert to `variant="line"`.

The one memorable moment: when any monitor is `up`, the Up KPI rail goes primary and a live pulse sits next to the count. On detail, when the probe is enabled and `up`, the hero rail goes primary and the pulse sits next to the state word. When a probe is `down`, the rail goes destructive **before** the operator opens History. Sparkline stays a 96×28 latency spark in the desktop Spark column — not the hero.

Do **not** use Lucide `Shield` (Guard cliché) or a filled green masthead. Protocol uses existing `ProtocolGlyph` (Globe / Network / HeartPulse / Radio / Activity). Empty fleet uses `Activity`. Filter-empty uses `Activity`. Outages-empty / history-empty use `SiemEmptyIsland`. Loading is skeleton KPI tiles + table rows, not a spinner in a Card.

Public `/status/{slug}` and `/uptime/status-page` are **out of scope**.

## 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo `#5e6ad2`. No Better Stack purple wash.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Hero, KPI tiles, list shell, range card, outages, history |
| Ink | `--foreground` | Titles, KPI values, monitor names |
| Meta | `--muted-foreground` | KPI labels, timestamps, target, hints |
| Accent / up | `--primary` `hsl(142 71% 45%)` | Up rail/pulse/spark, range-% emphasize, empty CTA, availability `up` segment |
| Degraded | `bg-amber-500` rail + `text-amber-500` | Degraded state, SKU near-cap |
| Down | `bg-destructive` rail + `text-destructive` | Down KPI, down row, availability `down` segment, last error |
| Idle / unknown / paused | `bg-border` rail | Unknown, paused (`enabled=false`), empty spark |
| Down wash | `bg-destructive/[0.04]` | Down card/row, failed history row (redundant with rail) |
| Up wash | `bg-primary/5` | Detail hero when `up` (Status operational grammar) |
| SKU cap | `text-destructive` + destructive progress | Seats at limit |
| SKU warn | `text-amber-500` + amber progress | Seats ≥ 80% |

Rails are **redundant** with Badge / strong text / sparkline stroke. Never color-only status.

## 3. Typography

SPA scale (not print 13px). Inter Variable (`--font-sans`), JetBrains Mono (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` i18n `title` ("Uptime") / monitor name on detail |
| Subtitle | `text-sm` | 400 | PageHeader description; last-error line on detail (`text-[11px] text-destructive`) |
| Hero kicker | `text-[10px] font-medium uppercase tracking-wider` | 500 | `check_type` |
| Hero target | `font-mono text-sm truncate` | 400 | Probe target |
| Hero meta | `font-mono text-[11px] tabular-nums` | 400 | Latency, 24h %, interval |
| KPI label | `text-[10px] font-medium uppercase tracking-wider` | 500 | Up / Down / SKU seats; Range % / OK / Samples |
| KPI value | `font-mono text-lg font-bold tabular-nums` (SKU: `text-sm`) | 700 | Counts, percents |
| Section title | `text-sm tracking-wide` CardTitle | 400 | Monitors / Availability / Outages / Checks |
| Table head | `text-[10px] uppercase tracking-wider` | 500 | Frozen copy: `Spark`, `24h %` (never a lone `24h`) |
| Mono record | `font-mono text-sm` / `text-xs break-all` | 400 | Target, timestamps, errors |
| Timestamp | `font-mono text-xs tabular-nums` | 400 | Samples / outages |

Tabular numerals on every count, percent, latency, and time. Body copy stays i18n `uptime` catalog (EN+ID). Frozen EN roles: `Spark`, `24h %`, `up` / `down` / `degraded` / `unknown`, empty CTA `Add your first monitor`. Do not change those strings.

## 4. Spacing & Layout

4px base. List filters stay the existing `UptimeFiltersSection` (mobile accordion `rounded-md` + `last:border-b`; desktop `uptime-filters` grid). **Do not** restyle to Credit History `grid-cols-12`. Detail custom range already copies Credit History: `gap-3` grid, each field `flex min-w-0 flex-col gap-1.5`, controls `h-10 min-h-10`.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, chip gap |
| --space-2 | 8px | Row inner, card pad mobile |
| --space-3 | 12px | Tile gap, tile pad, form gap-3 |
| --space-4 | 16px | Section / card pad |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`).
- **page-grid** — fleet KPI `grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_2fr]` (**must** keep `grid-cols-2` — frozen in `Uptime.test.tsx`). Detail KPI `grid-cols-3 gap-2 sm:gap-3`.
- **scroll-body-shell** — AppShell owns document scroll. One page scroll. Add/edit `Sheet` `side="right"` (`uptime-sheet` **must** keep `right-0`) is the only nested scroller.
- **list-detail** — **not** used as a split pane. Fleet is a table; inspector is a separate route.
- **cluster** — PageHeader actions (Add / Pause), range pill tabs, outage/sample pagers.

Responsive:

- `<md`: monitor **cards** (`space-y-2 p-3 md:hidden`). KPI 2-col. History **cards**. Controls `h-10 min-h-10`; actions icon `h-11 w-11` on mobile. Sample page size 10; outage page size 5.
- `≥md`: monitor **table** (`hidden overflow-x-auto md:block`) with `table-fixed` (frozen) **and** `min-w-[64rem]` so the wrapper actually scrolls at 768 instead of squeezing the 96×28 Spark into ~55px (`LATENSIGRAFIK` header crush). Spark column `min-w-[8rem]`. History **table**. Sheet `sm:max-w-lg`. Sample page size 20; outage page size 5.

**`uptime-row` is desktop-table only.** Mobile cards must **not** get `data-testid="uptime-row"`.

Content stress: long name / URL uses `truncate` / `break-all` + `min-w-0`. 375px: no horizontal scrollbar on primary content (table wrappers may scroll internally). Unbroken target strings wrap in cards.

## 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `UptimeKpiRow` (`uptime-kpi`) | `KpiTile` + `SiemRail` + optional `GuardPulse` on Up; SKU tile + `Progress` (`uptime-sku-quota`) | Up rail primary + pulse when `upCount > 0`; Down rail destructive when `downCount > 0` else muted; SKU rail primary / amber / destructive by quota |
| `UptimeHealthHero` | `StatusHealthHero` grammar: `relative overflow-hidden rounded-lg border bg-card pl-4` + `SiemRail` + wash + `ProtocolGlyph` + target + meta cluster + pulse when enabled+up | up / down / degraded / unknown / paused (`enabled=false` → idle rail, no pulse) |
| `UptimeDetailKpiStrip` (`uptime-detail-kpi`) | 3 `KpiTile` + `SiemRail`; retention note `col-span-3` (`uptime-samples-retention-note`) | Range % primary rail; OK/Samples border rail; blanked `—` when beyond 7-day sample retention |
| Monitor card (mobile) | `relative rounded-lg border bg-card p-3 pl-4` + `SiemRail` + Badge + glyph + 24h/latency + `MonitorActionsMenu` | down wash; **no** `uptime-row` |
| Monitor row (desktop) | `table-fixed` + `h-12` + first cell `relative pl-4` + `SiemRail` + sparkline + actions | `uptime-row`; hover `bg-muted/50`; down wash |
| `Sparkline` (`uptime-sparkline`) | 96×28 SVG area+stroke; empty `"—"` | stroke primary / destructive / muted; height ≥ 28 (frozen) |
| Availability bar (`uptime-availability-bar`) | `h-8` flex segments, `segmentClass` | up primary, down destructive, else muted |
| Outage row (`uptime-outage-row`) | `relative rounded-md border p-3 pl-4` + destructive rail | ongoing vs duration; pager `uptime-outage-pagination` |
| History (`uptime-history-panel`) | Card + mobile cards / desktop table; fail wash + rail | empty → `SiemEmptyIsland` |
| Empty fleet (`uptime-empty`) | Card island + `Activity` + `uptime-empty-cta` | keep testids; CTA `Button` |
| Filter empty | `SiemEmptyIsland` | `filterEmpty` copy |
| Add/edit | existing right `Sheet` (`uptime-sheet` `right-0`) | do not invent a modal |

Default / hover / focus / disabled / loading / error / empty / current: kit Button / Tabs / DatePicker / Badge. Hover that changes nothing is slop — rows, links, buttons only. Unknown enabled monitors keep the existing 4s list poll.

## 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Row hover `bg-muted/50`, link underline |
| Pulse | CSS `animate-ping` | — | Up KPI when `upCount > 0`; detail hero when enabled + `up` |
| Press | kit Button `scale` | — | Do not restyle kit |
| Emphasis | — | — | none |

- GPU only: `opacity` on ping. No layout animation.
- `motion-reduce:animate-none` on `GuardPulse` (already in the primitive).
- Sparkline is static SVG — do not animate the path.

## 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`, no filled green masthead, no generic icon-in-circle as the hero focal object (`ProtocolGlyph` sits in the type row, not a 40px muted disc).

| Type | Treatment | Use |
|------|-----------|-----|
| Hero / KPI / shells / cards | `border border-border bg-card rounded-lg` | Surfaces (list KPI tiles `rounded-lg` to match Guard; filters accordion stays `rounded-md` — frozen) |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | KPI, hero, monitor card/row, outage, failed history |
| Empty island | `rounded-xl border border-border bg-muted/40` (`SiemEmptyIsland`) | Filter empty, outages empty, history empty |
| Down wash | `bg-destructive/[0.04]` + destructive rail | Down monitor, failed sample |
| Up wash | `bg-primary/5` | Detail hero when `up` |

P15 flatten: fleet KPI strip is **not** inside a monitors Card. Detail hero is a sibling of the range card and KPI strip, not a CardHeader icon row.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / KPI value / sparkline stroke / availability segment.
- Every form field has `Label` + `htmlFor` (sheet + outage from/to). SKU progress keeps `aria-label`.
- Actions menu keeps i18n `aria-label` (`actionsMenu`). Pause is a labeled `Button`.
- Heading remains PageHeader `h2` (list i18n `title`; detail = monitor name).
- `prefers-reduced-motion` kills ping.
- Kit only: no native `<select>`; primary actions are `Button`.
- Frozen testids in `frontend/src/test/Uptime.test.tsx`, `UptimeDetail.test.tsx`, and `frontend/e2e/uptime.spec.ts` must survive: `uptime-page`, `uptime-add`, `uptime-kpi` (`grid-cols-2`), `uptime-filters` / `uptime-filters-toggle` (`rounded-md` + `border-border` + `last:border-b`, not `last:border-b-0`), `uptime-row` (desktop only), `uptime-sparkline` (empty `"—"`, height ≥ 28), `uptime-actions` / `uptime-edit` / `uptime-delete`, `uptime-sheet` (`right-0`), `uptime-name` / `uptime-target` / `uptime-save` / `uptime-advanced` / `uptime-timeout` / `uptime-expect-status`, `uptime-empty` / `uptime-empty-cta`, `uptime-detail`, `uptime-detail-pause`, `uptime-history-panel`, `uptime-range-6h` / `24h` / `7d`, `uptime-range-tabs` (pill), `uptime-detail-kpi`, `uptime-outage-pagination` / `uptime-outage-row`, `uptime-sample-pagination`. Frozen copy: header `"Spark"`, `"24h %"` not `/^24h$/`. Ranges stay `6h` / `24h` / `7d`. `SAMPLE_PAGE_SIZE=20`. `OUTAGE_PAGE_SIZE=5`.

### Personas

- **Owner / member who can manage** (primary): add monitor (until SKU cap) → scan fleet KPI → filter → open detail → pause / edit / delete.
- **Member viewer**: read fleet + detail; mutations still gated by existing API.
- **Empty workspace**: empty island + Add CTA, no fake rows.
- **On-call at 2am**: down rail + last-error hint must be readable without opening the sheet.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| Duplicate mobile + desktop monitor / history markup | UptimeMonitorList / UptimeHistoryPanel | Frozen `uptime-row` is desktop-only; history has mobile+desktop testids | Named a11y slice |
| `SiemRail` / `SiemEmptyIsland` / `GuardPulse` imported into uptime | chrome | One rail/pulse primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| `UptimeDetail.tsx` still large after hero/KPI extract | page | Range/outage/sample logic is the page; further split would mix visual slice with a module split | Named extract |
| Filters accordion stays `rounded-md` while KPI tiles go `rounded-lg` | UptimeFiltersSection | Frozen class match on `rounded-md` + `last:border-b` | Keep |
| Lazyweb pack `generate_report` not filed | research log | `/tmp/lazyweb-refs` empty this session; sibling P15 is the harvest | Ignore |
| Print `DESIGN.md` remains invoice-only in §§0–8 | this file | Multiple SPA surfaces; merging would pollute print | Keep split |
| 768 fleet table scrolls horizontally | `UptimeMonitorList` | Frozen `table-fixed` + 7 cols + Spark 96×28 cannot fit AppShell inset (~512px) without crush; Guard `min-w` + `overflow-x-auto` is the sibling pattern. Do **not** wrap headers or drop Spark at md | Keep; 375 stays cards |
