# Auth, profile & workspace
## Auth family (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`)

Print §§0–8 and SIEM / Guard / Assets / page-nav / Status / Uptime / Host / Dashboard / Scan detail above stay locked. This section is the **dark SPA** contract for the five public auth screens. They are **not** inside AppShell — `AuthLayout` owns the full-viewport canvas — so the shell grammar is applied to the auth card, not to a page.

### 0. Research Log (Auth)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; the layout owns the viewport) and Layer B `linear.app` (ops density, luminance steps, one accent). Same routing as the ops consoles, but **scaled down**: auth is a single centered island, not a console. Not Stripe marketing; not Linear indigo `#5e6ad2`.
- Sibling harvest: `SiemRail` + the `Shell` / `ShellHead` chrome from `/host` / `/dashboard` / `/scan/:id` / `/schedules`, `EmptyState` island grammar, `GuardPulse` (unused here — no live signal on auth).
- Current auth diagnosis: all five pages wrapped content in kit `Card className={AUTH_CARD_CLASS}` + `CardContent className="pt-6"` — a flat hairline card with no state signal. Status icons floated (`h-12 w-12 text-primary mx-auto`) with no chip; error / cooldown copy was bare colored `<p>`; Register / Forgot / Reset / Verify used raw `<label className="block text-xs text-muted-foreground">` while Login used kit `Label`; field wrappers were `space-y-2`.
- Imagen drafts: skipped — existing SPA + sibling shell grammar is the reference; no extra imagegen deps.
- Lazyweb pack: skipped this session — sibling shells are the harvest.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** A **quiet front door** on existing Sinexis SPA tokens. Signature: one centered auth card whose **2px rail encodes auth state** — primary (neutral form) → destructive (error) → amber (cooldown) → sky (verifying) → primary (success) — with the same rail repeating on every inline notice, and status icons moved into bordered chips. Green `--primary`, not Linear indigo. Sora + Red Hat Mono. Not a marketing hero, not a filled masthead.

### 1. Atmosphere & Identity

The auth screens are the gate to the product: sign in, open an account, recover a password, verify an email. They must feel like the same product as the ops consoles but **calmer** — one card, one decision, no sidebar.

The one memorable moment: the **card rail**. It changes colour with the auth state before the copy is read, so an error (destructive), a cooldown (amber), a verification in flight (sky), and a success (primary) are distinguishable at a glance. Inline notices carry the same rail, so the state reads consistently at both scales.

Do **not** use a filled green masthead, a generic icon-in-circle hero, or a second palette. Loading is the kit spinner inside a status chip.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Full viewport (`AuthLayout`) |
| Surface | `--card` + `border-border` / `border-border/80` | Auth card, notices |
| Ink | `--foreground` | Card title (`h1`), hints |
| Meta | `--muted-foreground` | Subtitle, labels, helper copy |
| Accent | `--primary` `hsl(142 71% 45%)` | Submit CTA, neutral rail, success rail + wash, success icon |
| Error | `bg-destructive` rail + `bg-destructive/[0.04]` wash | Login error, register/reset validation, verify failure; icon `text-destructive` |
| Warn | `bg-amber-600` rail + `bg-amber-500/[0.04]` wash | Rate-limit cooldown, verify email send failure; icon `TONE_TEXT.amber` |
| Verifying | `bg-sky-600` rail | `/verify-email` idle / no-token (check in progress) |
| Error text | `TONE_TEXT.red` | Danger notice copy; e2e selects it by `[data-testid="auth-notice-danger"]`, so the shade is free to move |

Rails are **redundant** with the notice copy / status icon. Never color-only status.

### 3. Typography

SPA scale. Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Card title | `text-xl` / `2xl:text-2xl` | 600 | `AuthLayout` `h1` (frozen) |
| Card subtitle | `text-sm` | 400 | `AuthLayout` subtitle + brand tagline |
| Field label | `text-xs font-medium` | 500 | Kit `Label` (all fields) |
| Body / hint | `text-xs` / `text-sm` | 400 | Notices, helper copy, `checkSpam` |
| Link | `text-sm` | 400 | `AUTH_SECONDARY_LINK` |

No tabular numerals needed — auth shows no counts or IDs.

### 4. Spacing & Layout

4px base. `AuthLayout` owns the viewport; there is **no** AppShell and **no** page-nav.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1.5 | 6px | Field label→control gap (`gap-1.5`) |
| --space-2 | 8px | Notice inner, form row gap |
| --space-3 | 12px | Card inner horizontal (plus the `pl-4` rail gutter) |
| --space-4 | 16px | Card padding, form field gap |
| --space-6 | 24px | Card vertical padding |

**Primitives** (`layout-skill`):

- **stack** — `AuthLayout` column: brand mark → tagline → switchers → title/subtitle → card.
- **page-grid** — not used; the card is a single column.
- **scroll-body-shell** — the layout owns the scroll (`min-h-dvh`).
- **list-detail** — not used.

Responsive:

- `<sm`: layout is top-aligned (`items-start`, safe-area top padding); the card is full width inside `max-w-*`.
- `≥sm`: layout centers vertically (`sm:items-center`).

`AuthLayout` internals are **frozen by unit test** (see §8): brand row, tagline classes, switcher row classes, `maxWidth` map, and `AUTH_CARD_CLASS` / `AUTH_SECONDARY_LINK` string contracts. Do not restructure that DOM.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `AuthCard` (`components/auth/AuthCard.tsx`) | kit `Card` + `AUTH_CARD_CLASS` + `relative overflow-hidden pl-4` + `SiemRail(authRailClass(tone))` + optional `authWashClass(tone)` | primary / success / danger / warn / info |
| `AuthCardBody` | `px-4 py-6`, optional `space-y-4 text-center` | form (`center=false`) / status (`center=true`) |
| `AuthStatusIcon` | `mx-auto h-12 w-12` bordered chip (`CHIP_CLASS[tone]`) + icon (`ICON_CLASS[tone]`), optional `animate-spin` | success (primary) / danger (destructive) / warn (amber) / info (primary) |
| `AuthNotice` | `relative overflow-hidden rounded-md border bg-card px-3 py-2 pl-4` + rail + `p.text-xs` (`NOTICE_TEXT[tone]`), optional `role` | danger (`TONE_TEXT.red`) / warn (`TONE_TEXT.amber`) / success (`text-primary-text`) / info (`text-muted-foreground`) |

Per page:

| Page | Card tone | Notes |
|------|-----------|-------|
| `/login` | danger when `error`, else primary | Error notice carries `role="alert"` (frozen); resend feedback is a success notice |
| `/register` | danger on validation/server error, else primary; success view success (warn when `emailSent === false`) | Success uses `AuthStatusIcon` (CheckCircle / AlertTriangle) |
| `/forgot-password` | danger on error, else primary; success view success | Cooldown is a warn notice |
| `/reset-password` | danger (invalid token) / warn (cooldown) / danger (validation) / primary; success view success | `AlertCircle` on the invalid-token view |
| `/verify-email` | info (no token / verifying) → success → danger | `Mail` chip on the resend view; `Loader2` spins while verifying |

`GoogleSignInButton` is unchanged (frozen `google-sign-in` / `google-sign-in-btn`).

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150–200ms | ease-out | Link / input hover, `transition-colors` |
| Spin | CSS `animate-spin` | linear | Verify chip while checking; submit spinner (kit Button) |
| Press | kit Button `scale` | — | Do not restyle kit |

- GPU only. No layout animation, no ping.
- `prefers-reduced-motion`: the kit spinner is the only continuous animation; keep it.

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows, no nested Card-in-Card, no `rounded-3xl`, no filled masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| Auth card | kit `Card` + `AUTH_CARD_CLASS` + `pl-4` + `SiemRail` | All five screens |
| Notice | `rounded-md border` + `bg-card` + `SiemRail` + tone wash | Error / cooldown / success inline |
| Status chip | `h-12 w-12 rounded-md border` + tone bg | Success / warn / danger / verifying |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | Card + notices |

