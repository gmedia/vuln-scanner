# Scan
## Scan detail console (`/scan/:id`)

Print §§0–8, SIEM / Guard / Assets / page-nav / Status / Uptime / Host / Dashboard above stay locked. This section is the **dark SPA** contract for the scan result at `/scan/:id` — the product's core output. Page-nav line tabs for this page stay governed by the page-nav section above; this section adds the KPI strip, result shells, and row rails around them.

### 0. Research Log (Scan detail)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as `/guard` / `/siem` / `/assets` / `/uptime` / `/host` / `/dashboard`. Not Stripe marketing; not Linear indigo `#5e6ad2`.
- Sibling harvest: `GuardKpiStrip` / `UptimeDetailKpiStrip` / `HostKpiStrip` (`StatTile` + `SiemRail` + `GuardPulse`), `EmptyState` island grammar, `HostHitsList` (rail inside the first cell, mobile card + desktop row), `lib/siemSeverity.ts` canonical severity rail palette (critical destructive / high orange-500 / medium yellow-500 / low blue-500), page-nav `TabsList variant="line"`.
- Current `/scan/:id` diagnosis (post-#877): page-nav line tabs already shipped, but the four `QuickStat` tiles were flat Cards tinted by a border colour with no rail; the findings / severity / scan-info / export panels were plain `Card`s with no rail; findings rows and mobile cards were flat; the diff hint was a bare `p` and the export-empty / diff-pending states were unstyled paragraphs.
- Imagen drafts: skipped — existing SPA + sibling P15 grammar is the reference; no extra imagegen deps.
- Lazyweb pack: skipped this session — sibling P15 is the harvest.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** A **result readout** on existing Sinexis SPA tokens. Signature: a 4-tile KPI strip whose **findings rail encodes worst severity** and whose **duration rail encodes status with a live pulse while running**, then result shells whose rail repeats that severity/status signal, then finding rows whose first cell carries the same severity rail. Green `--primary`, not Linear indigo. Sora + Red Hat Mono. Not nested Card-in-Card, not a filled masthead.

### 1. Atmosphere & Identity

`/scan/:id` is where every scan lands: severity, target, type, duration, findings, diff, export. It must feel like the Guard/SIEM/Assets/Uptime/Host/Dashboard ops family inside AppShell — the densest read in the product.

The one memorable moment: the **findings KPI rail**. It encodes the worst severity present (`critical` → destructive, `high` → orange, `medium` → yellow, `low` → blue), and the **duration** tile carries a live pulse while the scan runs. The same rail grammar repeats on the findings shell, the severity shell, the diff strip, and every finding row — so the eye reads severity before copy.

Do **not** use a filled green masthead, a generic icon-in-circle hero, or a marketing hero. Loading is skeleton tiles + skeleton rows (findings `TableRowSkeleton rows={6} columns={7}`) **and** mirrors the page-nav tabs bar (`h-9 w-72`) and the right-hand column (severity-chart card + scan-info card) on the same `2xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,0.9fr)]` grid, not a spinner in a Card.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | KPI tiles, findings / severity / scan-info / export / diff shells |
| Ink | `--foreground` | Target, KPI values, shell titles |
| Meta | `--muted-foreground` | Type, duration, KPI labels, hints |
| Accent | `--primary` `hsl(142 71% 45%)` | Re-scan CTA, completed status rail, remediation rail, management export rail |
| Critical | `bg-destructive` rail + destructive wash `bg-destructive/[0.04]` | Critical findings, failed scan, new-critical diff, not-found chip |
| High | `bg-orange-600` rail | High findings, new-high / worsened diff |
| Medium | `bg-yellow-700` rail | Medium findings, pending scan |
| Low | `bg-blue-500` rail | Low findings |
| Running | `bg-sky-600` rail | Running scan |
| Idle | `bg-border` rail | Info severity, target / type tiles, scan info, technical / raw export, no baseline |

Rails are **redundant** with the Badge / KPI value / shell title. Never color-only status. Severity rail colours match `lib/siemSeverity.ts`.

### 3. Typography

SPA scale. Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` "Scan details" + status Badge |
| Subtitle | `text-sm` | 400 | Target (mono) + finished-at |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Findings / Target / Type / Duration |
| KPI value | `font-mono text-lg font-bold tabular-nums sm:text-2xl` | 700 | Count, target, type, duration |
| Shell title | `text-sm font-medium tracking-wide` | 500 | Findings / Severity / Scan info / export group titles |
| Row title | `text-xs` | 400–500 | Finding display title |
| Mono record | `font-mono text-[11px]` / `text-xs` | 400 | Findings range, scan ID, task ID, CVSS |
| Tab label | `text-sm font-medium` | 500 | Findings / Diff / Export (EN roles frozen) |

Tabular numerals on every count and ID. Body copy stays the i18n `scan` catalog (EN+ID).

### 4. Spacing & Layout

4px base. **No** filter bar at page level (findings search lives inside the findings shell).

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, chip gap |
| --space-2 | 8px | KPI tile gap (`gap-2 sm:gap-3`) |
| --space-3 | 12px | Shell pad |
| --space-4 | 16px | `TabsContent` `mt-4`, shell head pad |
| --space-5 | 20px | `space-y-5` page stack, findings grid gap |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-5`): header → error → KPI → tabs → panel.
- **page-grid** — KPI tiles `grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4`; findings panel `2xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,0.9fr)]`.
- **scroll-body-shell** — AppShell owns document scroll. Tab list `w-full justify-start`.
- **list-detail** — **not** used. Findings rows expand inline under the clicked row (frozen).

Responsive:

- `<md`: KPI 2-col; findings render as mobile cards (`md:hidden`) with a severity rail; desktop table is `hidden md:block`.
- `≥md`: findings table with a severity rail inside the first cell.
- Export shells: `grid gap-3 md:grid-cols-3`.

**Frozen DOM contract** (`ScanDetail.test.tsx` / `FindingsTable.test.tsx`): the target appears **exactly twice** (PageHeader description + one KPI tile) — do not add a third. The tablist keeps `data-variant="line"` + `w-full`. The findings table renders **before** the severity chart. Finding rows keep **7 cells** with the title in `td:nth-child(2)` and the detail row `colspan="7"` — the rail goes **inside** the first cell, never as a new cell. The mobile findings container stays the first `.md:hidden`.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `ScanKpiStrip` (`scan-kpi-strip`) | 4 `StatTile` + `SiemRail` + icon + `GuardPulse` on duration | findings rail = worst severity (or failed/running); duration rail = status, pulse while running; target / type neutral |
| `StatTile` (`components/patterns/StatTile.tsx`) | `relative min-w-0 overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4` + `SiemRail` + 10px uppercase label + mono tabular value | variants: `rounded`, `inset`, `railClass={null}`, `icon`, `valueFirst`, `extraPlacement`, `isLoading`; `truncate` value with `title` |
| Findings shell | `Shell` (`relative overflow-hidden rounded-lg border bg-card pl-4`) + `SiemRail(findingsRailClass)` + wash + `ShellHead` hairline + `FindingsTable` + pagination | rail by worst severity / failed / running; wash only when critical |
| Severity shell | `Shell` + `SiemRail(severityRailClass(worst))` + `ShellHead` + `SeverityChart` | worst severity, border when none |
| Scan info shell | `Shell` + `SiemRail("bg-border")` + `ShellHead` + `InfoRow`s | static |
| Finding row | mobile card `relative … pl-4` + rail; desktop first cell `relative py-2.5 pl-4 pr-3` + rail | critical / high / medium / low / info |
| Diff strip (`scan-diff-badge`) | `Shell` + `SiemRail(diffRailClass)` + badges | new critical destructive / new high+worsened orange / resolved primary / else border |
| Diff no-baseline (`scan-diff-no-baseline`) | dashed shell + muted rail | static |
| Export shells | `Shell` + `ShellHead` (icon chip + title + hint) + buttons | management `bg-primary`; technical / raw `bg-border` |
| Remediation shell | `Shell` + primary rail + progress | primary |
| Not-found | centered chip + heading + back CTA | destructive chip |

