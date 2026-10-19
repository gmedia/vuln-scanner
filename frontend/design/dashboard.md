# Dashboard
## Dashboard ops console (`/dashboard`)

Print §§0–8 and SIEM / Guard / Assets / page-nav / Status / Uptime above stay locked. This section is the **dark SPA** contract for the post-login overview at `/dashboard` — not the public landing, not a scan detail.

### 0. Research Log (Dashboard)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as `/guard` / `/siem` / `/assets` / `/uptime` / `/host`. Not Stripe marketing; not Linear indigo `#5e6ad2`; not a marketing hero.
- Sibling harvest: `GuardKpiStrip` / `UptimeKpiRow` / `AssetKpiStrip` (`StatTile` + `SiemRail` + `GuardPulse`), `EmptyState` grammar, `UptimeMonitorList` / `GuardAgentCard` (2px rail before copy), `PageHeader` `h2`, page-nav line tabs (unused here).
- Current `/dashboard` diagnosis: `StatCard` was three flat `rounded-md` border tiles tinted by a border colour with no rail and no pulse; the attention block was a generic destructive `Alert`; recent rows were flat `bg-card` cards / plain table rows with no rail; empty and all-lab states were ad-hoc muted boxes; the two sidebar sections were plain Cards with a `CardHeader` icon row.
- Imagen drafts: skipped — existing SPA + sibling P15 grammar is the reference; no extra imagegen deps.
- Lazyweb pack: skipped this session — sibling P15 is the harvest.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** A post-login **ops overview** on existing Sinexis SPA tokens. Signature: a 3-tile KPI strip whose **Open risk rail goes destructive + pulse** the moment risk exists, then a destructive-railed attention shell, then a recent-work shell whose **card and each row carry a severity rail** (failed / critical / high / running / completed), then two railed sidebar shells. Green `--primary`, not Linear indigo. Sora + Red Hat Mono targets. Not nested Card-in-Card, not a marketing hero.

### 1. Atmosphere & Identity

`/dashboard` is the first screen after login: open risk, 7-day severity window, schedule coverage, recent work, attach coverage, Guard fleet. It must feel like the Guard/SIEM/Assets/Uptime ops family inside AppShell: the fastest read in the product, denser than settings.

The one memorable moment: the **Open risk** tile. When risk is zero the rail is primary and the value is quiet; when risk exists the rail and value go destructive and a live pulse sits next to the label. The same rail grammar repeats on the attention shell and every recent row, so the eye scans status before copy.

Do **not** use a filled green masthead, a marketing hero, or a generic icon-in-circle. Loading is skeleton tiles + skeleton rows (recent-work `TableRowSkeleton rows={6} columns={5}`), not a spinner in a Card.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | KPI tiles, attention shell, recent-work shell, sidebar shells |
| Ink | `--foreground` | Target, KPI values, section titles |
| Meta | `--muted-foreground` | Type, date, KPI labels, hints |
| Accent | `--primary` `hsl(142 71% 45%)` | Add / New scan, completed rail, open-risk-clear rail, attach/guard OK rail |
| Critical / failed | `bg-destructive` rail + destructive wash `bg-destructive/[0.04]` | Open risk, failed scan, critical findings, attention shell, stale Guard |
| High | `bg-orange-600` rail | 7-day high count, completed scan with high findings |
| Medium | `bg-amber-600` rail | 7-day medium count, queued scan |
| Running | `bg-sky-600` rail | Running scan |
| Idle | `bg-border` rail | No risk, no schedules, no agents, no rows |

Rails are **redundant** with the Badge / KPI value / attention copy. Never color-only status.

### 3. Typography

SPA scale. Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` "Overview" (frozen) |
| Subtitle | `text-sm` | 400 | `assetsWithActiveSchedules` / `oneOffScansNoAttach` |
| KPI value | `font-mono text-xl font-bold tabular-nums sm:text-2xl` | 700 | Open risk / C/H/M / schedules |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Below the value |
| Section title | `text-sm font-medium tracking-wide` | 500 | Recent work / Attach coverage / Guard |
| Row target | `font-mono text-xs` | 400 | Scan target |
| Row meta | `text-[11px]` | 400 | Type · date |
| Table head | `text-[10px] uppercase tracking-wider` | 500 | Frozen columns |

Tabular numerals on every count and date. Body copy stays the i18n `scan` catalog (EN+ID).

### 4. Spacing & Layout

4px base. **No** filter bar on `/dashboard`.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, chip gap |
| --space-2 | 8px | Row inner, sidebar row |
| --space-3 | 12px | Tile gap, tile pad, row pad |
| --space-4 | 16px | Shell pad, `lg:gap-4` |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`): header → attention → KPI → grid.
- **page-grid** — KPI tiles `grid-cols-2 gap-3 lg:grid-cols-3`; Open risk `col-span-2 lg:col-span-1`.
- **list-detail** — **not** used. Recent work is a table/cards; sidebar is sibling shells.
- **scroll-body-shell** — AppShell owns document scroll.

