# Assets
## Assets SPA (`/assets`)

Print §§0–8 and Guard SPA above stay locked. This section is the **dark SPA** contract for the asset registry — not paper, not Guard enroll.

### 0. Research Log (Assets)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid) and Layer B `linear.app` (ops density, luminance steps, one accent). Same routing as `/guard` / `/siem`. Not Stripe marketing; not print invoice; not a CMDB / AWS inventory clone.
- Sibling harvest: `GuardKpiStrip` (`StatTile` + `SiemRail`, `grid-cols-2 gap-3 lg:grid-cols-4`), `EmptyState`, `GuardAgentCard` / `GuardAgentsPanel` (mobile cards `md:hidden` + desktop table `hidden md:block`, 2px type rail before copy), `PageHeader`, kit `Progress` (`indicatorClassName`), `TableRowSkeleton`. Credit History filter bar is **already** the Assets filter contract (`AssetFilters` h-10 / gap-2) — do not restyle it into a 12-col Apply gutter.
- Current `/assets` diagnosis: SKU quota buried in PageHeader as a thin `h-1.5` bar; empty/loading are generic Cards; type is muted text with no rail; mobile cards are nested `bg-card` chips without a leading rail; desktop table is a flat spreadsheet; quota-at-cap has no urgency color.
- Imagen drafts: skipped — existing SPA + Guard/SIEM grammar is the reference; no extra imagegen deps.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.
- Lazyweb pack `generate_report`: skipped (deprecated path; in-repo Guard/SIEM harvest is the contract).

**Direction (locked):** A night-shift **registry** console on existing Sinexis SPA tokens. Signature: a 4-tile KPI strip that **owns** SKU quota (count/limit + urgency bar) plus domain/IP type counts, then a single list shell whose rows/cards carry a 2px **type rail** (sky domain / violet IP) before the name. Empty is a muted island with Globe, not a blank Card. Sora + mono targets. Not a CMDB graph, not nested Card-in-Card, not Guard hosts.

### 1. Atmosphere & Identity

`/assets` is P3 scan-side registry (spec `docs/specs/assets-v1.md`): named IP and domain **targets** for schedules and pack export — **not** Guard hosts. It must feel like the Guard/SIEM/Uptime ops family inside AppShell: denser than settings, quieter than SIEM search, with a filter bar (Assets *does* filter; Guard does not).

The one memorable moment: quota approaching the SKU cap, the eye hits an amber then destructive rail and bar **before** the Add button disables. Type is encoded in the rail, not a spreadsheet “Type” column as the only cue.

Do **not** use Lucide `Shield` (Guard/EDR cliché) or `Server` as a datacenter hero. Empty island uses `Globe` (named targets). Loading is skeleton rows, not a spinner in a Card.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo. No AWS orange masthead.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | KPI tiles, list shell, mobile cards |
| Ink | `--foreground` | Asset name, KPI values |
| Meta | `--muted-foreground` | Target, type label, KPI labels |
| Accent | `--primary` `hsl(142 71% 45%)` | Add, empty CTA, quota OK rail/bar |
| Domain | `bg-sky-600` rail + sky type chip | Domain assets, Domains KPI tile |
| IP | `bg-violet-500` rail + violet type chip | IP assets, IPs KPI tile |
| Quota warn | `bg-amber-600` rail + amber `Progress` indicator | ≥80% and <100% of SKU cap |
| Quota cap | `bg-destructive` rail + destructive indicator | `count >= limit` |
| Scheduled | `bg-primary` rail when count > 0, else `bg-border` | Scheduled KPI tile |
| Guard linked | kit `Badge variant="info"` | Existing chip — do not recolor |

Type **chips** may use sky/violet washes (`bg-sky-500/15` + `TONE_CHIP_TEXT.sky`, violet equivalent). Tag colors stay `tagColorClass` / `tagColorStyle` — appearance only.

### 3. Typography

SPA scale (not print 13px). Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

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

### 4. Spacing & Layout

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

### 5. Components

#### AssetKpiStrip

- **Structure**: 4 tiles — quota / scheduled / domains / IPs. Each tile: `SiemRail` + uppercase label + value. Quota tile mounts kit `Progress` (`h-1.5`) with `indicatorClassName` from quota tone. Wrapper `data-testid="assets-kpi-strip"`.
- **Frozen copy**: quota tile **must** render i18n `skuLabel` (`Plan {{sku}} — {{count}} / {{limit}} assets` / ID equivalent) so existing unit tests keep matching.
- **States**: loading = `AssetKpiSkeleton` (4 tiles, no bar). Empty registry = strip still mounts (0 / limit, all zeros). At cap = destructive rail + bar; Add stays disabled.
- **A11y**: text status (`skuLabel`, counts), not color alone. `aria-hidden` on rails.

#### Asset list shell

- **Structure**: one `Card` (or equivalent) `data-testid="assets-list"` with `[data-slot="card-title"]` text = i18n `tableTitle` (`Assets`) — frozen. Filters live in the header strip (`border-b`). Not a Card nested in a Card.
- **Loading**: `data-testid="assets-loading"` + `[data-slot="card-title"]` `Assets` (frozen) + a filter-row placeholder (`data-testid="assets-filters-loading"`, input-shaped `h-10`) matching `AssetFilters` + body `TableRowSkeleton rows={5} columns={7}` (loaded desktop table is 7 cols).
- **Empty**: island `data-testid="assets-empty"` — `Globe` + `empty` + `emptyHint` + primary `Button` `assets-empty-cta` (`bg-primary`, `min-h-11`). Grammar: `rounded-xl border border-border bg-muted/40`, generous `min-h-[12rem] md:min-h-[16rem]`. Not a Shield hero, not `rounded-3xl`.
- **No match**: `data-testid="assets-no-match"` + `assets-clear-filters` unchanged.

#### Asset card / row

- **Rail**: `SiemRail` — domain `bg-sky-600`, IP `bg-violet-500`, unknown `bg-border`. Card: `relative overflow-hidden … pl-4`. Row: rail in the name cell (`relative pl-4`), same as `GuardAgentsPanel`.
- **Type chip**: sky/violet wash next to the name (card) / in the type column (table) — redundant with the rail.
- **Frozen testids**: `asset-menu-{id}`, `asset-edit-{id}`, `asset-schedule-{id}`, `asset-delete-{id}`, `assets-watch-http`, `asset-tag-{tag}` / `asset-tag-card-{tag}`, `asset-guard-chip-{id}` / `-card`. Kebab still owns edit / schedule / watch HTTP / delete.
- **Target**: mono tabular, `break-all` on cards.

#### AssetFormSheet

- Right `Sheet`. Fields keep `asset-name` / `asset-type` / `asset-target` / `asset-tags` / `asset-save`. Type + target disabled when editing. Kit `Label` + `Input` / `Select` only.

#### AssetFilters

- **Do not restyle** for this slice. Frozen testids (`assets-filters`, `asset-search`, `asset-type-filter`, tag popover / colors). Segmented type control already encodes domain/IP/all.

### 6. Motion & Interaction

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

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested `Card` inside `Card`, no `rounded-3xl`.

| Type | Treatment | Use |
|------|-----------|-----|
| KPI tiles | `border border-border bg-card rounded-lg` + `SiemRail` | Quota / scheduled / type counts |
| List shell | `border border-border bg-card rounded-lg` | Filters + table / cards |
| Mobile card | same + leading rail | `<md` list |
| Empty / no-match | `rounded-xl border bg-muted/40` | Islands |
| Quota bar | kit `Progress` track `bg-muted`, indicator tone | Inside quota tile |

P15 flatten: KPI strip is **not** inside PageHeader and **not** inside the list Card. Header is title + subtitle + actions only.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA on SPA tokens. Rails are redundant with type chip + `skuLabel` / counts.
- Every form field has `Label` + `htmlFor`.
- Kebab keeps `aria-label` `actionsMenu`. Type filter is `role="group"` with `aria-label`.
- Heading remains `h2` via PageHeader.
- Never print customer targets into tracked markdown.

#### Personas

- **Owner / admin / member** (primary): add named IP/domain → tag → schedule → pack export; feel the SKU cap before it hard-blocks.
- **Viewer**: list + filter only (no add / delete — AuthZ is API; UI still shows actions the API will reject).
- **Ops at cap**: destructive quota tile; Add + empty CTA disabled; `limitReached` toast on create.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Duplicate mobile + desktop asset markup | Asset list | Frozen testids on both card and row; `useIsMobile` would drop one tree | Named a11y slice |
| `SiemRail` imported into Assets | chrome | One rail primitive; railed surfaces share `components/patterns/RailedShell.tsx`, so this is a single import, not a third family | Keep import |
| `AssetFilters.tsx` over 250 LOC | filters | Pre-existing; this slice does not restyle filters | Named filter split |
| Lazyweb pack `generate_report` not filed | research log | Deprecated MCP path; sibling Guard/SIEM harvest is the contract | Ignore |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

---
