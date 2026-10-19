# Foundation — Sinexis SPA Design System

### 0. Research Log

- Embedded refs: shortlisted `stripe` / `linear.app` / `supabase` → picked Layer A `redesign-skill` + Layer B `stripe` because this is an existing print surface, not greenfield, and the target is a finance document finance teams already file (Linear invoices *are* Stripe PDFs).
- Lazyweb: 2 queries (`saas invoice pdf print billing receipt`), 3 screens viewed (Midday OpenAI usage receipt, Accrual/Refero invoice preview, Stripe dashboard invoice card) → grammar taken: wordmark left / INVOICE+number+status right; two-column Bill from / Bill to; description+period in one cell; right-aligned totals; payment block under totals; hairline rules not filled thead.
- Imagen drafts: skipped — print-media CSS on an existing SPA sheet; no product-screen mock needed; Stripe PDF grammar + viewed receipts are the reference-fidelity contract.
- Skipped lanes: react-grab / react-scan / react-doctor install — print-only CSS/HTML inside an existing SPA; AGENTS.md forbids extra deps for a visual slice; no new interactive React surface.

**Direction (locked):** A paper receipt, not a dashboard card. Ink on white A4, Sora, one green accent on the SINE**XIS** wordmark and the paid chip. Hairlines, tabular IDR, no Palatino, no `#0a7`, no purple wash, no emoji.

### 1. Atmosphere & Identity

Sinexis print documents should feel like a filed bank-transfer invoice: quiet, precise, Indonesian-rupiah-native. The signature is the mono wordmark with a single green **XIS** and a 2px ink rule above the grand total — the one moment a GM remembers when they Save as PDF. Everything else is type, hairlines, and numbers that line up.

This is **not** the dark SPA chrome. Print always forces light paper (`#fff` / `hsl(0 0% 7%)` ink) regardless of `.dark`.

### 2. Color

Print reuses SPA `:root` tokens from `frontend/src/index.css`. No second palette.

#### Palette

| Role | Token | Light (print) | Dark (SPA only) | Usage |
|------|-------|---------------|-----------------|-------|
| Paper | `--background` / forced `#fff` | `hsl(0 0% 98%)` → print `#fff` | `hsl(0 0% 4%)` | Print sheet always white |
| Ink | `--foreground` | `hsl(0 0% 7%)` | `hsl(0 0% 96%)` | Headings, totals, party name |
| Body | `--muted-foreground` | `hsl(0 0% 26%)` | `hsl(0 0% 55%)` | Address, period, payment copy |
| Wash | `--muted` | `hsl(0 0% 96%)` | `hsl(0 0% 12%)` | Payment box, sent chip |
| Line | `--border` | `hsl(0 0% 90%)` | `hsl(0 0% 100% / 0.08)` | Hairlines, table rules |
| Brand green | `--primary` | `hsl(142 71% 45%)` | `hsl(142 71% 45%)` | **XIS** wordmark, primary buttons, rails, icons |
| Readable green | `--primary-text` | `hsl(142 71% 28%)` | `hsl(142 71% 45%)` | Links and green text on a light surface |
| Paid wash | derived | `#dcfce7` / `#166534` | n/a | Paid status chip |
| Danger | `--destructive` | `hsl(0 84% 47%)` | `hsl(0 84% 60%)` | Destructive text + buttons |

#### Rules