`ScanError` (kit `Alert`) is unchanged. Empty / no-export / diff-pending use the `rounded-xl border border-border bg-muted/40` island grammar.

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150–200ms | ease-out | Row hover `bg-muted/30`, sort header hover |
| Pulse | CSS `animate-ping` | — | Duration tile while running |
| Progress | 500ms | ease-out | Remediation bar (kit `Progress`) |
| Press | kit Button `scale` | — | Do not restyle kit |

- GPU only: `opacity` on ping. No layout animation.
- `motion-reduce:animate-none` on `GuardPulse` (already in the primitive).

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`, no filled green masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| KPI tiles / shells | `border border-border bg-card rounded-lg` + `SiemRail` | All surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | KPI, findings, severity, scan info, export, diff, rows, remediation |
| Empty islands | `rounded-xl border border-border bg-muted/40` | No export / diff pending |
| Critical wash | `bg-destructive/[0.04]` + destructive rail | Critical findings shell / row |

P15 flatten: the KPI strip is **not** inside PageHeader and **not** inside the findings shell. Header is title + subtitle + actions only.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / KPI value / shell title.
- Heading remains PageHeader `h2` "Scan details"; shell titles are `h3`.
- `prefers-reduced-motion` kills the duration ping.
- Kit only: no native `<select>`; primary actions are `Button`.
- Frozen testids: `attach-schedule-button`, `rescan-button`, `findings-range`, `findings-pagination`, `export-executive` / `export-pdf` / `export-html` / `export-print-executive` / `export-print-html`, `scan-diff-no-baseline` / `scan-diff-badge`, `severity-chart`, `findings-table`, plus the DOM contract in §4 and `FindingsTable`'s `td:nth-child(2)` / `colspan="7"` / `.md:hidden` / `.h-1.5.w-12` contracts.

#### Personas

- **Owner / member** (primary): read severity → filter / search findings → expand a finding → diff → export.
- **On-call**: worst-severity rail + failed status must be readable without opening a finding.
- **Manager**: export shell leads with the executive download (primary rail).
- **Running scan**: duration tile pulses; findings table shows the honest incomplete empty state.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `ScanDetail.tsx` still holds findings / diff / export tab bodies + local `Shell` / `InfoRow` | page | This slice restyles chrome only; splitting tabs into panels mixes visual with module work | Named extract |
| `FindingsTable` owns filter + sort + expand + rails | results | Rail is one span inside the existing first cell; extracting a row component would fork the frozen table contract | Named refactor |
| Duplicate mobile + desktop finding markup | FindingsTable | Frozen testids on both card and row; `useIsMobile` would drop one tree | Named a11y slice |
| `SiemRail` / `GuardPulse` imported into scan + results | chrome | One rail/pulse primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| Severity rail palette duplicated from `lib/siemSeverity.ts` | scanChrome | That helper is keyed by numeric level, not severity name; a name-keyed export is a follow-up | Named lib extract |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## Scan schedule console (`/schedules`)

Print §§0–8 and SIEM / Guard / Assets / page-nav / Status / Uptime / Host / Dashboard / Scan detail above stay locked. This section is the **dark SPA** contract for the attach surface at `/schedules` — the recurring-scan quota, the create form, and the schedule list. It completes the scan→attach flow (`/dashboard` → `/scan/:id` → `/schedules`).

### 0. Research Log (Schedules)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as `/guard` / `/siem` / `/assets` / `/uptime` / `/host` / `/dashboard` / `/scan/:id`. Not Stripe marketing; not Linear indigo `#5e6ad2`.
- Sibling harvest: `HostKpiStrip` quota rail (primary → amber → destructive before the cap blocks), `GuardKpiStrip` / `ScanKpiStrip` (`StatTile` + `SiemRail`), `HostSiteCard` / `HostHitsList` (rail inside the first cell, mobile card + desktop row), `EmptyState` island grammar, `ScheduleRowActions` (pre-existing mobile-first action grid).
- Current `/schedules` diagnosis: the quota was a plain `Card` with a muted `h-1.5` `Progress` and no rail (the cap only surfaced as a separate amber `Alert`); the create form was a flat `Card` with `space-y-2` fields and unlabeled `Select`s; the list was a flat `Card` whose rows had no rail and only a muted `disabled` badge.
- Imagen drafts: skipped — existing SPA + sibling P15 grammar is the reference; no extra imagegen deps.
- Lazyweb pack: skipped this session — sibling P15 is the harvest.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** An **attach console** on existing Sinexis SPA tokens. Signature: a quota shell whose **rail steps primary → amber → destructive** as enabled schedules approach and hit the cap (the `Progress` indicator matches), then a primary-railed create shell with labeled fields, then a list shell whose **rail is the worst row tone** and whose every row carries the same rail (errored destructive / active primary / disabled muted). Green `--primary`, not Linear indigo. Sora + Red Hat Mono. Not nested Card-in-Card, not a filled masthead.

### 1. Atmosphere & Identity

`/schedules` is the attach surface: recurring domain/IP scans are included in the SKU, and the cap is the pressure point. It must feel like the Guard/SIEM/Assets/Uptime/Host/Dashboard/ScanDetail ops family inside AppShell — the same rail grammar, the same hairline shells.

The one memorable moment: the **quota shell**. The rail and progress bar turn amber near the cap and destructive at it, *before* the create button disables — so the operator sees the constraint before the blocked action.

Do **not** use a filled green masthead, a marketing hero, or a generic icon-in-circle. Loading is skeleton rows (`TableRowSkeleton rows={4} columns={3}` for the list; run-history stays `rows={2}`), not a spinner in a Card.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Quota / create / list shells, mobile schedule rows |
| Ink | `--foreground` | Target, quota count, shell titles |
| Meta | `--muted-foreground` | Cadence, next-run, notify, hints |
| Accent | `--primary` `hsl(142 71% 45%)` | Create CTA, quota rail under cap, active row rail, active badge |
| Quota warn | `bg-amber-600` rail + amber `Progress` | ≥ 80% and < 100% of the cap |
| Critical / error | `bg-destructive` rail + destructive wash `bg-destructive/[0.04]` | Cap reached, row with `last_error`, form error |
| Disabled | `bg-border` rail + `default` badge | Disabled schedule, empty list, no rows |

Rails are **redundant** with the count text / badge / `Alert`. Never color-only status.

### 3. Typography

SPA scale. Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` "Scan schedule" (frozen) |
| Quota count | `font-mono text-lg font-bold tabular-nums sm:text-2xl` | 700 | `{enabled}/{max}` |
| Shell title | `text-sm font-medium tracking-wide` | 500 | Quota / New schedule / Your schedules |
| Shell hint | `text-xs` | 400 | `newHint` |
| Row title | `text-sm font-medium` | 500 | Label or target |
| Row meta | `text-xs` / `text-[11px]` | 400 | Type · cadence, next-run, notify |
| Field label | `text-sm` (kit `Label`) | 500 | All form fields |
| Table head | `text-[10px] uppercase tracking-wider` | 500 | Schedule / Next / Actions |

Tabular numerals on the quota count and run times. Body copy stays the i18n `schedules` catalog (EN+ID).

### 4. Spacing & Layout

4px base. **No** filter bar.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, badge gap |
| --space-2 | 8px | Row inner, mobile action grid gap |
| --space-3 | 12px | Shell pad, quota inner |
| --space-4 | 16px | Shell head pad, form field gap |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`): header → quota → create → list.
- **page-grid** — form fields `grid gap-4 sm:grid-cols-2`; notify email `sm:col-span-2`. Each field `flex min-w-0 flex-col gap-1.5`.
- **scroll-body-shell** — AppShell owns document scroll.
- **list-detail** — **not** used. Run history expands inline under the row.