Responsive:

- `<md`: recent rows are cards (`space-y-2 md:hidden`) with a leading rail; KPI 2-col.
- `≥md`: recent rows are a `table-fixed` table (`hidden md:block`) with the rail in the first cell.

**Frozen structure** (`Dashboard.test.tsx`): the recent-work shell keeps `flex … flex-col`, its content keeps `pb-[max(2rem,env(safe-area-inset-bottom))]`, and the outer grid keeps `items-start` + `lg:grid-cols-12`. Do **not** insert a `flex-col` ancestor between the "Recent work" title and the shell, and do **not** move the `pb-[max…]` class off the content wrapper.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `DashboardKpiStrip` (`dashboard-kpi-strip`) | 3 `StatTile` + `SiemRail`; Open risk mounts `GuardPulse` | risk zero → primary rail, quiet value; risk > 0 → destructive rail + pulse + `TONE_TEXT.red`; week rail destructive / orange / amber / muted; schedules rail primary / destructive at cap |
| `StatTile` | `relative overflow-hidden rounded-lg border bg-card pl-4` + `SiemRail` + value **before** label | loading → two `Skeleton`s |
| Attention shell (`attention-strip`) | `relative overflow-hidden rounded-lg border border-destructive/40 bg-destructive/[0.04] pl-4` + destructive rail + `TriangleAlert` + links | hidden when nothing to attend |
| Recent-work shell | `relative flex … flex-col overflow-hidden rounded-lg border bg-card pl-4` + `SiemRail(worstScanTone)` + hairline header + rows | worst-tone rail; empty → island `Radar` + `No scans yet` + CTA; all-lab → island copy |
| Recent row | mobile card `relative … pl-4 min-h-11` + rail; desktop first cell `relative pl-4` + rail | failed / critical / high / running / pending / completed / idle |
| Attach coverage shell | railed shell + hairline title + schedule rows + Manage CTA | rail primary when enabled > 0, destructive at `MAX_ENABLED_SCHEDULES`, muted when none |
| Guard shell | railed shell + hairline title + agent count + Open Guard CTA | rail primary when agents > 0 and none stale, destructive when stale, muted when none |

`DashboardKpiStrip` renders `StatTile` with `valueFirst` — the **value before the label** (frozen: `getByText("Open risk").previousElementSibling` is the value element, which keeps `TONE_TEXT.red` / `text-foreground`). Every other strip is label-first. Do **not** drop `valueFirst` without updating that frozen test.

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Row hover, link hover |
| Pulse | CSS `animate-ping` | — | Open risk tile when risk > 0 |
| Press | kit Button `scale` | — | Do not restyle kit |

- GPU only: `opacity` on ping. No layout animation.
- `motion-reduce:animate-none` on `GuardPulse` (already in the primitive).

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`, no filled green masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| KPI tiles / shells | `border border-border bg-card rounded-lg` + `SiemRail` | All surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | KPI, attention, recent shell + rows, sidebar shells |
| Empty islands | `rounded-xl border border-border bg-muted/40` | No scans / all-lab |
| Critical wash | `bg-destructive/[0.04]` + destructive rail | Attention shell, failed/critical recent row |

P15 flatten: the KPI strip is **not** inside PageHeader and **not** inside the recent-work shell. Header is title + subtitle + actions only.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / KPI value / attention copy.
- Heading remains PageHeader `h2` "Overview" (frozen). Section titles are `h3`.
- `prefers-reduced-motion` kills the Open-risk ping.
- Kit only: no native `<select>`; primary actions are `Button`.
- Frozen testids in `frontend/src/test/Dashboard.test.tsx` must survive: `attention-strip`, `new-scan-cta`, `primary-jadwal-cta`, `viewer-scan-readonly`, `empty-schedules-link`, plus the value-before-label KPI contract and the recent-work structure classes in §4.

#### Personas

- **Owner / member who can scan** (primary): read open risk → scan / set schedule → open recent work → manage schedules / Guard.
- **Viewer**: read-only; `viewer-scan-readonly` replaces the actions.
- **Empty workspace**: island + scan CTA + schedule link, no fake rows.
- **On-call**: destructive rail + attention links must be readable without opening a scan.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `DashboardKpiStrip` uses `StatTile valueFirst` while every other strip is label-first | Dashboard | Frozen `previousElementSibling` + `TONE_TEXT.red` contract in `Dashboard.test.tsx` | Named test refactor if the contract changes |
| Duplicate mobile + desktop recent-row markup | Dashboard | Frozen both-surface rendering; `useIsMobile` would drop one tree | Named a11y slice |
| `SiemRail` / `GuardPulse` imported into dashboard | chrome | One rail/pulse primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| Dashboard keeps local `severityCount` / `latestPerTarget` helpers | page | Pre-existing; this slice restyles chrome only | Named extract |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |
