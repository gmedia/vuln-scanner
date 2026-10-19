# Navigation & app shell
## Page-nav line tabs (`/ai`, Host, SIEM, ScanDetail, Admin AI)

Print invoice, Guard, and Assets (above) are **separate surfaces**. This section is the SPA **page-nav** tab contract. Do not restyle kit default (pill) Tabs. Reuse existing Radix `Tabs.tsx` — do not invent a second tab primitive. Uptime range tabs stay pill.

### 0. Research Log (AI tabs)

- Embedded refs: shortlisted shadcn New York v4 `tabs.json` (`variant: default | line`) + sibling Host Protect / Uptime / SIEM pill tabs → picked kit `variant="line"` as a **second official variant**, not a page-local underline. Layer A `redesign-skill` + Layer B `linear.app` (ops density, one accent) stacked with `layout-skill` (stack). Not Stripe marketing; not print invoice.
- Lazyweb: skipped this slice — in-repo shadcn kit + Host Protect in-app count (`font-mono text-[11px] tabular-nums`) are the contract. No extra imagegen deps.
- Sibling harvest: `Tabs.tsx` default pill (`h-10 rounded-md bg-muted p-1`); Host Protect tab counts (not `Badge variant="critical"`); Credit History filter chrome is **out** — `/ai` has no filter row.
- Skipped lanes: react-grab / react-scan / react-doctor install — AGENTS.md forbids extra deps for a visual slice; `main.tsx` has none.

**Direction (locked):** Full-width underline **page-nav** on `/ai`, Host Protect, SIEM, ScanDetail, and Admin AI. Signature: a 2px `--foreground` underline (`after:h-0.5 after:bg-foreground`) under the active trigger, not `--primary`. Sora labels + lucide icons + mono counts via kit `TabCount`. **Keep pill:** UptimeDetail range (`data-testid="uptime-range-tabs"`) and other in-card segmented controls. Do not convert filter pills.

### 1. Atmosphere & Identity

Page-nav tabs sit under PageHeader (or after ScanDetail KPI tiles) as **page navigation**, not a segmented control inside a Card. They must feel like Linear/Supabase settings nav — quieter than SIEM search filters, denser than a marketing feature tab.

The one memorable moment: scanning the tab row, the eye hits a hairline `--border` list and a 2px ink underline on the active tab **before** the panel copy. Counts sit as muted mono via `TabCount`, never a critical Badge.

Do **not** restyle default `TabsList` to line. Callers that omit `variant` keep `bg-muted` pills.

### 2. Color

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

### 3. Typography

SPA scale. Fonts already loaded: Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

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

### 4. Spacing & Layout

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

### 5. Components

#### Tabs (kit)

- **Default** (`variant` omitted): pill list `h-10 rounded-md bg-muted p-1`; active trigger `data-[state=active]:bg-background` + shadow. Uptime range (`uptime-range-tabs`) and in-card pills stay here.
- **Line** (`variant="line"`): hairline list + `data-variant="line"`. Active trigger underline via `group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100` (`after:h-0.5 after:bg-foreground`). Line mode kills pill wash (`bg-transparent`, `shadow-none`).
- Do **not** restyle kit files to match one screenshot. Frozen default tests: `bg-muted`, `data-variant="default"`. Frozen line tests: `bg-transparent`, `border-b`, `after:bg-foreground`, not `after:bg-primary`.

#### Page-nav callers

Shared chrome: `TabsList variant="line" className="w-full justify-start"`. Icons `aria-hidden`. Counts via kit `TabCount` (null when `value <= 0`). Duplicate in-panel `CardTitle` matching the tab label is dropped.

- **`/ai`**: Wallet / Keys / Usage / Catalog. Frozen testids `ai-tab-wallet` … `ai-tab-catalog`. EN role names frozen. Counts: Keys = active keys; Usage = `items.length`.
- **Host Protect**: Malware / WAF. Frozen `host-tab-waf`. Icons `Bug` / `Shield`. Count: `overviewNeedsDecision` on Malware.
- **SIEM**: Search events / Cases (EN roles frozen). Icons `Search` / `FolderOpen`. Count: open cases on Cases. Search `CardTitle` and cases CardHeader title dropped.
- **ScanDetail**: Findings / Diff / Export (EN roles frozen). Icons `Crosshair` / `GitCompare` / `Download`. Count: `findingsCount` on Findings.
- **Admin AI**: Providers / Models / Usage / Top-up / Trial. Icons `Server` / `Boxes` / `ScrollText` / `Wallet` / `MessageSquare`. No `min-w-max` overflow strip. Usage CardTitle dropped.

#### AiWalletPanel