The card keeps the frozen `border-border/80 shadow-none` hairline — the rail is the added signal, not a restyle of the kit.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with the notice copy / status icon.
- Heading stays `AuthLayout` `h1` (e2e asserts `page.locator("h1")` text on every auth route).
- Every field has a kit `Label` + `htmlFor` (Register / Forgot / Reset / Verify moved off raw labels).
- Kit only: no native `<select>`; primary actions are `Button`.
- **Frozen by e2e** (`frontend/e2e/auth-flow.spec.ts`, `forgot-password.spec.ts`, `reset-password.spec.ts`, `verify-email.spec.ts`): `h1` copy; `input#email` / `input#password` / `input#confirmPassword` / `input[type='email']`; `button[type='submit']`; `a[href='/login']` / `a[href='/register']`; **`[data-testid="auth-notice-danger"]`** on register + reset validation errors; `getByRole("alert")` (exactly one) on login error; `span.font-mono` "SINE" / `span.text-primary` "XIS" (BrandMark); `.text-destructive` on the verify error icon; the verify email placeholder and resend button copy.
- **Frozen by unit test** (`AuthLayout.test.tsx`): `AUTH_SECONDARY_LINK` matches `/min-h-11/` + `/min-w-11/`; `AUTH_CARD_CLASS` matches `/border-border\/80/` + `/shadow-none/`; tagline classes `px-2 text-pretty text-sm`; switcher row classes incl. `[&_button[aria-pressed=true]]:!bg-secondary`; `.max-w-3xl` + `2xl:max-w-4xl`; `theme-switcher` / `language-switcher` testids.
- `prefers-reduced-motion`: no continuous animation beyond the spinner.

#### Personas

- **New visitor** (primary): land on `/register`, open an account, hit the verify screen.
- **Returning user**: `/login` → dashboard; Google sign-in where enabled.
- **Locked-out user**: `/forgot-password` → `/reset-password` (invalid-token vs form vs success).
- **Rate-limited**: cooldown renders as an amber notice and disables the submit.
- **Unverified**: login error offers the resend path (verify notice).

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `AuthCard` composes the frozen `AUTH_CARD_CLASS` string | authChrome / AuthLayout | Unit test pins the string; composing keeps the contract without a kit restyle | Named kit split if the card is redesigned again |
| `AuthLayout` inner DOM left intact | layout | Eight unit assertions pin brand row, tagline, switcher classes, and maxWidth | Named layout refactor |
| Auth pages keep local form state + handlers | 5 pages | This slice restyles chrome only; extracting a form hook mixes visual with module work | Named extract |
| Danger notice copy uses `TONE_TEXT.red`, not `text-destructive` | AuthNotice | Auth e2e selects the notice by testid, so the class is free to move; unifying on `--destructive` is a tone decision | Named token migration |
| Duplicate status-card markup across 5 pages | pages | Each has distinct copy + actions; a shared `AuthStatusView` is a follow-up | Named extract |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## Profile console (`/profile`)

Print §§0–8 and SIEM / Guard / Assets / page-nav / Status / Uptime / Host / Dashboard / Scan detail / Schedules / Auth above stay locked. This section is the **dark SPA** contract for the signed-in account page at `/profile` — identity, account KPIs, change password, update email. It is the personal counterpart to the auth family (public) and workspace settings (org).

### 0. Research Log (Profile)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as `/guard` / `/siem` / `/assets` / `/uptime` / `/host` / `/dashboard` / `/scan/:id` / `/schedules`, and the same rail vocabulary as the auth family. Not Stripe marketing; not Linear indigo `#5e6ad2`.
- Sibling harvest: `AuthCard` state rail (primary → destructive → amber → primary/success), `HostKpiStrip` / `ScanKpiStrip` / `DashboardKpiStrip` (`StatTile` + `SiemRail`), the `Shell` / `ShellHead` hairline pattern from `/host` / `/dashboard` / `/scan/:id` / `/schedules`, `EmptyState` island grammar.
- Current `/profile` diagnosis: `profile-identity` was a flat `article` (`rounded-lg border border-border bg-card`) with a plain muted avatar; the three `StatTile`s were flat `rounded-md` border tiles with no rail; the change-password / update-email cards were kit `Card` + `CardHeader` + `CardContent` with no rail and no state signal; error / cooldown copy used kit `Alert` (default + destructive) rather than a railed notice; submit buttons were `w-full sm:w-auto` with no 44pt mobile target.
- Imagen drafts: skipped — existing SPA + sibling P15 grammar is the reference; no extra imagegen deps.
- Lazyweb pack: skipped this session — sibling P15 is the harvest.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** An **account console** on existing Sinexis SPA tokens. Signature: an identity band whose **primary rail carries the avatar + email + badges**, then a three-tile KPI strip whose **rails encode account state** (verified primary / unverified amber, admin primary / operator muted, credits primary / zero muted), then two form shells whose **rail encodes the last submit outcome** (primary idle → destructive error → amber cooldown → primary success). Green `--primary`, not Linear indigo. Sora + Red Hat Mono. Not nested Card-in-Card, not a filled masthead.

### 1. Atmosphere & Identity

`/profile` is where a signed-in user reads and edits their own account: current email, verification, access level, credits, password. It must feel like the Guard/SIEM/Assets/Uptime/Host/Dashboard/ScanDetail/Schedules ops family inside AppShell — same rail grammar, same hairline shells — while reusing the auth family's state-rail vocabulary for the two forms.

The one memorable moment: the **identity band**. The avatar chip, the mono email, the copy action, and the verification / access / org badges all sit behind one primary rail, so the account's identity reads as a single object before any form.

Do **not** use a filled green masthead, a marketing hero, or a generic icon-in-circle. No loading skeleton is needed — the page renders from the auth store synchronously.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Identity band, KPI tiles, form shells, notices |
| Ink | `--foreground` | Email, KPI values, shell titles |
| Meta | `--muted-foreground` | Labels, hints, org slug, `Password required to confirm` |
| Accent | `--primary` `hsl(142 71% 45%)` | Identity rail, avatar chip, verified / admin / credits rail, copy-confirm tick, submit CTA |
| Warn | `bg-amber-600` rail + `bg-amber-500/[0.04]` wash | Unverified tile, rate-limit cooldown |
| Error | `bg-destructive` rail + `bg-destructive/[0.04]` wash | Password / email error notice |
| Idle | `bg-border` rail | Operator access, zero credits |
| Success wash | `bg-primary/5` | Form shell after a successful submit |

Rails are **redundant** with the Badge / KPI value / notice copy. Never color-only status.

### 3. Typography

SPA scale. Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` "Profile" (frozen) |
| Subtitle | `text-sm` | 400 | `Manage your account email and password` (frozen) |
| Avatar initials | `font-mono text-sm` | 600 | `US` chip |
| Identity email | `font-mono text-sm sm:text-base` | 400 | Current email |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Verification / Access / Credits |
| KPI value | `font-mono text-lg font-bold tabular-nums` (`text-xl` when emphasized) | 700 | Verified / Operator / credits |
| Shell title | `text-sm font-medium tracking-wide` | 500 | Change password / Update email |
| Shell hint | `text-xs` | 400 | One-line description under the title |
| Notice copy | `text-xs` | 400 | Cooldown / error |
| Helper | `text-[10px]` | 400 | `Password required to confirm` (frozen) |

Tabular numerals on KPI values. Body copy is English on this page (frozen by unit test).

### 4. Spacing & Layout

4px base. **No** filter bar on `/profile`.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1.5 | 6px | Field label→control gap (`gap-1.5`) |
| --space-2 | 8px | Notice inner, badge gap |
| --space-3 | 12px | KPI tile gap, shell head pad |
| --space-4 | 16px | Shell body pad, identity pad, form field gap |
| --space-6 | 24px | Page stack (`space-y-6`), form grid gap |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`): header → identity → KPI → forms.
- **page-grid** — KPI `grid-cols-1 gap-3 sm:grid-cols-3`; forms `grid gap-6 lg:grid-cols-2 lg:items-start`.
- **scroll-body-shell** — AppShell owns document scroll.
- **list-detail** — **not** used.

Responsive:

- `<sm`: identity band stacks (`flex-col`), actions wrap under it; form buttons are `min-h-11 w-full`.
- `≥sm`: identity band is a row (`sm:flex-row sm:items-start sm:justify-between`); form buttons are `sm:min-h-10 sm:w-auto`.

**Frozen contracts** (`Profile.test.tsx` + `e2e/profile.spec.ts`): heading `Profile`; `queryByTestId("account-nav")` absent; current email text; `new@example.com` placeholder starts empty; `Password required to confirm`; subtitle copy; `profile-identity` + `profile-kpis` testids; initials `US`; `Verified` / `Operator` / `/Acme/`; links `Credit history` → `/credit-history` and `Workspace` → `/settings/workspace`; credits value `10`; `Copy email` button; **exactly 3** inputs with placeholder `••••••••` (2 password + 1 email-confirm); ids `profile-email` / `profile-password` / `current-password` / `new-password` / `confirm-password`; button names `Update email` / `Change password`; headings `Profile` / `Change password`; toast copy `Profile updated` / `Password changed` (must stay **unique** — do not duplicate inline); `Wrong password` / `Invalid current password`; `/Too many attempts. Wait 20s/` / `/Too many attempts. Wait 60s/`; `Updating...` / `Changing...`; e2e `aside` + `Dasbor`.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| Identity band (`profile-identity`) | `relative overflow-hidden rounded-lg border bg-card pl-4` + primary `SiemRail` + bordered avatar chip + mono email + copy + badges | static (primary) |
| `StatTile` | `relative min-w-0 overflow-hidden rounded-lg border bg-card px-4 py-3 pl-4` + `SiemRail(tone)` | verified success / unverified warn / admin primary / operator idle / credits primary / zero idle |
| `ProfileShell` | kit `Card` + `relative overflow-hidden pl-4` + `SiemRail(tone)` + `profileWashClass(tone)` | primary / danger / warn / success / idle |
| `ProfileShellHead` | `border-b border-border px-4 py-3` + icon chip + `h3` + hint | static |
| `ProfileShellBody` | `px-4 py-4` | static |
| `ProfileNotice` | `relative overflow-hidden rounded-md border bg-card px-3 py-2 pl-4` + rail + `text-xs` (`NOTICE_TEXT[tone]`) | danger (`role="alert"`) / warn (`role="status"`) |
| `PasswordField` | kit `Label` + `flex min-w-0 flex-col gap-1.5` + `Input pr-10` + icon toggle (native `<button>`, allowed icon toggle) | visible / hidden |

Per shell:

| Shell | Tone source |
|-------|-------------|
| Change password | `formTone({ cooldown, error: Boolean(passwordError), success: passwordSuccess })` |
| Update email | `formTone({ cooldown, error: Boolean(error), success: profileSuccess })` |

Success is communicated by the **shell wash + toast**; no inline success copy (the toast text is unique by contract).

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150–200ms | ease-out | Button / input hover, copy tick |
| Spin | CSS `animate-spin` | linear | Submit spinner (kit Button) |
| Press | kit Button `scale` | — | Do not restyle kit |

- GPU only. No layout animation, no ping.
- `prefers-reduced-motion`: only the kit spinner animates.

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows, no nested Card-in-Card, no `rounded-3xl`, no filled masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| Identity band | `rounded-lg border bg-card` + primary rail | Identity |
| KPI tiles | `rounded-lg border bg-card` + rail | Verification / Access / Credits |
| Form shells | kit `Card` + `pl-4` + rail + tone wash | Change password / Update email |
| Notices | `rounded-md border bg-card` + rail + tone wash | Cooldown / error |
| Rail | `absolute inset-y-2 left-0 w-0.5 rounded-full` (`SiemRail`) | Identity, tiles, shells, notices |

P15 flatten: the KPI strip is **not** inside PageHeader and **not** inside a form shell. Header is title + subtitle only (no actions on this page).

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / KPI value / notice copy.
- Heading remains PageHeader `h2` "Profile"; shell titles are `h3`.
- Every field has a kit `Label` + `htmlFor`; password visibility uses native icon-toggle `<button>` (allowed per AGENTS.md).
- Primary actions are kit `Button`; no native `<select>`.
- `role="alert"` on error notices, `role="status"` on cooldown notices.
- `prefers-reduced-motion`: only the kit spinner animates.

#### Personas

- **Signed-in user** (primary): read identity + KPIs → change password / update email.
- **Unverified user**: amber verification tile; the auth family owns the resend path.
- **Rate-limited**: amber shell + amber notice + disabled submit with countdown.
- **Zero credits**: muted credits tile (no alarm colour).
- **Operator vs admin**: muted vs primary access tile.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| English-only copy on `/profile` | page | Frozen by `Profile.test.tsx`; i18n-ising needs matching test updates | Named i18n slice |
| `profileSuccess` / `passwordSuccess` only gate the error notice + wash | page | Success copy is the toast; adding inline copy would break the unique-text contract | Keep; revisit with a test update |
| `Profile.tsx` keeps local form state + handlers | page | This slice restyles chrome only; extracting a form hook mixes visual with module work | Named extract |
| `PasswordField` duplicated from the auth pages' pattern | profile | Auth uses inline fields; a shared field is a follow-up | Named extract |
| `profileChrome` wash helpers mirror `authChrome` | chrome | Two small tone maps beat a premature shared ops-chrome module | Keep until a named ops-chrome PR |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |

## Workspace settings console (`/settings/workspace`)

Print §§0–8 and SIEM / Guard / Assets / page-nav / Status / Uptime / Host / Dashboard / Scan detail / Schedules / Auth / Profile above stay locked. This section is the **dark SPA** contract for the organization surface at `/settings/workspace` — active workspace identity, members, invites, billing, pilot checklist. It closes the account/org area (auth → profile → workspace).

### 0. Research Log (Workspace)

- Embedded refs: shortlisted `linear.app` / `stripe` / `supabase` → picked Layer A `redesign-skill` + `layout-skill` (stack + page-grid; AppShell owns document scroll) and Layer B `linear.app` (ops density, luminance steps, one accent, tabular mono). Same routing as `/guard` / `/siem` / `/assets` / `/uptime` / `/host` / `/dashboard` / `/scan/:id` / `/schedules`, plus the state-rail vocabulary from auth / profile. Not Stripe marketing; not Linear indigo `#5e6ad2`.
- Sibling harvest: `AuthCard` / `ProfileShell` state rails (primary → destructive → amber → primary/success), `HostKpiStrip` / `DashboardKpiStrip` (`StatTile` + `SiemRail`), the `Shell` / `ShellHead` hairline pattern, `EmptyState` island grammar (already present here as `EmptyIsland`), `HostHitsList` (rail inside the first cell, mobile card + desktop row).
- Current `/settings/workspace` diagnosis: every section was a flat kit `Card` + `CardHeader` + `CardContent` with no rail (15 `CardHeader` uses); the org identity card, members, invite form, pending invites, billing, and pilot checklist were visually identical shells; the three `StatTile`s were flat `rounded-md` tiles; error / cooldown copy used kit `Alert`; member / invite rows were flat cards and table rows with no rail; invoice cards had no rail.
- Imagen drafts: skipped — existing SPA + sibling P15 grammar is the reference; no extra imagegen deps.
- Lazyweb pack: skipped this session — sibling P15 is the harvest.
- Skipped lanes: react-grab / react-scan / react-doctor — AGENTS.md forbids extra deps for a visual slice.

**Direction (locked):** An **org console** on existing Sinexis SPA tokens. Signature: an identity shell whose rail is primary, then three KPI tiles whose **rails encode org state** (members primary / none muted, invites primary / none muted, invoices by worst status), then railed member / invite rows (role tone, pending amber), a billing shell whose rail tracks the worst invoice status, and a primary pilot-checklist shell. Green `--primary`, not Linear indigo. Sora + Red Hat Mono. Not nested Card-in-Card, not a filled masthead.

### 1. Atmosphere & Identity

`/settings/workspace` is the organization surface: who is in the workspace, who is invited, what is billed, and how a pilot rolls out. It must feel like the Guard/SIEM/Assets/Uptime/Host/Dashboard/ScanDetail/Schedules/Profile ops family inside AppShell — same rail grammar, same hairline shells.

The one memorable moment: the **invoice rail**. A paid workspace reads primary, a sent one amber, a void one destructive — and the same tone repeats on the billing shell, so an operator sees the money state before opening a card.

Do **not** use a filled green masthead, a marketing hero, or a generic icon-in-circle. Loading is skeleton rows, not a spinner in a Card. Members loading = `TableRowSkeleton rows={3} columns={3}`; invites = `rows={2} columns={4}`; billing = `data-testid="workspace-billing-loading"` — a `grid gap-3 lg:grid-cols-2` of 2 invoice-card-shaped skeletons (`rounded-lg border p-4`, 3 lines), matching the loaded invoice grid.

### 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette. No `#0a7`. No Linear indigo.

| Role | Token / class | Usage |
|------|----------------|-------|
| Canvas | `--background` | Page |
| Surface | `--card` + `border-border` | Identity / members / invite / invites / billing / checklist shells, mobile rows, invoice cards |
| Ink | `--foreground` | Org name, KPI values, shell titles |
| Meta | `--muted-foreground` | Slug, hints, dates, counts |
| Accent | `--primary` `hsl(142 71% 45%)` | Identity rail, member/invite rails, owner badge, paid invoice rail, submit CTAs |
| Pending / sent | `bg-amber-600` rail + `bg-amber-500/[0.04]` wash | Pending invites, sent invoices |
| Danger | `bg-destructive` rail + `bg-destructive/[0.04]` wash | Void invoices, form / accept errors |
| Member role | `bg-sky-600` rail | `member` role rows |
| Idle | `bg-border` rail | Viewer role, empty lists, no invoices |

Rails are **redundant** with the Badge / KPI value / notice copy. Never color-only status.

### 3. Typography

SPA scale. Sora Variable (`--font-sans`), Red Hat Mono Variable (`--font-mono`).

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Page title | `text-2xl` / `md:text-3xl` | 600 | PageHeader `h2` `Workspace` (frozen, level 2) |
| Subtitle | `text-sm` | 400 | `roleLine` / `subtitleMembers` |
| Org name | `text-base` | 600 | Active workspace name |
| Shell title | `text-sm font-medium tracking-wide` | 500 | `h3` — Members / Invite member / Pending invites / Billing / Create organization |
| Shell hint | `text-xs` | 400 | One-line description under the title |
| KPI label | `text-[10px] uppercase tracking-wider` | 500 | Members / Pending invites / Invoices |
| KPI value | `font-mono text-lg font-bold tabular-nums` (`text-xl` when emphasized) | 700 | Counts |
| Mono record | `font-mono text-xs` / `text-[11px]` | 400 | Slug, email, dates, invite URL |
| Table head | `text-[10px] uppercase tracking-wider` | 500 | Email / Role / Joined / Expires / Action |

Tabular numerals on counts and dates. Body copy stays the i18n `workspace` catalog (EN+ID).

### 4. Spacing & Layout

4px base. **No** filter bar.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1.5 | 6px | Field label→control gap |
| --space-2 | 8px | Row inner, notice inner |
| --space-3 | 12px | KPI gap, form row gap |
| --space-4 | 16px | Shell head/body pad, identity pad |
| --space-6 | 24px | Page stack (`space-y-6`), grid gap |

**Primitives** (`layout-skill`):

- **stack** — page sections (`space-y-6`): header → accept → create → identity → members/invite grid → invites → billing → checklist.
- **page-grid** — KPI `grid-cols-1 gap-3 sm:grid-cols-3`; members/invite `grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start`; invoice cards `grid gap-3 lg:grid-cols-2`.
- **scroll-body-shell** — AppShell owns document scroll; the invite shell is `xl:sticky xl:top-6`.
- **list-detail** — **not** used.

Responsive:

- `<md`: member / invite rows are cards (`md:hidden`) with a leading rail; form buttons full width.
- `≥md`: member / invite rows are `table-fixed` tables (`hidden md:block`) with the rail inside the first cell; the table is wrapped in a bordered rounded container.

**Frozen contracts** (`WorkspaceSettings.test.tsx`): PageHeader `h2` matching `/workspace/i`; `account-nav` absent; `pilot-checklist` present with `Pilot checklist` copy, `pilot-link-assets` → `/assets`, `pilot-link-schedules` → `/schedules`, `pilot-link-credits` absent; checklist hidden with no org; `Active workspace` + slug text; **members heading is an `h3`** matching `/members/i` and precedes `workspace-billing`, which precedes `pilot-checklist`; `invite-form-card` + `workspace-billing` present; `invite-submit` text exactly `Send invite` (not `Create invite`); `invite-link-box` / `copy-invite-link` absent initially; `workspace-billing-empty` copy with **no** self-serve upgrade and no admin link for non-admins; `workspace-billing-admin-link` → `/admin/invoices` for platform admins; `workspace-billing-error` present (and not `-empty`) on load failure; invoice bank copy `Transfer to …`; `invoice-print` / `invoice-pdf` / `invoice-print-sheet` / `invoice-print-bank`; `members-list`; `invites-list`; `workspace-invites-empty`.

### 5. Signature Components & States

| Primitive | Anatomy | States |
|-----------|---------|--------|
| `WorkspaceShell` | kit `Card` + `relative overflow-hidden pl-4` + `SiemRail(workspaceRailClass(tone))` + optional wash | primary / danger / warn / info / success / idle |
| `WorkspaceShellHead` | `border-b border-border px-4 py-3` + icon chip + `h3` + hint + optional aside | static |
| `WorkspaceShellBody` | `px-4 py-4` | static |
| `WorkspaceIconChip` | `h-8 w-8 rounded-md border bg-muted/40` + muted icon | static |
| `WorkspaceNotice` | `relative overflow-hidden rounded-md border bg-card px-3 py-2 pl-4` + rail + `text-xs` | danger (`role="alert"`) / idle (`role="status"`) |
| `StatTile` | `relative min-w-0 overflow-hidden rounded-lg border bg-card px-4 py-3 pl-4` + `SiemRail(tone)` | members / invites / invoices by `countTone` / `invoiceListTone` |
| Member row | mobile card `relative … pl-4` + rail; desktop first cell `relative pl-4` + rail | owner primary / admin success / member sky / viewer muted |
| Invite row | mobile card + rail; desktop first cell + rail | pending amber |
| Invoice card (`workspace-invoice-{id}`) | `relative overflow-hidden rounded-lg border bg-card pl-4` + `SiemRail(invoiceTone)` | paid primary / sent amber / void destructive / draft muted |
| `EmptyIsland` | `rounded-xl border border-border bg-muted/40` | no org / no members / no invites / no invoices |
| Billing shell (`workspace-billing`) | `WorkspaceShell` + `SiemRail(invoiceListTone)` + wash | idle / success / warn / danger |

Shell tone sources: accept invite → `acceptError ? danger : primary`; create org → `formTone({error, pending})`; invite form → `formTone({error, pending})`; members → `membersQuery.data?.length ? primary : idle`; pending invites → `pendingCount ? warn : idle`; billing → `invoiceListTone(statuses)`; checklist → primary.

### 6. Motion

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150–200ms | ease-out | Row hover `bg-muted/50`, accordion |
| Spin | CSS `animate-spin` | linear | Submit spinner (kit Button) |
| Press | kit Button `scale` | — | Do not restyle kit |

- GPU only. No layout animation, no ping.
- `prefers-reduced-motion`: only the kit spinner animates.

### 7. Depth & Surface

**borders-only** + 2px rails. No glass, no drop shadows, no nested Card-in-Card, no `rounded-3xl`, no filled masthead.

| Type | Treatment | Use |
|------|-----------|-----|
| Shells | kit `Card` + `pl-4` + rail + tone wash | All sections |
| KPI tiles / rows / invoice cards | `rounded-lg border bg-card` + rail | Identity KPIs, members, invites, invoices |
| Empty islands | `rounded-xl border border-border bg-muted/40` | Empty states |
| Tables | `rounded-md border` wrapper + rail inside the first cell | Desktop members / invites |

P15 flatten: the KPI strip lives **inside** the identity shell (it is that shell's body), not in PageHeader. Header is title + subtitle only.

### 8. Accessibility Constraints & Accepted Debt

#### Constraints

- WCAG 2.2 AA contrast on SPA tokens. Rails are redundant with Badge / KPI value / notice copy.
- PageHeader `h2` is the only level-2 heading; shell titles are `h3` (frozen for Members).
- Every field has a kit `Label` + `htmlFor`; Selects are kit only.
- Primary actions are kit `Button`; `role="alert"` on error notices, `role="status"` on informational.
- `prefers-reduced-motion`: only the kit spinner animates.

#### Personas

- **Owner / admin** (primary): read identity + KPIs → invite → revoke → billing → pilot checklist.
- **Viewer / member**: invite form and billing hidden; `onlyAdminsInvite` note.
- **Platform admin**: empty billing links to `/admin/invoices`.
- **Invitee**: accept-invite shell (danger on failure).
- **Billing state**: paid / sent / void rail on the shell and each card.

#### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `WorkspaceSettings.tsx` keeps queries + mutations + lists in one file (1084 LOC) | page | This slice restyles chrome only; splitting into panels mixes visual with module work | Named extract |
| Duplicate mobile card + desktop table markup for members / invites | page | Frozen `members-list` / `invites-list` render both; `useIsMobile` would drop one tree | Named a11y slice |
| `WorkspaceInvoiceCard` gains a rail but keeps its internal layout | invoice | Billing surface needs the same rail; restructuring the card is a separate slice | Named refactor |
| `workspaceChrome` tone maps mirror `authChrome` / `profileChrome` | chrome | Small per-surface tone maps beat a premature shared ops-chrome module | Keep until a named ops-chrome PR |
| `invoiceTone` lives in `workspaceChrome` but is consumed by `WorkspaceInvoiceCard` | chrome | One tone vocabulary for the billing surface; a shared `invoiceChrome` is a follow-up | Named extract |
| Print contract stays invoice-only (see the print specs) | print specs | Multiple SPA surfaces; merging would pollute print | Keep split |
