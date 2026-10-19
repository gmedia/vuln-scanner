# Host
## Host Protect console (`/host`)

Print §§0–8 and SIEM / Guard / Assets / page-nav / Status / Uptime above stay locked. This section is the **dark SPA** contract for Host Protect (`/host`) — on-box web malware plus per-site Host WAF. Not Guard inventory, not the public edge, not print.

### 0. Research Log (Host Protect)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as `/guard` / `/siem` / `/assets` / `/uptime`. Not Stripe marketing; not Linear indigo `#5e6ad2`; not a Wazuh / Imunify dashboard clone.
- Sibling harvest: `GuardKpiStrip` / `UptimeKpiRow` / `AssetKpiStrip` (`StatTile` + `SiemRail` + `GuardPulse`), `EmptyState`, `GuardAgentCard` (2px rail before copy), `UptimeMonitorList` (mobile cards `md:hidden` + desktop table `hidden md:block`), `PageHeader` `h2`, kit `Progress` (`indicatorClassName`), page-nav `TabsList variant="line"`.
- Current `/host` diagnosis (post-#877): `HostOverview` was four flat `rounded-md` border tiles with no rail and no pulse; SKU quota lived as a thin `h-1.5` bar inside PageHeader copy; `HostSiteCard` was a nested `Card` stack with no leading state rail; suspicious-file and WAF-event rows were flat spreadsheet rows; empty / feature-off / no-agents were ad-hoc Cards. Correct-but-flat.
- Imagen drafts: skipped — existing SPA + sibling P15 grammar is the reference; no extra imagegen deps.
- Lazyweb pack: skipped this session — sibling P15 + competitive grammar is the harvest.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** A night-shift **on-box defense** console on existing Sinexis SPA tokens. Signature: a 4-tile KPI strip whose **quota rail steps primary → amber → destructive** before the Add button disables and whose **helper tile carries a live pulse** when the fleet checked in, then a malware list whose site cards carry a 2px **state rail** (critical / running / failed / completed / idle) before the name, then WAF policy + event shells with the same rail grammar. Green `--primary`, not Linear indigo. Sora + Red Hat Mono paths. Not nested Card-in-Card, not a filled green masthead.

### 1. Atmosphere & Identity

`/host` is the on-box module (spec `docs/specs/host-protect-v1.md` + `docs/specs/host-waf-v1.md`): YARA/Clam helper checks per site folder, and a per-site HTTP filter. It must feel like the Guard/SIEM/Assets/Uptime ops family inside AppShell: denser than settings, quieter than SIEM search, and honest about pending/failed checks.

The one memorable moment: the malware KPI strip. When a site is at the SKU cap the quota rail and bar read destructive **before** the Add button disables; when the helper fleet checked in, the helper tile carries a live pulse. On the list, the site's state rail reads before the name, so an on-call operator sees `critical` or `failed` before opening the card.

Do **not** use a filled green masthead, a generic icon-in-circle hero, or a Wazuh/Imunify clone skin. Loading is **card-shaped** skeleton rows (each `relative overflow-hidden rounded-lg border border-border bg-card pl-4` + `SiemRail bg-border` + header icon/title/badge + 2 lines + a button-shaped bar), matching `HostSiteCard` — not a table, not a spinner in a Card. Kept inside the `host-sites-loading` `OpsShell railClass="bg-border"`.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | KPI tiles, install shell, site cards, WAF shells |
| Ink | `--foreground` | Site name, KPI values |
| Meta | `--muted-foreground` | Paths, UUIDs, hints, KPI labels |
| Accent | `--primary` `hsl(142 71% 45%)` | Add, empty CTA, quota-OK rail/bar, completed rail, helper pulse |
| Waiting / running | `bg-sky-600` rail | Queued scan, WAF `detect` |
| Quota warn | `bg-amber-600` rail + amber `Progress` | ≥ 80% and < 100% of SKU cap |
| Critical / failed | `bg-destructive` rail + destructive wash `bg-destructive/[0.04]` | Open webshell/backdoor, failed or stale helper, quota cap, WAF `block` |
| Completed | `bg-primary/5` wash | Completed site card (redundant with badge) |
| Idle | `bg-border` rail | Scheduled scans off, no agents, neutral rows |

Rails are **redundant** with the Badge / KPI value / helper text. Never color-only status.

### 3. Typography

SPA scale (not print 13px). Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` i18n `title` ("Host Protect") |
| Subtitle | `text-sm` | 400 | PageHeader `host-page-subtitle` (tab-specific) + `honestyHint` |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Sites / Agents / Need decision / Helper |
| KPI value | `font-mono text-lg font-bold tabular-nums` | 700 | Counts, `overviewOf` |
| Section title | `text-sm font-medium tracking-wide` | 500 | `hitsTitle`, WAF events |
| Site name | `text-base font-semibold` | 600 | Card `h3` |
| Mono record | `font-mono text-xs break-all` | 400 | Root path, site UUID, WAF path |
| Tab label | `text-sm font-medium` | 500 | Malware / WAF (EN roles frozen) |

Tabular numerals on every count and UUID. Body copy stays the i18n `host` catalog (EN+ID).

### 4. Spacing & Layout

4px base. **No** filter bar on `/host` (Guard-style: no search).

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Rail inset, chip gap |
| --space-2 | 8px | Row inner, KPI inner |
| --space-3 | 12px | Tile gap, site card pad |
| --space-4 | 16px | Shell pad, `TabsContent` `mt-4` |
| --space-6 | 24px | Page stack (`space-y-6`) |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`): header → KPI → install → no-agents/fleet alert → tabs.
- **page-grid** — KPI tiles `grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4` (same as `GuardKpiStrip`).
- **scroll-body-shell** — AppShell owns document scroll. Add-site `Sheet` `side="right"` is the only nested scroller.
- **list-detail** — **not** used. `/host` has page-nav tabs, not a split pane.