- Extracted wallet card. Stat tiles (balance / active keys / period billed) + empty-wallet CTA + copyable `/v1` base URL. Not a second tab primitive.

#### Ai panels (keys / usage / catalog)

- `AiKeysPanel` / `AiUsagePanel` / `AiCatalogPanel` take a `loading` prop. While their query is pending they render `TableRowSkeleton` (`keys` `rows={5} columns={6}`, `usage` `rows={5} columns={4}`, `catalog` `rows={5} columns={4}`) **instead of** the empty well, so the empty copy never flashes. The create-key form row stays visible on Keys. Empty well (`ai-usage-empty`, etc.) renders only when `!loading`.

### 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 200ms | `transition-all` / `after:transition-opacity` | Trigger + underline opacity |
| Reduced | — | — | `motion-reduce:after:transition-none` |
| Emphasis | — | — | none |

- GPU only: `opacity` on the underline. No layout animation.
- Hover that changes nothing is slop — triggers only.
- Press: kit Button `scale` only. Do not restyle kit.

### 7. Depth & Surface

**borders-only**. No glass, no drop shadows on the line list (pill `shadow-sm` stays on **default** variant only).

| Type | Treatment | Use |
|------|-----------|-----|
| Line list | `border-b border-border bg-transparent` | Page-nav |
| Underline | `after:h-0.5 after:bg-foreground` | Active line trigger |
| Panels | kit `Card` | Wallet / keys / usage / catalog |
| Pill list | `bg-muted rounded-md` | Default variant only |

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Underline is redundant with `data-state="active"` + `text-foreground`.
- Radix Tabs: keyboard arrows, `role="tablist"` / `tab` / `tabpanel`.
- Icons `aria-hidden`. Visible labels from i18n (`tabWallet` …).
- Heading remains PageHeader `h2` "AI Gateway".
- `prefers-reduced-motion` kills underline opacity transition.

#### Personas

- **Owner / member** (primary): wallet → mint key → copy `/v1` → scan usage / catalog.
- **Admin**: same + top-up CTA may point at `/admin/ai`.
- **Ops with flag off**: `ai-feature-off` island; no tabs.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Line `after:` classes on default triggers | `TabsTrigger` | Hidden unless `group-data-[variant=line]` + active; extracting a second Trigger would fork the kit | Keep group-data until a named kit split |
| Uptime range stays pill | `/uptime/:id` | In-card filter, not page-nav | Keep default variant |
| `AiWalletPanel` 8 readonly props | wallet panel | Extracted from page; grouping into a stats object is a follow-up | Named refactor |
| react-scan / react-grab not wired | SPA entry | AGENTS.md forbids extra deps for a visual slice | Separate tooling PR |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## App shell chrome (Sidebar / Header)

This is the signed-in AppShell contract, not the public Landing or auth chrome. Sources: `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/layout/Header.tsx`, and `frontend/src/components/ui/sidebar.tsx`.

### 0. Research Log

The collapsed footer switchers were fixed in #973 and the brand mark in #975. Their icon-rail contract was previously undocumented; this section records the shipped behaviour, not a new chrome wave.

### 1. Atmosphere & Identity

The collapsed rail is the same flush canvas as the expanded sidebar, not a contrast strip. One `--primary` green accent marks the brand crosshair and active states.

### 2. Color

Reuse `frontend/src/index.css` tokens in both themes. No second palette.

| Role | Token | Usage |
|------|-------|-------|
| Canvas | `--sidebar` | Expanded sidebar and icon rail |
| Accent | `--primary` | Crosshair and active states |
| Ink | `--foreground` | Expanded labels |
| Meta | `--muted-foreground` | Expanded secondary text |
| Edge | `--border`, `--sidebar-border` | Hairline separation only |

### 3. Typography

The expanded `BrandMark` wordmark is Red Hat Mono `SINE` plus accent `XIS`. Collapsed hides the entire text span with `group-data-[collapsible=icon]:hidden`, leaving only the crosshair; no wordmark text is painted in the rail.

### 4. Spacing & Layout

| Mode | Width | Contract |
|------|-------|----------|
| Expanded | `SIDEBAR_WIDTH = "16rem"` (256px) | Footer cluster keeps labels |
| Collapsed | `SIDEBAR_WIDTH_ICON = "3rem"` (48px) | Icon-only rail |
| Mobile | `SIDEBAR_WIDTH_MOBILE = "min(22rem, calc(100vw - 3rem))"` | Sheet, not the desktop icon rail |

`SidebarFooter` is `flex flex-col gap-2 p-2`. In the 48px rail, its 8px padding on each side leaves exactly **32px** for every collapsed control. The base `SidebarMenuButton` applies `group-data-[collapsible=icon]:size-8!` and `group-data-[collapsible=icon]:p-2!`; its direct SVG is `size-4`. Don't substitute `Button size="icon"`: `buttonVariants` gives it `min-w-11` (44px), wider than the footer content.

`Header` uses `px-0` collapsed versus `px-1` expanded. Its collapsed switcher row is `flex flex-col items-center gap-1`, not a horizontal segmented control. `Sidebar.tsx` passes `<Header collapsed={state === "collapsed" && !isMobile} />` after reading `useSidebar()`; `Header` must not read that context itself because `frontend/src/test/Header.test.tsx` renders `<Header />` without `SidebarProvider`.

### 5. Components

#### BrandMark

Expanded: crosshair and `SINE` / `XIS` wordmark. Collapsed: `Sidebar.tsx` passes `group-data-[collapsible=icon]:justify-center` to the mark and `group-data-[collapsible=icon]:hidden` to the text; the crosshair remains. `BrandMark` has no `collapsed` prop. `AuthLayout.tsx` and `Footer.tsx` share the mark without sidebar-only classes.

#### ThemeSwitcher

Expanded: labeled dark/light segmented controls. Collapsed: one `SidebarMenuButton` toggles to the other theme with an accessible label and right-side tooltip. Its optional `collapsed?: boolean` defaults to `false`; `AuthLayout.tsx`, `Landing.tsx`, and `NotFound.tsx` keep the expanded variant.

#### LanguageSwitcher

Expanded: labeled `id` / `en` controls. Collapsed: one `SidebarMenuButton` opens the locale menu, with an accessible label and right-side tooltip. Its optional `collapsed?: boolean` defaults to `false`; non-sidebar consumers stay expanded.

#### OrgSwitcher

Expanded: a button with org name, role, and chevron. Collapsed: one `SidebarMenuButton` with the active org name as `aria-label` opens the same menu and has a right-side tooltip. Its optional `collapsed?: boolean` defaults to `false`; an unauthenticated session or empty org list still renders nothing.

#### User menu

Expanded: user icon, email, and chevron in the trigger. Collapsed: `Header` branches to one `SidebarMenuButton` trigger with `aria-label={user.email}` and tooltip; the email span and chevron are hidden in the rail. `Header` takes optional `collapsed?: boolean`, default `false`. The menu retains `user-menu` and `sign-out`. The active-scan block and version line in `Sidebar.tsx` are `group-data-[collapsible=icon]:hidden`.

### 6. Motion & Interaction

The sidebar transitions between 256px and 48px; kit menu buttons transition width, height, and padding. `SidebarMenuButton` places tooltip content on the right and shows it only while collapsed on desktop. Locale, org, and user menus open from their single collapsed triggers. Don't leave a second, hidden switcher in the DOM.

### 7. Depth & Surface

The rail remains flush with the sidebar canvas. Use the existing `--border` / `--sidebar-border` hairline only; don't add a contrasting chrome strip or a second header.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- Collapsed icon triggers keep accessible names via `aria-label` even with visible labels hidden: theme/locale action, active org name, or user email. The brand link keeps its accessible name when the wordmark is hidden.
- Exactly **one variant** of each switcher is in the DOM at a time: branch on `collapsed` in JS, never dual-render behind `hidden` or `group-data-*`. `frontend/e2e/global-setup.ts` uses strict `getByTestId("locale-id").locator("visible=true")`; `frontend/e2e/dashboard.spec.ts` uses strict `getByTestId("org-switcher").locator("visible=true")`. Duplicate nodes break these locators.
- **Frozen testids:** `theme-switcher`, `theme-dark`, `theme-light`, `language-switcher`, `locale-id`, `locale-en`, `org-switcher`, `org-switcher-menu`, `user-menu`, `sign-out`. Don't rename or remove them; menu-item ids appear when their menus open.
- `Header` receives collapse state from `Sidebar.tsx`; it must also render without `SidebarProvider` in the unit test.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `size="lg"` has collapsed `p-0!`, overriding base `p-2!`; an unguarded large button fails to center its icon and clips its text glyph | `frontend/src/components/ui/sidebar.tsx` `sidebarMenuButtonVariants`; `Sidebar.tsx` brand uses explicit centering and hides text | Kit file is frozen; don't restyle it for one surface | Named kit slice only |
| 1px clipped-glyph fragment at bottom of scrollable nav | `frontend/src/components/layout/Sidebar.tsx` nav / kit sidebar scroll list | Present in both collapsed and expanded; normal scroll clipping, not a rail bug | Keep unless a named scroll slice changes it |
| No automated visual regression baseline for collapsed rail | `frontend/src/test/` | Unit tests assert classes only; jsdom doesn't apply Tailwind | Named visual-baseline slice |

---
