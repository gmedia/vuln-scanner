# Uptime & status
## Status page ops console (`/uptime/status-page`)

Print §§0–8 and SIEM / Guard / Assets / page-nav above stay locked. This section is the **dark SPA** contract for the authenticated editor at `/uptime/status-page` — not public HTML `/status/{slug}`, not print, not the Uptime monitor list.

### 0. Research Log (Status page)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid) and Layer B `linear.app` (ops density, luminance steps, one accent). Same routing as `/guard` / `/siem` / `/assets`. Not Stripe marketing; not Linear indigo; not a public status-page clone of Better Stack's marketing skin.
- Sibling harvest: `GuardKpiStrip` / `SiemIndexerStrip` (`StatTile` + `SiemRail`, `grid-cols-2 gap-3 lg:grid-cols-4`, live `GuardPulse` when healthy), `EmptyState`, `GuardAgentCard` (mobile cards `md:hidden` + desktop table `hidden md:block`, 2px rail before copy), `PageHeader` `h2`. Identity / hostname / components / incidents stay **sibling shells**, not a dashboard of nested Card-in-Card icons.
- Current `/uptime/status-page` diagnosis (post-#868): `StatusHealthHero` is a flat `rounded-lg` card with no rail and no pulse; `StatusKpiRow` is three border tiles without `SiemRail`; stacked kit `Card`s for identity / DNS / components / incidents; empty components/incidents are ad-hoc muted boxes, not `EmptyState`; incident mobile cards and desktop rows have wash but no leading rail. Correct-but-flat.
- Lazyweb screens viewed (6): Better Stack (overall banner + component rows), Google Apps Status (traffic-light overall), Splunk status (incident ops table), UptimeRobot (KPI counts + public URL), GetFernand (copyable DNS), mobile-alerts (stacked cards, 44px taps). Grammar taken: **overall health is the first read**; copyable DNS as secret-rail records; incidents table desktop / cards mobile; empty islands. Not pixel copies; not a second public-page skin.
- Imagen drafts: skipped — existing SPA + Guard/SIEM grammar is the reference; no extra imagegen deps.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice. Lazyweb `update.sh` failed (`set: Illegal option -o pipefail`); screens already on disk under `/tmp/lazyweb-refs/status-page/`.

**Direction (locked):** A night-shift **public-health command center** on existing Sinexis SPA tokens. Signature: a health hero whose **2px overall rail** (and pulse when operational + published) is the first thing the eye hits, then a 4-tile KPI strip, then DNS copy records with a primary rail (this page's "once-secret"), then a component board and incident ops list. One document scroll. Green `--primary`, not Linear indigo. Sora + mono paths. Not a public status marketing page, not nested Card-in-Card.

### 1. Atmosphere & Identity

`/uptime/status-page` is the workspace editor for the public status page (spec `docs/specs/status-page-v1.md`): slug/title, publish, custom hostname + TXT, Uptime components, hand-posted incidents. It must feel like the Guard/SIEM/Assets ops family inside AppShell: denser than settings, quieter than SIEM search. **No** page-nav tabs (single scroll). **No** Credit History filter bar.

The one memorable moment: when the page is published and overall is operational, the hero rail goes primary and a live pulse sits next to "All systems operational". When overall is major, the rail goes destructive **before** the operator opens Incidents. DNS pending is a primary-rail copy strip, not a nested muted soup.

Do **not** use Lucide `Shield` (Guard cliché) or a filled green masthead. Empty create uses `Radio` (broadcast). Empty components uses `Activity`. Empty incidents uses `Radio`. Loading is skeleton KPI tiles, not a spinner in a Card.

Public `/status/{slug}` is **out of scope** — do not restyle the FastAPI HTML island here.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo `#5e6ad2`. No Better Stack purple wash.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Hero, KPI tiles, identity / host / board / incidents shells, mobile cards |
| Ink | `--foreground` | Titles, KPI values, incident titles |
| Meta | `--muted-foreground` | KPI labels, timestamps, public path, hints |
| Accent | `--primary` `hsl(142 71% 45%)` | Operational rail/pulse, published KPI, empty CTA, TXT secret rail, resolved incident rail |
| Degraded | `bg-amber-600` rail + `TONE_TEXT.amber` | Overall degraded, pending TXT, investigating incident, component degraded |
| Partial | `bg-orange-600` rail + `TONE_TEXT.orange` | Overall partial, identified incident |
| Major / down | `bg-destructive` rail + `text-destructive` | Overall major, hostname failed, component down, critical impact |
| Monitoring | `bg-sky-600` rail | Incident status `monitoring` |
| Idle | `bg-border` rail | Unpublished, hostname none, unknown |
| Open wash | `bg-amber-500/[0.04]` | Unresolved incident card/row (redundant with rail) |
| Down wash | `bg-destructive/[0.04]` | Component row when `down` |
| TXT secret | `bg-primary/5` + primary rail | Pending TXT copy strip (Guard once-secret grammar) |

Rails are **redundant** with Badge / strong text. Never color-only status.

### 3. Typography

SPA scale (not print 13px). Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

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

### 4. Spacing & Layout

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

### 5. Components

#### StatusHealthHero

- **Structure**: `relative overflow-hidden rounded-lg border border-border bg-card pl-4`. `SiemRail` from `overallRailClass`. Kicker `overallLabel` + overall sentence (`overallValueClass`) + truncated page title. Visibility `Badge` (`completed` / `info`).
- **Pulse**: `GuardPulse` when `published && overall === "operational"`.
- **Wash**: `bg-primary/5` overlay when operational + published; `bg-destructive/5` when published + major. Pointer-events none, `aria-hidden`.
- **States**: unpublished → muted value + `bg-border` rail, no pulse. Unknown overall → `overallUnknown`, border rail.

#### StatusKpiRow

- **Structure**: 4 tiles — visibility / components (up · down) / DNS status / public path. Each tile: `SiemRail` + uppercase label + value. Wrapper `data-testid="status-kpi-strip"`. Grid `grid-cols-2 gap-3 lg:grid-cols-4`.
- **Rails**: published `bg-primary` else `bg-border`; components `bg-destructive` when `downCount > 0` else `bg-primary` when any up else `bg-border`; DNS via `hostnameRailClass`; public path `bg-border`.
- **Pulse**: visibility tile when published (same job as Guard state pulse).
- **Values**: visibility uses i18n `visibilityOn` / `visibilityOff` (not raw `true`). Public path `font-mono text-sm truncate`.

#### StatusCopyRecord / TXT strip

- Copy row: `relative overflow-hidden … pl-4` + primary `SiemRail`. Frozen testids `status-copy-cname` / `status-copy-txt-name` / `status-copy-txt-value`. 44px copy hit target (`h-11 w-11`). Check icon `text-primary-text` when copied.
- Pending TXT wrapper: `bg-primary/5` + primary rail (Guard once-secret). Visible "TXT validation", "Waiting for TXT" (via hostname badge, not raw `pending_txt`), CNAME line `{{host}} → {{target}}`, `noAaaa`. Frozen `status-page-host`.

#### StatusComponentBoard

- Empty: `EmptyState` icon `Activity`, title `noComponents`.
- Rows: `relative`, first cell `pl-4` + `componentRailClass` (`up` primary / `down` destructive / `degraded` amber / else border). Down wash `bg-destructive/[0.04]`. Remove icon-only, `aria-label` i18n `remove`, frozen `status-component-remove-{id}`, visible text must **not** match `/Remove/`.

#### StatusIncidentList / Card

- Mobile list frozen classes + `status-incident-card-{id}`. Card: `relative overflow-hidden … pl-4` + `incidentRailClass`. Unresolved wash kept. `status-incident-post-update-{id}` on open incidents. Title input is **not** on the card (sheet only).
- Desktop: frozen classes + `<table>` + `status-incident-row-{id}`. First cell `relative pl-4` + rail (Guard agent row grammar). Unresolved row wash kept.
- Empty: `EmptyState` icon `Radio`, title `noIncidents`.
- Sheet: frozen `status-incident-sheet` with `right-0`; create testids unchanged.

#### Empty create / loading

- No page: island (`rounded-xl border border-border bg-muted/40`) + `Radio` + copy in `status-page-empty` + slug/title `Label`+`Input` `h-10` + `status-page-create`. Not a blank Card.
- Loading: full-page `data-testid="status-page-loading"` mirroring the loaded order — hero placeholder (`h-28` bordered) → `StatusKpiSkeleton` (`data-testid="status-kpi-skeleton"`, 4 tiles `h-[4.5rem] rounded-lg`) → four `OpsShell railClass="bg-border"` placeholders: identity (3-col input skeletons `h-10`), host (2-col + help line), components (`TableRowSkeleton rows={3} columns={3}`), incidents (`rows={4} columns={5}`). Loaded shell testids are **not** reused in loading; `status-page-empty` is not rendered while loading. Not a spinner.

### 6. Motion & Interaction

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

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`, no filled green masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| Hero / KPI / shells / cards | `border border-border bg-card rounded-lg` | Surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | Overall, KPI, DNS copy, component, incident |
| TXT secret | `bg-primary/5` + primary rail | Pending hostname |
| Empty island | `rounded-xl border border-border bg-muted/40` (`EmptyState`) | No page / no components / no incidents |
| Open incident | `bg-amber-500/[0.04]` + amber/orange/sky rail | Unresolved |

P15 flatten: KPI strip is **not** inside a status Card. Hero is a sibling of the KPI strip, not a CardHeader icon row.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / overall sentence / hostname label.
- Every form field has `Label` + `htmlFor` (slug, title, host, display name, incident fields).
- Copy / remove / incident menu keep i18n `aria-label`s. Remove is icon-only.
- Heading remains PageHeader `h2` i18n `title` (Playwright / unit).
- `prefers-reduced-motion` kills ping.
- Kit only: no native `<select>`; primary actions are `Button`.
- Frozen testids in `frontend/src/test/StatusPage.test.tsx` must survive (including mobile `space-y-2 md:hidden` and desktop `hidden overflow-x-auto md:block`).

#### Personas

- **Owner / member who can manage** (primary): create page → set slug/title → publish → attach hostname / copy TXT → map monitors → post incidents.
- **Member without manage**: view + post updates; no incident delete (`canManageMembers` gate).
- **Empty workspace**: create island, no fake components.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| Duplicate mobile + desktop incident markup | StatusIncidentList | Frozen testids on both card and row | Named a11y slice |
| `SiemRail` / `GuardPulse` imported into status, `EmptyState` from `components/patterns/` | chrome | One rail/pulse primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| Public `/status/{slug}` HTML not restyled | FastAPI island | Authenticated SPA only; public must rhyme Landing | Named public-status slice |
| `StatusPage.tsx` already >250 LOC | page | Extracting identity/host would mix a visual slice with a module split | Named extract |
| Lazyweb pack `generate_report` not filed | research log | `update.sh` pipefail; screens on disk are the harvest | Ignore |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## Uptime ops console (`/uptime` + `/uptime/:id`)

Print §§0–8 and SIEM / Guard / Assets / Status / page-nav above stay locked. This section is the **dark SPA** contract for the authenticated monitor fleet (`/uptime`) and probe inspector (`/uptime/:id`) — not public `/status/{slug}`, not print, not the status-page editor.

### 0. Research Log (Uptime)

- Embedded refs: shortlisted `linear.app` / `stripe` / `sentry` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as `/guard` / `/siem` / `/assets` / `/uptime/status-page`. Not Stripe marketing; not Linear indigo `#5e6ad2`; not a Better Stack / UptimeRobot marketing clone.
- Sibling harvest: `GuardKpiStrip` / `AssetKpiStrip` / `StatusKpiRow` (`StatTile` + `SiemRail`, `grid-cols-2 gap-3`, live `GuardPulse` when healthy), `StatusHealthHero` (2px overall rail + wash + pulse), `EmptyState`, `GuardAgentCard` / `SiemEventMobileCard` (mobile cards `md:hidden` + desktop table `hidden md:block`, 2px rail in first cell), `PageHeader` `h2`. Fleet KPI and detail hero must be **sibling shells**, not nested Card-in-Card icon rows.
- Current `/uptime` diagnosis: `UptimeKpiRow` is three generic `rounded-md` border tiles (no rail, no pulse); `UptimeMonitorList` mobile cards and desktop `table-fixed` rows wash down-state but have no leading rail; empty filter/list is an ad-hoc muted box, not `EmptyState`; sparkline 96×28 already exists. Correct-but-flat Card stack.
- Current `/uptime/:id` diagnosis: hero is a flat `rounded-lg` card with a muted protocol circle (generic icon-in-circle trap); `uptime-detail-kpi` is three border tiles without `SiemRail`; availability bar already has `segmentClass` / `buildBarSegments` (keep); outage rows and history cards have wash but no rail. `UptimeDetail.tsx` ~775 pure LOC — extract chrome, do not grow the page.
- Competitive grammar (Better Stack / Pingdom / UptimeRobot / Sentry, sibling P15): **fleet health is the first read** (up/down counts + pulse); probe target is a mono record under a state rail; availability is a **timeline bar**, not a sparkline-as-hero; outages are an ops list. Not pixel copies; not a second public-page skin.
- Imagen drafts: skipped — existing SPA + Guard/SIEM/Status grammar is the reference; no extra imagegen deps.
- Lazyweb pack: `/tmp/lazyweb-refs` empty this session; sibling P15 + competitive grammar above is the harvest. `update.sh` / `generate_report` not filed.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** A night-shift **probe command center** on existing Sinexis SPA tokens. Signature: fleet KPI whose **2px up-rail + live pulse** is the first thing the eye hits, then a monitor table/cards whose state rail reads before the name, then a detail hero whose rail/wash/pulse matches `StatusHealthHero`, then a 3-tile range KPI strip, then the existing availability timeline. One document scroll. Green `--primary`, not Linear indigo. Sora + mono paths. Not a marketing status page, not nested Card-in-Card.

### 1. Atmosphere & Identity

`/uptime` is the workspace fleet for outside-in HTTP/TCP/heartbeat/DNS/ping (spec `docs/specs/uptime-v1.md`): SKU-capped seats, filters, add/edit sheet, pause/delete. `/uptime/:id` is the probe inspector: range (6h / 24h / 7d + custom dates), range KPI, availability bar, outages, sample history. Both must feel like the Guard/SIEM/Assets/Status ops family inside AppShell: denser than settings, quieter than SIEM search. **No** page-nav tabs on the list. Detail range stays **pill** `TabsList` (`data-testid="uptime-range-tabs"`) — do **not** convert to `variant="line"`.

The one memorable moment: when any monitor is `up`, the Up KPI rail goes primary and a live pulse sits next to the count. On detail, when the probe is enabled and `up`, the hero rail goes primary and the pulse sits next to the state word. When a probe is `down`, the rail goes destructive **before** the operator opens History. Sparkline stays a 96×28 latency spark in the desktop Spark column — not the hero.

Do **not** use Lucide `Shield` (Guard cliché) or a filled green masthead. Protocol uses existing `ProtocolGlyph` (Globe / Network / HeartPulse / Radio / Activity). Empty fleet uses `Activity`. Filter-empty uses `Activity`. Outages-empty / history-empty use `EmptyState`. Loading is skeleton KPI tiles + a filter-bar placeholder (`data-testid="uptime-filters-loading"`, 3 input-shaped `h-10` in `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3`, same order as loaded) + `TableRowSkeleton rows={5} columns={7}` for the list, not a spinner in a Card. `/uptime/:id` loading mirrors the whole page: header + hero + range-filter `OpsShell` + 3 KPI + timeline `OpsShell` + outages `OpsShell` + history card (`rows={5} columns={4}`).

Public `/status/{slug}` and `/uptime/status-page` are **out of scope**.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo `#5e6ad2`. No Better Stack purple wash.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Hero, KPI tiles, list shell, range card, outages, history |
| Ink | `--foreground` | Titles, KPI values, monitor names |
| Meta | `--muted-foreground` | KPI labels, timestamps, target, hints |
| Accent / up | `--primary` `hsl(142 71% 45%)` | Up rail/pulse/spark, range-% emphasize, empty CTA, availability `up` segment |
| Degraded | `bg-amber-600` rail + `TONE_TEXT.amber` | Degraded state, SKU near-cap |
| Down | `bg-destructive` rail + `text-destructive` | Down KPI, down row, availability `down` segment, last error |
| Idle / unknown / paused | `bg-border` rail | Unknown, paused (`enabled=false`), empty spark |
| Down wash | `bg-destructive/[0.04]` | Down card/row, failed history row (redundant with rail) |
| Up wash | `bg-primary/5` | Detail hero when `up` (Status operational grammar) |
| SKU cap | `text-destructive` + destructive progress | Seats at limit |
| SKU warn | `TONE_TEXT.amber` + amber progress | Seats ≥ 80% |

Rails are **redundant** with Badge / strong text / sparkline stroke. Never color-only status.

### 3. Typography

SPA scale (not print 13px). Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

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

### 4. Spacing & Layout

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

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `UptimeKpiRow` (`uptime-kpi`) | `StatTile` + `SiemRail` + optional `GuardPulse` on Up; SKU tile + `Progress` (`uptime-sku-quota`) | Up rail primary + pulse when `upCount > 0`; Down rail destructive when `downCount > 0` else muted; SKU rail primary / amber / destructive by quota |
| `UptimeHealthHero` | `StatusHealthHero` grammar: `relative overflow-hidden rounded-lg border bg-card pl-4` + `SiemRail` + wash + `ProtocolGlyph` + target + meta cluster + pulse when enabled+up | up / down / degraded / unknown / paused (`enabled=false` → idle rail, no pulse) |
| `UptimeDetailKpiStrip` (`uptime-detail-kpi`) | 3 `StatTile` + `SiemRail`; retention note `col-span-3` (`uptime-samples-retention-note`) | Range % primary rail; OK/Samples border rail; blanked `—` when beyond 7-day sample retention |
| Monitor card (mobile) | `relative rounded-lg border bg-card p-3 pl-4` + `SiemRail` + Badge + glyph + 24h/latency + `MonitorActionsMenu` | down wash; **no** `uptime-row` |
| Monitor row (desktop) | `table-fixed` + `h-12` + first cell `relative pl-4` + `SiemRail` + sparkline + actions | `uptime-row`; hover `bg-muted/50`; down wash |
| `Sparkline` (`uptime-sparkline`) | 96×28 SVG area+stroke; empty `"—"` | stroke primary / destructive / muted; height ≥ 28 (frozen) |
| Availability bar (`uptime-availability-bar`) | `h-8` flex segments, `segmentClass` | up primary, down destructive, else muted |
| Outage row (`uptime-outage-row`) | `relative rounded-md border p-3 pl-4` + destructive rail | ongoing vs duration; pager `uptime-outage-pagination` |
| History (`uptime-history-panel`) | Card + mobile cards / desktop table; fail wash + rail | loading `TableRowSkeleton rows={5} columns={4}`; empty → `EmptyState` |
| Empty fleet (`uptime-empty`) | Card island + `Activity` + `uptime-empty-cta` | keep testids; CTA `Button` |
| Filter empty | `EmptyState` | `filterEmpty` copy |
| Add/edit | existing right `Sheet` (`uptime-sheet` `right-0`) | do not invent a modal |

Default / hover / focus / disabled / loading / error / empty / current: kit Button / Tabs / DatePicker / Badge. Hover that changes nothing is slop — rows, links, buttons only. Unknown enabled monitors keep the existing 4s list poll.

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Row hover `bg-muted/50`, link underline |
| Pulse | CSS `animate-ping` | — | Up KPI when `upCount > 0`; detail hero when enabled + `up` |
| Press | kit Button `scale` | — | Do not restyle kit |
| Emphasis | — | — | none |

- GPU only: `opacity` on ping. No layout animation.
- `motion-reduce:animate-none` on `GuardPulse` (already in the primitive).
- Sparkline is static SVG — do not animate the path.

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`, no filled green masthead, no generic icon-in-circle as the hero focal object (`ProtocolGlyph` sits in the type row, not a 40px muted disc).

| Type | Treatment | Use |
|------|-----------|-----|
| Hero / KPI / shells / cards | `border border-border bg-card rounded-lg` | Surfaces (list KPI tiles `rounded-lg` to match Guard; filters accordion stays `rounded-md` — frozen) |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | KPI, hero, monitor card/row, outage, failed history |
| Empty island | `rounded-xl border border-border bg-muted/40` (`EmptyState`) | Filter empty, outages empty, history empty |
| Down wash | `bg-destructive/[0.04]` + destructive rail | Down monitor, failed sample |
| Up wash | `bg-primary/5` | Detail hero when `up` |

P15 flatten: fleet KPI strip is **not** inside a monitors Card. Detail hero is a sibling of the range card and KPI strip, not a CardHeader icon row.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / KPI value / sparkline stroke / availability segment.
- Every form field has `Label` + `htmlFor` (sheet + outage from/to). SKU progress keeps `aria-label`.
- Actions menu keeps i18n `aria-label` (`actionsMenu`). Pause is a labeled `Button`.
- Heading remains PageHeader `h2` (list i18n `title`; detail = monitor name).
- `prefers-reduced-motion` kills ping.
- Kit only: no native `<select>`; primary actions are `Button`.
- Frozen testids in `frontend/src/test/Uptime.test.tsx`, `UptimeDetail.test.tsx`, and `frontend/e2e/uptime.spec.ts` must survive: `uptime-page`, `uptime-add`, `uptime-kpi` (`grid-cols-2`), `uptime-filters` / `uptime-filters-toggle` (`rounded-md` + `border-border` + `last:border-b`, not `last:border-b-0`), `uptime-row` (desktop only), `uptime-sparkline` (empty `"—"`, height ≥ 28), `uptime-actions` / `uptime-edit` / `uptime-delete`, `uptime-sheet` (`right-0`), `uptime-name` / `uptime-target` / `uptime-save` / `uptime-advanced` / `uptime-timeout` / `uptime-expect-status`, `uptime-empty` / `uptime-empty-cta`, `uptime-detail`, `uptime-detail-pause`, `uptime-history-panel`, `uptime-range-6h` / `24h` / `7d`, `uptime-range-tabs` (pill), `uptime-detail-kpi`, `uptime-outage-pagination` / `uptime-outage-row`, `uptime-sample-pagination`. Frozen copy: header `"Spark"`, `"24h %"` not `/^24h$/`. Ranges stay `6h` / `24h` / `7d`. `SAMPLE_PAGE_SIZE=20`. `OUTAGE_PAGE_SIZE=5`.

#### Personas

- **Owner / member who can manage** (primary): add monitor (until SKU cap) → scan fleet KPI → filter → open detail → pause / edit / delete.
- **Member viewer**: read fleet + detail; mutations still gated by existing API.
- **Empty workspace**: empty island + Add CTA, no fake rows.
- **On-call at 2am**: down rail + last-error hint must be readable without opening the sheet.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| Duplicate mobile + desktop monitor / history markup | UptimeMonitorList / UptimeHistoryPanel | Frozen `uptime-row` is desktop-only; history has mobile+desktop testids | Named a11y slice |
| `SiemRail` / `GuardPulse` imported into uptime, `EmptyState` from `components/patterns/` | chrome | One rail/pulse primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| `UptimeDetail.tsx` still large after hero/KPI extract | page | Range/outage/sample logic is the page; further split would mix visual slice with a module split | Named extract |
| Filters accordion stays `rounded-md` while KPI tiles go `rounded-lg` | UptimeFiltersSection | Frozen class match on `rounded-md` + `last:border-b` | Keep |
| Lazyweb pack `generate_report` not filed | research log | `/tmp/lazyweb-refs` empty this session; sibling P15 is the harvest | Ignore |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |
| 768 fleet table scrolls horizontally | `UptimeMonitorList` | Frozen `table-fixed` + 7 cols + Spark 96×28 cannot fit AppShell inset (~512px) without crush; Guard `min-w` + `overflow-x-auto` is the sibling pattern. Do **not** wrap headers or drop Spark at md | Keep; 375 stays cards |

## Ops shell residue (`/uptime/:id`, `/uptime/status-page`)

Print §§0–8 and every SPA section above stay locked. This section closes the last five rail-less shells in the ops family by introducing the first **shared** ops shell. It is a residue pass, not a redesign: the head/body content of each shell is unchanged apart from being wrapped.

### 0. Research Log (Ops residue)

- Reused the family grammar. No new reference pull.
- Sibling harvest: every existing shell (`AdminShell`, `ScanShell`, `ScheduleShell`, `ProfileShell`, `WorkspaceShell`, `AuthCard`) is the same shape — kit `Card` + `relative overflow-hidden pl-4` + `SiemRail` + optional wash, a hairline head, and a body. That is **six copies** of one primitive.
- Current diagnosis: `/uptime/:id` had 3 `Card`s and `/uptime/status-page` had 4, with only 2 rails between them (the outage row and the TXT card). The range-filter, timeline, outages, identity, custom-host, components, and incidents shells were all flat. The prior sections' accepted-debt tables had each deferred this with "extracting `components/ops/` is a third-family risk" — at the seventh duplicate that trade-off inverted.
- Imagen / Lazyweb: skipped — family grammar is the reference; AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** Extract **one** `components/ops/OpsShell.tsx` (`OpsShell` / `OpsShellHead` / `OpsShellBody`) and use it for the five remaining shells. No new palette, no new rail vocabulary — the rails come from the tone helpers already in `statusChrome` / `uptimeChrome`.

### 1. Atmosphere & Identity

Both pages are already documented ops surfaces (see the Uptime and Status page sections above); this section only records the residue deltas. The pages keep their existing heroes, KPI strips, and lists.

### 2. Color

No new tokens. Rails:

| Surface | Rail | Source |
|---------|------|--------|
| Uptime range filters | `bg-sky-600` | range/period is informational |
| Uptime timeline | `bg-primary` | neutral content |
| Uptime outages | `bg-destructive` when any outage, else `bg-border` | `outagesRailClass(count)` |
| Status page identity | `bg-primary` | neutral content |
| Status page custom host | per `hostnameRailClass(status)` (primary / destructive / amber / muted) | `statusChrome` |
| Status page components | `bg-primary` | neutral content |
| Status page incidents | per `incidentsListRailClass(statuses)` (amber investigating / orange identified / sky monitoring / primary resolved-only / muted empty) | `statusChrome` |

### 3. Typography

Unchanged. Shell titles are the shared `h3` at `text-sm font-medium tracking-wide`.

### 4. Spacing & Layout

The shared head uses `border-b border-border px-4 py-3`; the shared body uses `px-4 py-4` (or `p-0` via `flush`). This is the same geometry as every other shell in the family, so the five converted shells now align with `/host`, `/dashboard`, `/scan/:id`, `/schedules`, `/profile`, `/settings/workspace`, and `/admin/*`.

`OpsShellBody` takes `flush` instead of a padding override so `p-0` cannot lose a Tailwind specificity race against the base `px-4 py-4`.

**Frozen contracts**: all existing testids on both pages (`uptime-range-filters`, `uptime-range-tabs`, `uptime-range-{6h,24h,7d}`, `uptime-outage-filters` / `-from` / `-to` / `-clear` / `-range-error`, `uptime-outages`, `uptime-outage-row`, `uptime-outage-pagination`, `status-page`, `status-page-publish`, `status-page-empty`, `status-page-create`, `status-page-title`, `status-page-slug`, `status-page-save-slug`, `status-page-host`, `status-incident-add`, `status-copy-*`), the `status-page-slug` / `status-page-title` / `attach` flows, and the mobile/desktop container classes on the incident and history lists.

### 5. Signature Components & States

| Primitive | Anatomy |
|-----------|---------|
| `OpsShell` (`components/ops/OpsShell.tsx`) | kit `Card` + `relative overflow-hidden pl-4` + `SiemRail(railClass)` + optional `wash` |
| `OpsShellHead` | `border-b border-border px-4 py-3`; default layout = icon chip + `h3` + hint + aside; `children` override for custom heads (e.g. the range Tabs) |
| `OpsShellBody` | `px-4 py-4`, or `p-0` when `flush` |

New tone helpers: `incidentsListRailClass(statuses)` (`statusChrome.ts`) and `outagesRailClass(count)` (`uptimeChrome.ts`).

`OpsShell` also frames loading placeholders on `/siem` (`siem-loading`), `/host` (`host-sites-loading`), the StatusPage editor (`status-page-loading`), and `/uptime/:id` with `railClass="bg-border"`. Their page-level loading layouts and `/scan/:id` mirror the loaded sections rather than collapsing into a bare `Card`: StatusPage keeps hero → KPI → identity/host/components/incidents; UptimeDetail keeps header → hero → range → KPI → timeline/outages/history; ScanDetail keeps tabs → findings + severity/scan-info. The shared `TableRowSkeleton({rows, columns})` defaults `columns` to 4 and renders `Math.max(1, columns)` bars per row (first `flex-1`, then `w-16`, `hidden sm:block w-24`, `hidden md:block w-12`, and `hidden lg:block w-16` for further bars). Table-backed loading surfaces pass the loaded column count.

`EmptyState` (`components/patterns/EmptyState.tsx`) is the **only** empty/flag-off panel in the SPA (uptime, host, guard, status, siem, `/ai`, admin, dashboard, assets, inbox, credit history). Variants: `island` (default), `dashed`, `bare`, `inline`; sizes `none` / `sm` / `md` / `lg`. The old siem empty-island module is retired — do not re-add it. `/ai` uses it for `ai-feature-off` (Bot), no-org (Building2), and load-fail (TriangleAlert) — replacing the kit `Alert` those states used before. `Alert` stays for inline notices (e.g. `AiKeysPanel`), not for page-level empty states.

### 6. Motion

Unchanged from the family.

### 7. Depth & Surface

Borders-only + 2px rails. No nested Card-in-Card.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- Unchanged. Headings stay PageHeader `h2`; shell titles are `h3`.
- The range-filter head keeps its `Tabs` as `children` so the tablist contract is untouched.

#### Personas

- **Uptime operator**: range/timeline/outages rails distinguish a clean window from one with outages before reading rows.
- **Status page owner**: the host rail mirrors DNS state and the incidents rail mirrors the worst open incident.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `OpsShell` is a **second** shared shell alongside the six per-surface shells | `components/ops/` | This slice only needs the two uptime/status pages; migrating the six existing shells is a separate, test-heavy refactor | Named migration PR |
| `StatusPage` / `UptimeDetail` keep queries + mutations in the page | pages | This slice restyles chrome only | Named extract |
| Prior sections' accepted-debt rows still say "extracting `components/ops/` is a third-family risk" | earlier sections | Those notes were accurate for their scope; this section is the first to invert that trade-off. Left as-is so the decision history stays readable | Update when the migration lands |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |
