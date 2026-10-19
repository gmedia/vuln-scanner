# Guard
## Guard fleet console (`/guard`)

Print invoice (sections 0–8) and SIEM (above) are **separate surfaces**. This section is the SPA `/guard` contract. Do not reuse print paper tokens. Do not restyle kit files. Reuse SIEM rail / empty-island grammar — do not invent a third chrome family.

### 0. Research Log (Guard)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + Layer B `linear.app` (ops density, luminance steps, one accent) stacked with `layout-skill` (stack + page-grid). Same routing as `/siem` (#873). Not Stripe marketing; not print invoice; not a Wazuh/CrowdStrike clone.
- Lazyweb: 6 queries (`crowdstrike falcon hosts`, `wazuh agents`, `sentinelone endpoints`, `endpoint protection agent inventory`, `daytona api keys`, `lago api keys`). Screens saved under `/tmp/lazyweb-refs/`. **Viewed grammar (not pixel copy):** SentinelOne / Fortinet endpoint pages = dense host table + status, not stacked marketing cards; secret-once APIs (Knock / Lago-class) = mono token + copy, shown once. Skipped Forbes/CNBC/Databricks hits (news, not product UI). Pack `generate_report` skipped (deprecated lazyweb path; sibling SIEM harvest is the in-repo contract).
- Sibling harvest: `SiemIndexerStrip` (2px rail KPI tiles + live pulse), `SiemRail`, `EmptyState`, `UptimeKpiRow` / `HostOverview` (uppercase 10px labels, mono tabular values, `rounded-md border`), `HostInstallCard` (mono `pre` + copy, not a green soup), PageHeader (`h2` + subtitle + actions). Credit History filter bar is **out** — Guard has no filter row.
- Imagen drafts: skipped — existing SPA + SIEM grammar + viewed EDR/secret screens are the reference; no extra imagegen deps.
- Skipped lanes: react-grab / react-scan / react-doctor install — AGENTS.md forbids extra deps for a visual slice; `main.tsx` has none.

**Direction (locked):** A night-shift **fleet** console on existing Sinexis SPA tokens. Signature: a 4-tile KPI strip with 2px status rails (on = primary + pulse, degraded = amber, off = muted) plus agent/alert rows that carry the same rail before the copy. Enroll secret is a once-only primary-rail panel with Red Hat Mono — the one memorable moment after “Buat token”. Sora + mono IDs/timestamps. Not a Shield-cliché empty Card stack, not nested Card-in-Card, not full SIEM.

### 1. Atmosphere & Identity

`/guard` is P5 Wazuh-thin (spec `docs/specs/guard-v1.md`): org-scoped **agent inventory + critical alerts + per-org enroll**. It must feel like the SIEM/Uptime/Host ops family sitting inside AppShell — filter-less, denser than a settings page, quieter than SIEM search.

The one memorable moment: creating an enroll token, the eye hits a 2px primary rail and a mono secret with Copy — then the fleet table, where online/disconnected is a rail **before** the badge.

Do **not** use Lucide `Shield` as the page signature or empty-state hero (EDR cliché). Empty islands use `Monitor` (disabled / no agents) and `Siren` (no alerts, matching SIEM).

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo. No CrowdStrike red masthead.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | KPI tiles, enroll, agents, alerts |
| Ink | `--foreground` | Agent name, alert title |
| Meta | `--muted-foreground` | Timestamps, UUIDs, KPI labels |
| Accent | `--primary` `hsl(142 71% 45%)` | Enable, create token, on-rail, live pulse |
| On / online | `bg-primary` rail + emerald badge wash | Guard enabled, agent `active` |
| Degraded / disconnected | `bg-amber-600` rail + amber badge | Status degraded, agent disconnected |
| Pending | `bg-sky-600` rail + sky badge | Agent pending |
| Off / disabled / expired | `bg-border` rail + muted badge | Guard off, agent disabled, token expired/used |
| Critical alert | `bg-destructive` rail + `Badge variant="critical"` | Alert rows (level ≥ 12) |
| Once-secret | `border-primary/40 bg-primary/5` + primary rail | Enroll plaintext + Host Protect token once |

Agent **chips** stay kit `Badge` washes (emerald / amber / sky / muted) — never ad-hoc `bg-red-600 text-white`. Alert level chips use `Badge variant="critical"` as today.

### 3. Typography

SPA scale (not print 13px). Fonts already loaded: Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

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

### 4. Spacing & Layout

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

### 5. Components

#### GuardKpiStrip

- **Structure**: 4 tiles — state / agents / critical alerts / last sync. Each tile: `SiemRail` + uppercase label + value. State tile mounts a live pulse when enabled and not degraded.
- **Frozen**: `data-testid="guard-state"` + `data-enabled="true"|"false"` on the **state value** (must still contain i18n `nyala` / `nonaktif` / `on` / `off`). Wrapper `data-testid="guard-kpi-strip"`.
- **States**: loading = skeleton tiles (no pulse), `data-testid="guard-kpi-skeleton"`. Status error = `data-testid="guard-status-error"` **instead of** the strip (session vs load copy unchanged). Feature off (Guard disabled) = strip still mounts (off rail) **above** the disabled island.
- **A11y**: text status, not color alone. `aria-hidden` on rails and pulse.

#### GuardEnrollPanel

- **Structure**: one shell (`border border-border bg-card rounded-lg`) — header + labeled create row + token list. Not a Card nested in a Card.
- **Create row**: `Label` + `Input#enroll-label` + `Button` "Buat token" / "Create token". Equal `gap-2`, control `h-10`.
- **Once-secret** (`data-testid="guard-host-enroll-steps"`): 2px primary rail, `bg-primary/5`, mono secret in `<code>`, host steps `<ol>`, curl `<pre>` + copy, distro `Accordion` (`guard-agent-install-steps`, `guard-distro-install-commands`). Commands stay collapsed until trigger (frozen unit test).
- **Token list**: ready-first sort; expired `opacity-60`; revoke confirm dialog unchanged. Frozen `guard-enroll-token-row` / `guard-enroll-token-card`. Loading = `TableRowSkeleton rows={3} columns={4}`.
- **Host Protect once-token**: sibling alert `data-testid="guard-host-token-once"` — same primary-rail secret treatment, not a second green soup.

#### GuardAgentsPanel

- **Structure**: one shell `data-testid="guard-agents"`. Empty: `EmptyState` + `data-testid="guard-agents-empty"` (icon `Monitor`, copy `noAgents`). Loading = `TableRowSkeleton rows={4} columns={5}`.
- **Row**: 2px rail — online `bg-primary`, disconnected `bg-amber-600`, pending `bg-sky-600`, disabled `bg-border`. Name mono; UUID `CopyableId`; last seen + helper poll; version; asset chip `guard-asset-chip-{id}`; admin Select `guard-link-asset-{id}`; host-token `guard-host-token-issue`; disable `guard-disable-{id}`.
- **Do not** dump IP in the default row (keep current columns). Do not `table-fixed`.

#### GuardAlertsPanel

- **Structure**: one shell `data-testid="guard-alerts"`. Empty: island + `guard-open-siem` link to `/siem`.
- **Rows**: 2px destructive rail + `Badge variant="critical"` `L{n}` + description + mono meta (time · agent · rule). Not a nested Card list. Loading = a **list-shaped** skeleton (3× `rounded-md border border-border p-3`, 2 `Skeleton` lines each), matching the alert `<li>` rows — not table rows.

#### Disabled / error

- Disabled: `data-testid="guard-disabled"` composed island (`Monitor` + `disabledHint`), **not** `rounded-3xl` Shield hero.
- Errors: kit `Alert variant="destructive"` for mutations; status load uses `guard-status-error` copy (`sessionExpired` vs `loadStatusFail`).

### 6. Motion & Interaction

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

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows on tiles, no nested Card-in-Card, no `rounded-3xl`.

| Type | Treatment | Use |
|------|-----------|-----|
| KPI / enroll / agents / alerts | `border border-border bg-card rounded-lg` | Surfaces |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | State / agent / alert / once-secret |
| Once-secret | `bg-primary/5` + primary rail | Enroll + host-token plaintext |
| Expired token row | `opacity-60` | Used/expired still readable |

P15 flatten: KPI strip is **not** inside a status Card. Enroll, agents, and alerts are sibling shells — not a dashboard of stacked `CardHeader` icons.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / strong text (`nyala`, `online`, `L{n}`).
- Every form field has `Label` + `htmlFor` (`enroll-label`, asset Select).
- Copy / disable / revoke / host-token controls keep i18n `aria-label`s.
- Heading remains `h2` "Guard" via PageHeader (Playwright exact).
- `prefers-reduced-motion` kills ping and accordion fade.
- Never print enroll/host-token secrets into logs, toasts, or tracked markdown.

#### Personas

- **Owner / admin** (primary): enable → mint enroll token → copy curl → sync → link asset / issue Host Protect token / remove agent.
- **Member**: view fleet + alerts; no enable / token / disable / host-token.
- **Viewer**: view only (no remove, no enroll).
- **Ops with Guard off**: KPI off + disabled island; no fake agents.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| Duplicate mobile + desktop agent/token markup | GuardAgents / Enroll | Frozen testids on both card and row; `useIsMobile` rewrite is out of a visual slice | Named a11y slice |
| `SiemRail` imported into Guard, `EmptyState` from `components/patterns/` | chrome | One rail + one empty primitive; extracting `components/ops/` is a third-family risk | Keep import until a named ops-chrome PR |
| No IP column on agent table | agents | Current columns frozen by unit tests (`Last seen`, `Version`, `min-w-[40rem]`) | Named column slice |
| Lazyweb pack `generate_report` not filed | research log | Deprecated MCP path; in-repo SIEM harvest is the contract | Ignore |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

---