- Accent is the wordmark **XIS** and the paid chip. Never a filled table header, never a gradient masthead.
- **`--primary` is the brand green and is identical in both themes**: `hsl(142 71% 45%)`, paired with `--primary-foreground: hsl(0 0% 4%)` (near-black). Buttons, rails, icons and the **XIS** wordmark all read the same in light and dark — that is the point of the brand.
- **`--primary-text` is the readable variant, for text only.** Contrast is symmetric, so one green cannot be legible as *text on white* **and** as a *button background*: at `45%` green text on white is **2.30:1**. Light therefore darkens **only** `--primary-text` to `28%` (5.19:1 on white, 4.97:1 on `--muted`); dark keeps `45%` (8.6:1 on the dark card). Moving `text-primary` → `text-primary-text` is a **no-op in both themes** (light 28% = old `--primary`, dark 45% = `--primary`), so it never changes what a page looks like — it only stops the brand from being darkened. **Never use `--primary-text` for a filled button background.**
- `--ring` needs 3:1 against its surface, so light keeps it at `28%` while dark stays at `45%`. `--sidebar-primary` now mirrors the brand green in both themes.
- Focus rings always use `ring-ring` (never `ring-primary`) so the light ring stays at the darker, 3:1-passing green. In the per-page tables below, "Accent `--primary`" means the *chrome* role (buttons, rails, icons); green **text** (links, inline labels) renders via `--primary-text`.
- **Every palette text colour comes from `lib/toneColors.ts`** — `TONE_TEXT` for text on a surface, `TONE_CHIP_TEXT` for text on the hue's own 15–20% tint. Do **not** write `text-<hue>-<shade>` directly in a component; `toneColors.test.ts` scans `src` and fails if a fixed palette shade escapes the module. Each hue pairs a light and a dark value (light per-hue `700`/`800`, dark `*-400`), because **one fixed shade cannot pass 4.5:1 in both themes** — that was the pre-#978 bug class (12 of 14 sampled usages failed AA in light; four guard/siem badges failed, **two of them in *both* themes**).
- **Pick shades by measuring in the browser, never from hex.** Tailwind **v4 ships oklch**, so v3 hex values are wrong: v4 `red-700` is `rgb(193,0,7)`, not `#b91c1c`. Hex math rated the `critical` chip 4.73:1 where the browser measured **4.29:1**. Resolve the built CSS through a canvas and compute the ratio from what actually paints.
- **Solid rails clear 3:1 against both canvases.** Rails are decorative — always redundant with a text label (Badge, KPI value, overall sentence), which WCAG 1.4.11 would exempt — but they are held to the graphic threshold anyway. The rail palette is `bg-orange-600` / `bg-amber-600` / `bg-yellow-700` / `bg-sky-600` / `bg-blue-500` / `bg-red-600` / `bg-violet-500`, measuring **3.07–4.72:1** on the light canvas and **4.01–6.19:1** on the dark one. Do **not** revert amber/orange/yellow/sky to their `-500` shades: those read **1.83–2.77:1** on light. `toneColors.test.ts` guards the four that changed.
- Print does **not** use these tokens: `.invoice-print-accent` hardcodes the green separately, so a theme change never alters the printed sheet.
- Print CSS sets `-webkit-print-color-adjust: exact` **and** `print-color-adjust: exact`. Design must still read if Chrome drops washes: hairline borders carry the structure.
- No `#0a7`, no Palatino, no Stripe purple `#533afd` on our paper.

### 3. Typography

#### Scale (print)

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| Wordmark | 22px / 1.375rem | 700 | 1.0 | 0.08em | SINE**XIS** (Red Hat Mono) |
| Kicker | 11px / 0.6875rem | 600 | 1.3 | 0.14em | `INVOICE` uppercase |
| Number | 16px / 1rem | 600 | 1.2 | 0 | `SX-YYYYMM-NNNN` tabular |
| Party name | 14px / 0.875rem | 600 | 1.4 | 0 | Bill-from / bill-to name |
| Body | 13px / 0.8125rem | 400 | 1.45 | 0 | Cells, payment, amounts |
| Label | 10px / 0.625rem | 600 | 1.3 | 0.10em | FROM / BILL TO / thead |
| Period | 11px / 0.6875rem | 400 | 1.4 | 0 | Line-item subline |
| Grand total | 16px / 1rem | 700 | 1.2 | 0 | Totals last row |
| Footer | 10px / 0.625rem | 400 | 1.5 | 0 | Thanks + legal |

#### Font Stack

- Primary: `"Sora Variable", "Sora", ui-sans-serif, system-ui, sans-serif` (`--font-sans`)
- Mono: `"Red Hat Mono Variable", "Red Hat Mono", ui-monospace, Menlo, monospace` (`--font-mono`) — wordmark + invoice number + IDR
- Serif: none. Palatino is forbidden (blog-island drift).
- **Server-rendered HTML** (FastAPI islands, scan results, executive report, asset pack, invoice) uses the **fallback chain only**: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` / `ui-monospace, "SFMono-Regular", Menlo, monospace`. Do not name the SPA webfonts there — nothing serves the `.woff2` files, and the scan/invoice PDFs are produced by **WeasyPrint**, which resolves system fonts (the image ships `fonts-dejavu-core`) and has no base URL for relative `@font-face`. Webfont-loading these surfaces is a separate slice that needs a static-asset path first.

#### Rules

- Tabular numerals (`font-variant-numeric: tabular-nums`) on every money and date field.
- Body on paper may sit at 13px (print density). In the SPA, reading copy stays ≥14px; 10–12px is reserved for labels, metadata and monospaced identifiers (`text-[10px]`, `text-[11px]`, `text-xs`), never for body text. Weights are limited to 400/500/600/700 — never rely on the browser's `bolder` keyword (see `strong` below).
- `<strong>`/`<b>` must carry an explicit weight class. Tailwind preflight sets `font-weight: bolder`, which resolves to **900** inside a `font-semibold` parent — outside the 400/500/600/700 scale, and outside Sora's 100–800 axis, so it silently clamps. Use `font-bold` (700) under a 600 parent, or `font-medium` (500) under a 400 parent.
- Utility surfaces may exceed the console scale: the Landing `h1` tops out at `lg:text-5xl` (48px) and the 404 numeral at `sm:text-8xl` (96px). Both are deliberate, not scale violations.
- `body` carries `letter-spacing: -0.011em`. That value was tuned for Inter and is **measured fine with Sora**: Sora renders ~5.9% wider than Inter on the probe string, yet the densest action cell still had 25.5px of slack and a 36-route audit found zero horizontal overflow. Do not re-tune it per font swap without a measured defect.
- Status chip is sentence-case i18n, not raw `sent`/`paid` as the only label — raw value may stay in `data-status`.

### 4. Spacing & Layout

#### Base Unit

All spacing derives from **4px**.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Chip pad, period gap |
| --space-2 | 8px | Chip, label→name |
| --space-3 | 12px | Table cell pad, totals row |
| --space-4 | 16px | Payment box pad, footer pad |
| --space-6 | 24px | Table→totals |
| --space-8 | 32px | Header→parties, parties→table, totals→pay |

#### Grid

- Paper: `@page { size: A4; margin: 16mm; }` — matches executive HTML. Do **not** also pad the sheet in print (no double margin).
- Header: flex, brand left, meta right.
- Parties: `grid-template-columns: 1fr 1fr; gap: 32px`.
- Totals: `width: 260px; margin-left: auto`.
- Line item: Description (title + period subline) | Seats | Amount. Qty/rate hours are out — this is a flat SaaS period.

#### Rules

- `tr { break-inside: avoid }`. `thead { display: table-header-group }`.
- Do not set `min-height: 297mm` in `@media print` (blank second page). Screen preview may use it later; print must not.
- Payment block is **not rendered** unless `status === "sent"` (AuthZ + I8/I9). CSS-hiding a bank node on paid is not enough — omit the node.

### 5. Components

#### toneMap (shared rail / wash / text colours)

- **Location**: `frontend/src/lib/toneMap.ts` — `Tone`, `toneRail`, `toneWash`, `toneText`.
- **Rule**: a chrome module may own its `*Tone` union and the *decision* (e.g. `siteTone`), but the colour strings come from `toneRail` / `toneWash` / `toneText`. Do not write `return "bg-destructive"` in a status mapper.
- **Vocabulary**: `primary`, `success`, `enabled`, `completed`, `danger`, `critical`, `failed`, `warn`, `pending`, `alert`, `high`, `info`, `running`, `medium`, `low`, `idle`, `disabled`.
- **Exempt**: category colours that are not status (`assetChrome` sky/violet type chips) and the `GuardPulse` animation classes.
- **Tests**: `src/test/toneMap.test.ts` asserts every mapping and scans the 12 status chrome modules for hard-coded rail literals.

#### EmptyState (shared empty panel)

- **Location**: `frontend/src/components/patterns/EmptyState.tsx`. **This is the only empty-state implementation.** Do not declare a local `EmptyIsland` / `EmptyState` / `EmptyPanel`.
- **Variants**: `island` (default — `rounded-xl border border-border bg-muted/40`), `dashed` (section that will fill in later), `bare` (borderless centered, full-page not-found), `inline` (borderless, for table cells and mobile list rows).
- **Sizes**: `sm` (`min-h-[8rem]`, default), `md` (`min-h-[12rem]` → `16rem` at `md`), `lg` (`min-h-[16rem]`), `none` (no padding or min-height — pair with `variant="inline"`).
- **Props**: `icon`, `title`, `hint`, `action`, `testId`, `titleTone` (`strong` default, `muted` for ops consoles), `titleClassName`, `hintClassName`, `hintTestId`, `className` for outer spacing (`m-4`), `iconClassName` for size overrides.
- **Composition**: when the hint or CTA lives outside the panel (Guard alerts), keep it in the caller — do not add ad-hoc hint slots.
- **Tests**: `src/test/EmptyState.test.tsx`; the frozen testids (`credit-empty`, `workspace-invites-empty`, `workspace-billing-empty`, `guard-agents-empty`, `siem-*`, `host-waf-off`, `ai-feature-off`, …) stay on the caller.

#### StatTile (shared KPI tile)

- **Location**: `frontend/src/components/patterns/StatTile.tsx` — `StatTile`, `StatGrid`, `StatGridSkeleton`. **This is the only KPI tile implementation.** Do not declare a local `KpiTile` / `StatCard` / `AdminKpiTile` in a page or feature folder.
- **Structure**: bordered card → 2px `SiemRail` → 10px uppercase label → mono tabular value → optional extra block.
- **Variants**: `rounded` (`lg` default, `md` for `/credit-history` and `/ai`), `inset` (`tile` `pl-2`, `tight` `pl-1`, `none`), `railClass={null}` (no rail), `icon` (label-row icon, `/scan` and `/admin`), `valueFirst` (`/dashboard` number above label), `extraPlacement` (`below` default, `inline` for the Guard degraded badge), `isLoading` + `skeleton`.
- **Grid**: `StatGrid` owns `grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4`; override columns through `className` (e.g. `lg:grid-cols-3`, `lg:grid-cols-[1fr_1fr_2fr]`). `StatGridSkeleton` owns the loading grid.
- **Do not**: add a one-off tile because a value needs a badge or a progress bar — pass `extra`. Do not hard-code a rail color outside `*Chrome` helpers or `toneColors`.
- **Tests**: `src/test/StatTile.test.tsx` covers rail/pulse/extra/loading/value-first/grid. Strip tests assert the frozen testids (`scan-kpi-*`, `uptime-kpi`, `guard-kpi-strip`, `status-kpi-strip`, `host-overview*`, `assets-kpi-strip`, `siem-indexer-strip`, `dashboard-kpi-strip`, `admin-kpi-*`).

#### InvoicePrintSheet

- **Structure**: `<article class="invoice-print-sheet">` → header (brand + meta) → parties → items `<table>` → totals → optional `.inv-pay` (`data-testid="invoice-print-bank"`) → footer.
- **Variants**: `sent` (bank box + amount due), `paid` (ref + amount paid, **no** bank account), unmounted when `invoice` is null.
- **Spacing**: Section 4. Hairline `--border`; grand-total 2px `--foreground` rule.
- **States**: default (hidden on screen via `.hidden`); print (`body.invoice-printing` + `@media print` visibility isolate). No hover/focus on the sheet itself — it is a document.
- **Accessibility**: `article` with `aria-label` = invoice number; party headings are `<h2 class="inv-label">`; table has `<th scope="col">`; bank fields are a labeled list, not one run-on sentence. Frozen testids stay: `invoice-print-sheet`, `invoice-print-bank`.
- **Motion**: none on the document. Print trigger is `requestAnimationFrame` → `window.print()` (existing hook).
- **Layout**: document stack. Isolation: keep current `visibility: hidden` on `body.invoice-printing *` then visible on `.invoice-print-sheet` — do not `display:none` the AppShell via `body > *` (would fight React roots). Buttons already `.no-print`.

#### Server PDF renderer (`backend/app/services/invoice_html.py`)

The WeasyPrint PDF implements the **same grammar** as `InvoicePrintSheet` above — header flex (wordmark left / meta right), two-column parties, hairline item table, right-aligned totals with the 2px ink rule on the grand row, payment box only when `sent`, footer. It is **localized server-side** via `app.i18n` (the `invoice` namespace, default `id`, same wording as the `workspace` catalog), emitting `lang="{locale}"`. The medium-forced differences are inline `<style>` (a standalone document, not the SPA), **system font fallback chains only** (see Font Stack), and no `.hidden` / `.invoice-printing` isolation; a few fine-grained SPA styles (e.g. chip letter-spacing, 11 vs 12px meta) are not mirrored. Changing the printed grammar means changing this renderer too — the two surfaces must not drift.

#### BrandMark (print)

Do **not** mount the SPA `BrandMark` `<Link>` in print (nav chrome). Recreate the wordmark as `SINE` + accent `XIS` in Red Hat Mono, matching `BRAND.markPrimary` / `markAccent`. Crosshair icon is optional and must not become a second logo.

Bill-from name is `BRAND.name` ("Sinexis"). There is **no** seller address / NPWP env — do not invent one. Bank holder is the account holder, not a street address.

Seats: infer from `sku` locally (`basic` 1 / `pro` 3 / `multi` 10). Not on the invoice JSON.

Tax: implicit 0 (I3). Subtotal equals total. No PPN row.

### 6. Motion & Interaction

#### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 100-150ms | ease-out | SPA Print button (existing Button) |
| Standard | 200-300ms | ease-in-out | unused on paper |
| Emphasis | — | — | none |
| Scroll-driven | — | — | none |

#### Rules

- The print sheet has no animation. `window.print()` is the only “interaction”.
- SPA Print `Button` keeps existing hover/active/focus from the kit. Do not restyle `components/ui`.

### 7. Depth & Surface

#### Strategy

**borders-only** on paper. No `box-shadow`, no cards, no 14px radius widgets.

| Type | Value | Usage |
|------|-------|-------|
| Default | 1px solid `hsl(0 0% 90%)` | Header rule, table rows, payment box, footer |
| Ink rule | 1px solid `hsl(0 0% 7%)` | Table thead underline |
| Grand | 2px solid `hsl(0 0% 7%)` | Totals last row |

Payment box may use `--muted` wash; if print drops backgrounds the 1px border still frames it.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA on the **SPA** Print button (existing kit focus ring).
- Print document: real headings, table headers, contrast ink/paper ≥ 4.5:1 (`hsl(0 0% 7%)` on `#fff`).
- Bank copy only when `status=sent`. Paid must not include `bank_account` text (I8/I9 + frozen tests).
- Language: `workspace` catalog `id`/`en`. Admin page still uses this sheet’s workspace keys.

#### Personas (print)

- **GM / finance clerk** (primary): Save as PDF, file with bank transfer. Needs number, bill-to, amount IDR, bank block when unpaid.
- **Ops / platform admin**: same sheet from `/admin/invoices`; bill-to from `organization_name`.
- **Viewer**: no Print button (unchanged).

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| No seller address / NPWP | InvoicePrintSheet bill-from | Env is `INVOICE_BANK_*` only (I9/I10). Inventing an address would be a lie. | New env+API slice if ops names it |
| `visibility` isolation vs portal | `useInvoicePrint` | Existing S1b hook; portal rewrite is out of a visual redesign | Named slice if print chrome leaks |
| react-scan not wired | SPA entry | Print-only slice; no extra deps | Separate tooling PR |
| Tax / due-date fields | model | `tax_idr` implicit 0; no due column — period_end is the month bound | Invoice v2 if named |

---