Responsive:

- `<sm`: schedules render as stacked cards (`sm:hidden`, `schedules-mobile-list`) with a rail; actions use the pre-existing 2-col mobile grid.
- `≥sm`: schedules render as a table (`hidden sm:block`) with the rail inside the first cell; actions are a right-aligned icon row.

**Frozen contracts** (`Schedules.test.tsx`): exact texts `"Scan schedule"`, `"New schedule"`, `/Active schedule quota/`, `"0/10"` / `"10/10"`, `/Scheduled attach is included\. Credits are for on-demand, overage, and mobile only\./`, `/Limit 10 active schedules per organization/`, `/Delete schedule for example.com/`; `getByLabelText("Target")`; button names `/Create schedule/i`, `/Scan history/i`, `/Download executive report/i`, `"Delete schedule"`, `"Delete"`, `"Cancel"`, `/Enable/i`; link `/open scan/i`; testids `schedule-create-card`, `schedule-print-executive`, `schedules-mobile-list`, `viewer-schedule-readonly`; `.min-w-[40rem]` absent; and exactly **one** `role="alert"` in the toggle-error scenario.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| Quota shell (`schedule-quota`) | `ScheduleShell` + `SiemRail(quotaRailClass)` + hairline head (Gauge + title + big mono count) + `Progress` + cap `Alert` | primary (< 80%) / amber (≥ 80%) / destructive (at cap); indicator matches rail |
| Create shell (`schedule-create-card`) | `ScheduleShell` primary rail + hairline head (Plus chip + title + hint) + form | primary; submit disabled at cap / pending |
| Schedule list shell (`schedule-list`) | `ScheduleShell` + `SiemRail(listTone)` + wash + hairline head + list | destructive when any row errored / primary when any active / muted when empty |
| Schedule row (mobile card) | `relative overflow-hidden rounded-lg border bg-card p-3 pl-4` + rail + active/disabled badge | errored destructive / active primary / disabled muted |
| Schedule row (desktop) | first cell `relative align-top pl-4` + rail + active/disabled badge | same tones |
| Run history | `border-l` list of runs + status Badge + open-scan link | loading skeleton / error Alert / empty copy |
| Viewer readonly | `rounded-md border border-border bg-muted/40` note | `viewer-schedule-readonly` |
| Empty list | island `rounded-xl border border-border bg-muted/40` + `CalendarClock` | `empty` copy |

`ScheduleRowActions` is unchanged (mobile-first grid → icon row) so the frozen aria-labels and `schedule-print-executive` survive.

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150–200ms | ease-out | Row hover, badge transition |
| Progress | 500ms | ease-out | Quota bar fill (kit `Progress`) |
| Press | kit Button `scale` | — | Do not restyle kit |

- GPU only. No layout animation, no pulse on this page.
- Hover that changes nothing is slop — rows and buttons only.

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`, no filled green masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| Quota / create / list shells | `border border-border bg-card rounded-lg` + `SiemRail` | All surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | Quota, create, list, rows |
| Empty / viewer note | `rounded-xl` / `rounded-md` + `bg-muted/40` | Empty list, viewer note |
| Error wash | `bg-destructive/[0.04]` + destructive rail | Errored row, list shell when any row errored |

P15 flatten: the quota shell is **not** inside the create shell and **not** inside the list shell. Header is title only.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with the count / badge / `Alert`.
- Heading remains PageHeader `h2` "Scan schedule"; shell titles are `h3`.
- Every field has a `Label` + `htmlFor` (inputs and Selects alike); controls are `h-10 min-h-10`.
- Kit only: no native `<select>`; primary actions are `Button`.
- Exactly one `role="alert"` in the toggle-error scenario (row error `Alert` and cap `Alert` are mutually exclusive there).

#### Personas

- **Owner / member who can scan** (primary): read quota → create a weekly/monthly schedule → toggle / delete → expand run history.
- **At cap**: rail + progress destructive, cap `Alert` visible, submit disabled with a title.
- **Viewer**: readonly note replaces the create shell; rows keep read-only actions.
- **Errored schedule**: destructive rail + wash + mapped `last_error` `Alert`.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `Schedules.tsx` still holds form + mutations + list + runs panel | page | This slice restyles chrome only; splitting into panels mixes visual with module work | Named extract |
| `ScheduleRowActions` keeps the mobile-first grid → icon-row switch | page | Frozen aria-labels + `schedule-print-executive`; restructuring would risk them | Named refactor |
| Duplicate mobile card + desktop table row markup | page | Frozen `schedules-mobile-list` and table both render; `useIsMobile` would drop one tree | Named a11y slice |
| `SiemRail` imported into schedules | chrome | One rail primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| `export { mapScheduleError }` on the page | page | Pre-existing re-export kept for tests; `react-refresh` warning is known | Named move to `api/schedules` |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

---

## Scanner forms (`/scan/ip`, `/scan/domain`, `/scan/mobile`)

Print §§0–8 and every SPA section above stay locked. This section is the **dark SPA** contract for the three scan-launch pages. They share one layout, one shell, and one results panel, so this is a single contract with three small deltas.

### 0. Research Log (Scanner)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as the ops consoles. Not Stripe marketing; not Linear indigo `#5e6ad2`.
- Sibling harvest: `ScanKpiStrip` + `scanChrome` severity palette (critical destructive / high orange / medium yellow / low blue / info muted) already built for `/scan/:id`; `HostKpiStrip` rail tiles; `EmptyState` island grammar; `PageHeader` `h2`.
- Current diagnosis: all three pages were four flat `Card` + `CardHeader` sections (Scan target / Scan progress / Results / coverage) with no rail; the **Results severity grid was five tinted `bg-*-600/10` pills with no rail** — exactly the pre-P15 `StatCard` pattern; the results summary bar was a flat `bg-muted` row; the three results blocks were byte-identical copies.
- Imagen / Lazyweb: skipped — sibling P15 grammar is the reference; AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** Same ops console as the family, reusing the **severity rail vocabulary** already shipped on `/scan/:id`. Signature: a primary-railed **Scan target** shell, a sky-railed **Scan progress** shell while running, and a **Results** shell whose rail is the worst severity (destructive / orange / yellow / blue / primary when clean) and whose five severity tiles each carry their own rail. The three identical results blocks collapse into one `ScanResultsPanel`.

### 1. Atmosphere & Identity

These are the launch points: pick a target, watch progress, read the result. They must feel like the same product as `/scan/:id` — which they now do, because they reuse its severity rails.

The one memorable moment: the **Results rail**. A scan with criticals reads destructive, highs orange, mediums yellow, lows blue, and a clean scan primary — before any number is read.

Do **not** use a filled green masthead, a marketing hero, or tinted `bg-*-600/10` pills without a rail. No loading skeleton is needed on this page (the form and progress components own their own states).

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark` and the `scanChrome` severity palette. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Scan target / progress / results / coverage shells, severity tiles |
| Ink | `--foreground` | Shell titles, counts, finding totals |
| Meta | `--muted-foreground` | Coverage list, severity labels |
| Accent | `--primary` `hsl(142 71% 45%)` | Scan-target rail, clean results rail, clean summary rail, coverage rail |
| Running | `bg-sky-600` rail | Scan progress shell |
| Critical / high | `bg-destructive` rail + `bg-destructive/[0.04]` wash | Critical tile, summary rail when crit/high, results shell |
| High | `bg-orange-600` rail | High tile, results shell when worst is high |
| Medium | `bg-yellow-700` rail | Medium tile, results shell when worst is medium |
| Low | `bg-blue-500` rail | Low tile, results shell when worst is low |
| Idle | `bg-border` rail | Info tile, coverage shell |

Rails are **redundant** with the count and the `AlertTriangle` / `CheckCircle2` icon. Never color-only status.

### 3. Typography

Unchanged from the family. Page title is the PageHeader `h2` (`IP scanner` / `Domain scanner` / `Mobile scanner`); shell titles are `h3` at `text-sm font-medium tracking-wide`; severity counts are `font-mono text-lg font-bold tabular-nums`; severity labels are `text-[10px] uppercase tracking-wider`.

### 4. Spacing & Layout

4px base. **No** filter bar.

- Page grid: `grid w-full items-start gap-6 lg:grid-cols-2`; left column `space-y-6`; coverage shell sits in the right column only when `!isScanning && !hasResults`.
- Severity grid: `grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3` (was a hard `grid-cols-5` that crushed on mobile).
- Shell pad: `px-4 py-3` head, `px-4 py-4` body.

**Frozen contracts** (`src/test/{Ip,Domain,Mobile}Scanner.test.tsx` + `e2e/{ip,domain,mobile}-scanner*.spec.ts`): `h2` copy `IP scanner` / `Domain scanner` / `Mobile scanner`; shell titles `Scan target` / `Upload binary` / `Scan progress` / `What this scan covers` / `Results`; form testids `ip-scan-form` / `domain-scan-form` / `mobile-upload`; `scan-progress`; `scan-coverage`; `COMPLETED` badge; **each severity count renders exactly once** (`getByText("1")`…`getByText("5")` are exact matches); `15 findings found` / `1 finding found`; `.lucide-triangle-alert` and `.lucide-circle-check`; `View Details`; e2e form placeholders + submit button names + `a[href='/dashboard']` (AppShell sidebar) are untouched.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `ScanShell` (`components/scan/ScanShell.tsx`) | kit `Card` + `relative overflow-hidden pl-4` + `SiemRail(railClass)` | caller-supplied rail |
| `ScanShellHead` | `border-b border-border px-4 py-3` + optional icon chip + `h3` + optional aside | static |
| `ScanShellBody` | `px-4 py-4`, optional `testid` | static |
| `ScanResultsPanel` (`scan-results`) | `ScanShell` + severity rail + wash + head (`Results` + `COMPLETED` badge) + 5 railed severity tiles + railed summary row | rail by worst severity; summary rail destructive when crit/high else primary |

Tone sources: Scan target → primary; Scan progress → sky; coverage → border; Results → `scannerResultRailClass(summary)`.

### 6. Motion

Unchanged from the family (micro hover only). `ScanProgress` owns its own animation.

### 7. Depth & Surface

Borders-only + 2px rails. No nested Card-in-Card, no tinted pill backgrounds without a rail, no filled masthead.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with counts and status icons.
- PageHeader `h2` is the only level-2 heading; shell titles are `h3`.
- Coverage is a real `<ul>`; severity tiles are text, not color-only.
- The "View Details" button gets a 44pt mobile target (`min-h-11 sm:min-h-9`).
- These three pages are **English-only** (frozen by unit test) — do not i18n them without updating the tests.

#### Personas

- **Any user who can scan** (primary): pick target → run → read severity → open details.
- **Mobile user**: severity grid wraps 2-up instead of crushing 5-up.
- **On-call**: the Results rail reads destructive/orange before the numbers.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Three scanner pages remain near-identical | pages | Extracting a `ScannerPage` layout is a module refactor, not a visual slice | Named refactor |
| Scanner copy stays English (hardcoded) | 3 pages | Frozen by unit tests; i18n-ising needs matching test updates | Named i18n slice |
| Scanner tests still mock `@/components/ui/Card` | test | Harmless: `ScanShell` composes the real `Card` through the mock | Named test cleanup |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |
