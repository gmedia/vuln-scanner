# Content
## Inbox & credit history (`/inbox`, `/credit-history`)

Print §§0–8 and every SPA section above stay locked. These are the last two SPA surfaces without a documented contract. Both already had **per-row** rails; this section closes their **shells** on the shared `OpsShell`, which completes the ops family.

### 0. Research Log (Inbox & credit history)

- Reused the family grammar and the `OpsShell` extracted in the previous slice. No new reference pull.
- Sibling harvest: `OpsShell` (`components/ops/OpsShell.tsx`), the per-row rail precedent inside both pages (`InboxRow`, `LedgerMobileCard` / `TransactionRow`), `EmptyState` island grammar.
- Current diagnosis: `/inbox` had one `Card` + `CardHeader` list shell and a bare bordered `<div>` filter bar; `/credit-history` had an `article` identity band, three flat `StatTile`s, a bare bordered `<div>` filter bar, and one `Card` + `CardHeader` list shell. Every rail already existed at row level; the shells had none. `/credit-history` also carried a `TYPE_COLORS` badge palette.
- Imagen / Lazyweb: skipped — family grammar is the reference; AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** Same ops console. Inbox's list shell rails by the **worst row status** (failed → destructive, bounced → orange, complained → yellow, all sent → primary, empty → muted); credit history's list shell rails by the **page net** (positive → primary, negative → destructive, empty → muted).

### 1. Atmosphere & Identity

`/inbox` answers "did the product's email actually leave?" — SMTP acceptance, not mailbox delivery. `/credit-history` answers "where did my scan credits go?". Both must read as the same console as the rest of the family.

The one memorable moment: the **list rail**. Inbox shows a failed send in destructive at the shell level before any row is read; credit history flips destructive the moment the page nets negative.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`.

| Role | Token / class | Usage |
|------|----------------|-------|
| Shells | `--card` + `border-border` + `SiemRail` | Inbox filter/list, credit identity/filters/list |
| Accent | `--primary` `hsl(142 71% 45%)` | sent rail, credit rail, identity rail, credits tile, positive net |
| Warn / bounced | `bg-orange-600` rail | bounced row + list shell |
| Warn / complained | `bg-yellow-700` rail | complained row + list shell |
| Danger | `bg-destructive` rail + `bg-destructive/[0.04]` row wash | failed row, failed list shell, debit row, debits tile, negative net |
| Refund | `bg-blue-500` rail | refund row |
| Idle | `bg-border` rail | filter shells, empty list shells |

**Ledger palette routes through the tone module.** `TYPE_COLORS` pairs each wash with `TONE_CHIP_TEXT` (`bg-green-600/15` + `TONE_CHIP_TEXT.green`, and the red/blue equivalents), and the signed amounts use `TONE_TEXT.green` / `TONE_TEXT.red`. `e2e/credit-history.spec.ts` selects on `[data-testid="credit-type-badge"][data-type]` and `[data-testid="credit-amount"][data-sign]`, so the shades are free to move without breaking the suite.

### 3. Typography

Unchanged from the family. Shell titles are the shared `h3` at `text-sm font-medium tracking-wide`; counts stay `font-mono text-[10px] tabular-nums`.

### 4. Spacing & Layout

Filter bars keep the AGENTS.md contract: `grid gap-3`, each field `flex min-w-0 flex-col gap-1.5`, controls `h-10 min-h-10`. They are now `OpsShell` bodies rather than bare bordered divs, so they match the rest of the family.

**Frozen contracts**: `inbox-page`, `inbox-filters`, `inbox-empty`, `inbox-loading`, `inbox-pagination`, `inbox-row`, `inbox-job-link`; `credit-history-identity`, `credit-history-summary`, `credit-history-filters`; the four `th` labels `Date` / `Type` / `Amount` / `Description`; `Page N of M`; `N total`; `Transactions`; `No transactions yet` / `Credit adjustments will appear here.`; the e2e badge + amount classes above; the `@/components/ui/Card` mock in `src/test/credit/CreditHistory.test.tsx` (harmless — `OpsShell` composes the real `Card` through it).

Loading shapes: Inbox is an **article-shaped** list (`role="list"`, `data-testid="inbox-loading"`, 5× `rounded-lg border border-border p-3` with 3 `Skeleton` lines), matching `inbox-row` — not table rows. Credit ledger list = `TableRowSkeleton rows={5} columns={4}`.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| Inbox filter shell (`inbox-filters`) | `OpsShell` muted rail + body grid (no head) | idle |
| Inbox list shell (`inbox-list-shell`) | `OpsShell` + `SiemRail(inboxListRailClass)` + head (`Send attempts` + row count) + `flush` body | primary / orange / yellow / destructive / muted |
| Credit identity shell (`credit-history-identity`) | `OpsShell` primary rail + body (wallet figure + account links) + summary grid | primary |
| Credit summary tiles | `StatTile` + `SiemRail` | balance primary / credits primary / debits destructive |
| Credit filter shell (`credit-history-filters`) | `OpsShell` muted rail + body grid + footer note + Clear | idle |
| Credit ledger shell (`credit-history-list-shell`) | `OpsShell` + `SiemRail(creditListRailClass)` + head (`Transactions` + total) + `flush` body | primary / destructive / muted |

New chrome: `components/inbox/inboxChrome.ts` (`inboxStatusRailClass`, `inboxListRailClass`), `components/credit/creditChrome.ts` (`creditTypeRailClass`, `creditListRailClass`). Both move logic that previously lived inline in the page.

### 6. Motion

Unchanged from the family (micro hover only; the row problem wash already existed).

### 7. Depth & Surface

Borders-only + 2px rails. No nested Card-in-Card.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- Unchanged. Headings stay PageHeader `h2`; shell titles are `h3`.
- Every field keeps `Label` + `htmlFor`; Selects are kit only.
- The Inbox list head uses the existing `t("card")` copy ("Send attempts") — no new i18n key.

#### Personas

- **Operator** (primary): scan the inbox for failed/bounced sends; audit the credit ledger.
- **Finance/self-serve user**: the ledger rail flips destructive on a net-negative page.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Ledger badge + amount palette stays hardcoded (green/red/blue) | `CreditHistory.tsx` | Semantic ledger palette, and frozen by `e2e/credit-history.spec.ts` selectors | Named e2e + token migration |
| `Inbox` / `CreditHistory` keep queries + filters in the page | pages | This slice restyles chrome only | Named extract |
| `src/test/credit/CreditHistory.test.tsx` still mocks `@/components/ui/Card` | test | Harmless: `OpsShell` composes the real `Card` through the mock | Named test cleanup |
| `ops-shell-residue` migration note still open | earlier section | The six per-surface shells remain; this slice only adds two more consumers | Named migration PR |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## Landing (`/`)

Print §§0–8 and every SPA section above stay locked. This section is the **public marketing** contract for `/`. Landing is the **source of truth for public chrome** (guide §10): the FastAPI islands (`/blog`, `/blog/{slug}`, `/terms`, `/privacy`) must rhyme it, not the reverse. It is **not** an ops console — no rails, no `OpsShell`, no `SiemRail`.

### 0. Research Log (Landing)

- Reused the existing tokens + `BrandMark` + `Footer`. No new reference pull, no new palette.
- Sibling harvest: `components/ops/OpsShell.tsx` icon-chip geometry (`h-8 w-8 rounded-md border border-border bg-muted/40`) — borrowed for the **feature icon chip only** as a shared visual atom; the shell/rail itself is deliberately **not** used.
- Current diagnosis (pre-refresh): the pipeline `li` carried **`shadow-sm`**, violating the borders-only rule that every other surface follows; the 9 feature cards had a bare `h-8 w-8` icon with `mb-2` and no chip; the pipeline step number was plain text while the feature icon was not; the FAQ `h2` used `mb-8` with no header wrapper while the other two sections used `mb-10 space-y-2`. The hero was text-only with no product-loop anchor.
- Imagen / Lazyweb: skipped — tokens + existing chrome are the reference; AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** Keep the public chrome geometry exactly (`h-12` header, `BrandMark`, `max-w-6xl` / `2xl:max-w-[90rem]`, footer). Refresh inside it: **remove the shadow drift**, give the hero a bordered **attach-loop strip**, put every feature icon in a bordered chip, and unify the three section headers.

### 1. Atmosphere & Identity

Landing is the public front door and the reference the HTML islands copy. It must stay calmer and more editorial than the ops consoles: no rails, no status chrome, no dense tables.

The one memorable moment: the **hero attach-loop strip** — `Scan → Attach → Workspace → Guard` as mono chips in a bordered card, previewing the loop that the next section expands.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Palatino (blog-island drift).

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Hero loop strip, pipeline steps, feature cards, FAQ accordion |
| Ink | `--foreground` | h1/h2, step titles, card titles |
| Meta | `--muted-foreground` | Eyebrow, hero sub, descriptions, footer |
| Accent | `--primary` `hsl(142 71% 45%)` | Feature icons, links, primary CTA |
| Hover | `hover:border-primary/40` | Pipeline steps + feature cards |

### 3. Typography

Unchanged from the existing public scale. `h1` is `text-3xl sm:text-4xl lg:text-5xl`; section `h2` is `text-2xl`; eyebrows are `text-xs uppercase tracking-wide`; card/step titles are `text-sm`; the loop strip is `font-mono text-xs`.

### 4. Spacing & Layout

Sections use `px-4 py-12` inside `mx-auto max-w-6xl 2xl:max-w-[90rem]`. All three section headers now share `mb-10 text-center space-y-2`. The hero uses `pt-16 pb-12 sm:pt-20` with `max-w-3xl 2xl:max-w-4xl`.

**Frozen contracts** (`src/test/Landing.test.tsx` + `e2e/landing.spec.ts`): the `h1` copy; the hero eyebrow / sub; `/Scan → Attach → Workspace → Guard/` still present (via `stepGuardDesc`); `header` contains `SINE` + `XIS` and there are ≥ 2 of each (header + footer); Get Started → `/register`; Sign In → `/login`; header Sign In keeps `hidden sm:inline`; the mobile menu trigger keeps an `aria-label` and `sm:hidden`; `main a[href='/login']` first is not `hidden`; h2 `How you run it` / `What is open in the account` / `Straight answers`; **exactly 9 `Card` elements**; the nine module titles; no `SIEM` heading; ≥ 2 `Blog` links → `/blog`; Terms → `/terms`; Privacy → `/privacy`; footer `Sinexis · Scan · Guard`, no `SIEM` / `VulnScanner` / version; `.lg\:grid-cols-4` absent; nav `Site` present, `Product` / `Legal` / `Account` absent; root `.min-h-dvh.flex.flex-col`, `main.flex-1`, `footer.mt-auto`.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| Header | `h-12` + `border-b` + `BrandMark` + blog/theme/i18n + Sign in / Get started + mobile `Sheet` | unchanged |
| Hero | eyebrow + `h1` + sub + CTA row + loop strip | static |
| Loop strip (`landing-loop`) | `mx-auto max-w-2xl rounded-lg border bg-card px-4 py-3` + 4 mono chips separated by `ArrowRight` icons | static; 3 arrows |
| Pipeline step | `li` `rounded-lg border bg-card p-4` + numbered `h-7 w-7` chip + title + desc | `hover:border-primary/40`; **no shadow** |
| Feature card | kit `Card` (`h-full`) + `CardHeader` (bordered `h-9 w-9` icon chip + `CardTitle`) + `CardContent` | `hover:border-primary/40`; **9 total** |
| FAQ | `Accordion` in `rounded-lg border bg-card px-4` | unchanged |

### 6. Motion

Micro only: `transition-colors` on step/card hover and links. No ping, no layout animation. Respect `prefers-reduced-motion` (kit defaults).

### 7. Depth & Surface

**borders-only.** No drop shadows anywhere on Landing (the `shadow-sm` drift is removed and locked by a test). No glass, no gradients on content surfaces (the Footer keeps its existing `from-muted/40 to-background`). No nested Card-in-Card, no `rounded-3xl`.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens.
- One `h1`; section `h2`s; card titles are `h3` (kit `CardTitle`).
- Icon chips are `aria-hidden`; decorative loop arrows are `aria-hidden`.
- Interactive targets keep `min-h-11` on mobile.

#### Personas

- **Prospective customer** (primary): understand the attach loop, then start a scan.
- **Island maintainer**: Landing is the chrome reference for `/blog`, `/terms`, `/privacy`.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| Landing keeps `Card` (not `OpsShell`) | page | It is marketing, not an ops console; the icon-chip atom is borrowed, the rail is not | Keep |
| Copy is i18n (`landing` + `common`) with no new keys added | page | Refresh reuses existing keys; no copy change | Keep |
| Feature grid is 9 `Card`s, frozen by count | test | The count assertion is the contract that the nine modules stay visible | Update only with a deliberate module change |
| HTML islands (`/blog`, `/terms`, `/privacy`) are string templates, not React | `backend/app/api/*_html.py` | SEO + no JS hydrate; they must rhyme this section manually | Named island slice if chrome changes |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## User guide (`/guide`)

Print §§0–8 and every SPA section above stay locked. This section documents the **editorial docs** surface at `/guide`. It is the one SPA page that was already designed on its own grammar (numbered gutter + tone chapters) and the last without a contract — this section records it, it does **not** redesign it.

### 0. Research Log (User guide)

- Reused the existing `components/guide/*` design. No new reference pull, no new palette.
- Sibling harvest: `SiemRail` rails, `OpsShell` icon-chip geometry (`h-8 w-8 rounded-md border border-border bg-muted/40`), `GuideNote`'s 2px `border-l-2` as the docs-local analogue of a rail.
- Current diagnosis: `/guide` renders 15 `GuideChapter` articles in a two-column TOC layout, with `GuideJumpMap`, `GuideMobileToc`, `GuideDesktopToc`, and `useActiveGuideSection` scroll-spy. It carries **0 `Card`** and **0 rails** — deliberately, because it is editorial docs, not an ops console. The only debt was the missing design contract.
- Imagen / Lazyweb: skipped — the design exists; AGENTS.md forbids extra deps for a docs slice.

**Direction (locked):** Keep the docs grammar exactly. The chapter's **numbered gutter** (`01`–`15`) is the surface's signature; a `runtime` chapter carries a **primary hairline** under the header, a `limits` chapter carries a **destructive border**. This is intentionally **not** the ops rail grammar — do not add `SiemRail`/`OpsShell` here.

### 1. Atmosphere & Identity

`/guide` is the operator handbook: 15 chapters from "open the account" to "limits that stay true". It reads like a reference manual (numbered, scannable, anchored), not like a console. It must stay calmer than every ops surface.

The one memorable moment: the **numbered gutter**. The left `01`–`15` column plus the group ranges in `GuideJumpMap` let a reader orient by number, and `runtime` / `limits` chapters are colour-coded by a single hairline / border.

Do **not** add rails, KPI strips, or a filled masthead. Do **not** merge guide chrome into the ops family.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Palatino.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Chapters, jump map, mobile TOC |
| Muted surface | `bg-muted/40` / `bg-muted/30` | Gutter, icon chips, intro, step number chips, pre |
| Ink | `--foreground` | Chapter `h2`, body |
| Meta | `--muted-foreground` | Kicker, gutter numbers, step text, notes |
| Accent | `--primary` `hsl(142 71% 45%)` | `runtime` hairline (`h-px bg-primary/40`), `GuideNote` left border, inline links |
| Limits | `border-destructive/30` | `limits`-tone chapter border |

Colour is **redundant** with the group label and the chapter title. Never colour-only meaning.

### 3. Typography

SPA scale. Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` `title` |
| Kicker / module count | `font-mono text-[10px] uppercase tracking-wider` | 500 | Header description |
| Chapter title | `text-xl font-semibold tracking-tight` | 600 | `GuideChapter` `h2` (anchor target) |
| Gutter number | `font-mono text-base sm:text-lg font-semibold tabular-nums` | 600 | `01`–`15` |
| Step chip number | `font-mono text-[11px] font-medium tabular-nums` | 500 | `::before` counters |
| Step / body | `text-sm leading-relaxed` | 400 | `Steps` items |
| Note / pre | `text-xs` / `text-[11px]` | 400 | `GuideNote`, `GuidePre` |
| TOC group label | `text-[10px] uppercase tracking-wider` | 500 | `GuideTocLinks` / desktop TOC |

Tabular numerals on gutter numbers, step counters, and jump-map ranges.

### 4. Spacing & Layout

4px base. `space-y-6` page stack, `pb-8`.

- **Page grid**: `lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8 2xl:grid-cols-[18rem_minmax(0,1fr)]`. Below `lg` the desktop TOC is `hidden`; the sticky mobile TOC takes over.
- **Chapter**: `rounded-lg border bg-card`; header row `flex items-stretch border-b`; gutter `w-12 sm:w-14`; body `space-y-4 p-4 md:px-5 md:py-5`.
- **Jump map**: `grid grid-cols-2 gap-2 lg:grid-cols-4`.
- **Desktop TOC**: `aside data-testid="guide-desktop-toc" className="hidden lg:block"` wrapping `sticky top-6 max-h-[calc(100svh-5rem)] overflow-y-auto`.
- **Mobile TOC**: `sticky top-0 z-30 -mx-4 mb-6 bg-background px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:-mx-6 md:px-6 lg:hidden`.

**Frozen contracts** (`src/test/UserGuide.test.tsx`): the 15 chapter `h2` names; `guide-desktop-toc` is `lg:block` and contains `.sticky` + `[data-slot='sidebar']`; **exactly 4** jump-map links (`#mulai`, `#jadwal`, `#guard`, `#tips`); ≥2 navs `aria-label="Guide sections"`; the mobile TOC bar is `sticky top-0 bg-background` and **not** `top-14`, and matches `safe-area-inset-top`; TOC toggle `aria-expanded` toggles; TOC links `min-h-11`; `sinexis-install-wget` + `guard-distro-install-commands` testids; the distro accordions (`Debian / Ubuntu` etc.) open/close and the install command is absent while closed; every cross-link href (`/host`, `/scan/ip`, `/assets`, `/uptime`, `/uptime/status-page`, `/schedules`, `#guard`) and the external `sinexis-install.sh` / `GitHub Release` links.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `GuideChapter` | `article` `relative overflow-hidden rounded-lg border bg-card`; optional tone strip; header row with numbered gutter + icon chip + `h2`; body | default / `runtime` (primary hairline) / `limits` (destructive border) |
| `Steps` | `<ol>` with `[counter-reset:guide-step]`; each `<li>` gets a `::before` `h-7 w-7` bordered mono chip | static |
| `GuideIntro` | `rounded-md border bg-muted/30 px-3 py-2.5 text-sm` | static |
| `GuideNote` | `border-l-2 border-primary bg-muted/30 px-3 py-2 text-xs` | static |
| `GuidePre` | `rounded-md border bg-muted/40 p-3 font-mono text-[11px] break-all` | optional `testId` |
| `GuideJumpMap` | `nav aria-label=jumpAria` + 4 group cards (`min-h-11 rounded-md border bg-card`), icon chip + label + mono range | active group → `bg-muted` |
| `GuideMobileToc` | sticky `lg:hidden` bar + `Card` trigger (`min-h-11`, `aria-expanded`) + collapsible `GuideTocLinks` | open / closed |
| `GuideDesktopToc` | `Sidebar collapsible="none"` in a `sticky` aside; `SidebarMenuButton` per section | `isActive` → `aria-current="true"` |

Scroll-spy: `useActiveGuideSection` drives `activeId`, which sets the jump-map highlight, the TOC `aria-current`, and the mobile trigger label.

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150–200ms | ease-out | Jump-map `hover:bg-muted/40`, TOC hover |
| Chevron | 150ms | ease-out | Mobile TOC `rotate-180` |

- GPU only. No ping, no layout animation.
- `prefers-reduced-motion`: no continuous animation on this page.

### 7. Depth & Surface

**borders-only.** No drop shadows anywhere on `/guide`. No glass, no gradients, no nested Card-in-Card. Depth comes from `border-border` + `bg-muted/*` steps.

| Type | Treatment | Use |
|------|-----------|-----|
| Chapter | `rounded-lg border border-border bg-card` | All 15 chapters |
| Gutter / chips / pre | `bg-muted/40` + `border-border` | Numbers, icons, code |
| Intro / note | `bg-muted/30` | Callouts |
| TOC card | kit `Card` | Mobile TOC only |

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Tone is redundant with the group label / chapter title.
- One PageHeader `h2`; each chapter title is its own `h2` with `id` = `TocId` and `scroll-mt-24`.
- Anchor links and TOC links keep `min-h-11` mobile targets.
- The mobile TOC trigger is a real `<button>` with `aria-expanded`.
- `prefers-reduced-motion`: no continuous animation.

#### Personas

- **New operator** (primary): jump map → a chapter → follow `Steps`.
- **Mobile reader**: sticky "On this page" trigger expands the section list.
- **Returning reader**: desktop TOC with scroll-spy highlights the current section.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `/guide` uses its own chapter grammar, not `OpsShell`/`SiemRail` | `components/guide/` | Editorial docs, not an ops console; forcing rails would break the numbered-gutter design | Keep |
| Guide copy is a large i18n catalog (`guide` ns, EN+ID) with frozen strings | page + locale | Asserted by `UserGuide.test.tsx`; changing copy needs matching test updates | Named i18n slice |
| Guide body copy still says `1001–1140` for WAF rule IDs | `guide` locale | Frozen by test; product events are now `1001–1164`. A copy refresh is a separate, test-touching change | Named copy slice |
| `GuideDesktopToc` reuses the app `Sidebar` primitive as a page TOC | `GuideToc.tsx` | Frozen by test (`[data-slot='sidebar']`); swapping to a bespoke list is a refactor | Keep |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |
