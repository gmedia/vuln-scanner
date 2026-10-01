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
| Body | `--muted-foreground` | `hsl(0 0% 26%)` | `hsl(0 0% 72%)` | Address, period, payment copy |
| Wash | `--muted` | `hsl(0 0% 96%)` | `hsl(0 0% 14%)` | Payment box, sent chip |
| Line | `--border` | `hsl(0 0% 90%)` | `hsl(0 0% 28%)` | Hairlines, table rules |
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