Responsive:

- `<md`: site cards stack full width; select grid `grid-cols-1`; actions full-width `min-h-11`; WAF event cards stack (`space-y-2 md:hidden`).
- `≥md`: select grid `sm:grid-cols-2`; actions row `sm:flex-row`; WAF events switch to a table (`hidden md:block overflow-x-auto`).

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `HostKpiStrip` (`host-overview`) | 4 `StatTile` + `SiemRail`; quota tile mounts kit `Progress`; helper tile mounts `GuardPulse` | Quota rail primary / amber / destructive; helper pulse when agents > 0 and not stale |
| Install shell (`host-install-card`) | `relative overflow-hidden rounded-lg border bg-card pl-4` + primary `SiemRail` + mono `pre` | static |
| `HostSiteCard` (`host-site-card-{id}`) | `relative overflow-hidden rounded-lg border bg-card pl-4` + `SiemRail(siteTone)` + wash; header, hairline, settings grid, hairline, hits | critical / running / failed / completed / idle |
| `HostHitsList` (`host-hits`) | mobile cards `md:hidden` + desktop `table-fixed`; destructive rail for webshell/backdoor | open / quarantined / pending / ignored |
| WAF policy shell | `relative overflow-hidden rounded-lg border bg-card pl-4` + `SiemRail(wafMode)` | off (muted) / detect (sky) / protect (primary) |
| WAF events (`host-waf-events`) | mobile cards + desktop table; destructive rail on `block` | block / log |
| Empty / no-agents / feature-off | island `rounded-xl border border-border bg-muted/40` | `host-empty` / `host-no-agents` / `host-feature-off` |
| Add site | existing right `Sheet` (`host-add-sheet`) | do not invent a modal |

Default / hover / focus / disabled / loading / error / empty: kit Button / Tabs / Select / Progress. Hover that changes nothing is slop — rows and buttons only.

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease-out | Row hover `bg-muted/50` |
| Pulse | CSS `animate-ping` | — | Helper KPI when the fleet checked in |
| Progress | 500ms | ease-out | Quota bar fill (kit `Progress`) |
| Press | kit Button `scale` | — | Do not restyle kit |

- GPU only: `opacity` on ping. No layout animation.
- `motion-reduce:animate-none` on `GuardPulse` (already in the primitive).

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`, no filled green masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| KPI tiles / site cards / WAF shells | `border border-border bg-card rounded-lg` + `SiemRail` | Surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | KPI, site card, hits, WAF policy/events |
| Empty islands | `rounded-xl border border-border bg-muted/40` | Empty / no-agents / feature-off |
| Critical wash | `bg-destructive/[0.04]` + destructive rail | Site with open hits, failed/stale, blocked WAF event |
| Completed wash | `bg-primary/5` | Completed site card |

P15 flatten: the KPI strip is **not** inside PageHeader and **not** inside the list. Header is title + subtitle + Add only; the SKU quota **leaves** the header and is owned by the KPI strip.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / KPI value / helper text.
- Every form field has `Label` + `htmlFor`. Kit only: no native `<select>`; primary actions are `Button`.
- Heading remains PageHeader `h2`; site names are `h3`.
- `prefers-reduced-motion` kills the helper ping.
- Frozen testids in `frontend/src/test/HostProtect.test.tsx` must survive: `host-page`, `host-page-subtitle`, `host-add`, `host-empty` / `host-empty-cta`, `host-feature-off`, `host-no-agents`, `host-overview` / `-sites` / `-agents` / `-decision` / `-helper`, `host-install-card` / `host-install-download` / `host-install-wget`, `host-site-card-{id}` / `host-site-badge-{id}`, `host-site-id` / `host-copy-site-id`, `host-helper-poll`, `host-helper-fleet`, `host-scan` / `host-scan-status`, `host-enabled-existing` / `host-interval-existing` / `host-auto-quarantine-existing` / `host-watch-existing`, `host-hits` / `host-hits-empty` / `host-show-ignored` / `host-quarantine` / `host-restore` / `host-ignore`, `host-tab-malware` / `host-tab-waf`, `host-waf-panel` / `-off` / `-site` / `-mode` / `-protect-locked` / `-simulate` / `-simulate-hint` / `-copy-snippet` / `-site-id` / `-copy-site-id` / `-site-id-hint` / `-copy-hint` / `-snippet-status` / `-helper-poll`, `host-waf-events` / `-empty` / `-mobile` / `-desktop` / `-pagination` / `-hint`, `host-waf-event-card-{id}`. Tablist keeps `data-variant="line"` + `w-full`.

#### Personas

- **Owner / admin / member** (primary): scan KPI → add site (until SKU cap) → scan now → quarantine / restore / ignore.
- **On-call at 2am**: site state rail + `host-scan-status` copy must be readable without opening the sheet.
- **Ops with helper stale**: helper tile rail destructive + fleet `Alert`; empty list is explicitly not a clean result.
- **Host Basic**: WAF `protect` stays hidden; `host-waf-protect-locked` explains.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Duplicate mobile + desktop hits / WAF-event markup | HostHitsList / HostWafEventsList | Frozen testids on both card and row; `useIsMobile` would drop one tree | Named a11y slice |
| `SiemRail` / `GuardPulse` imported into host, `EmptyState` from `components/patterns/` | chrome | One rail/pulse primitive; railed surfaces share `components/patterns/RailedShell.tsx`, so this is a single import, not a third family | Keep import |
| Site settings stay four labeled `Select`s in the card | HostSiteCard | Frozen testids; collapsing to a settings sheet is a module change, not a visual slice | Named refactor |
| `HostWafPanel` still holds query + mutation logic | panel | This slice restyles chrome only; a `useHostWaf` hook split mixes visual with module work | Named extract |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |
