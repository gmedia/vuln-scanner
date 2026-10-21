# Subscription (`/settings/subscription`)

## 0. Research Log

- Reused the account-surface grammar from `design/auth.md` (`/settings/workspace`): `PageHeader`, `WorkspaceShell`, `WorkspaceNotice`, `EmptyState`, and the invoice card/print pair.
- Reused the capacity grammar from `design/content.md` (`/credit-history`): equal filter grid, `StatTile` strip, and the 80% warn / 100% cap quota scale.
- Reused the plan catalog language from `design/admin.md` (`/admin/skus`): one table for à-la-carte list prices, mono tabular IDR, and a locked-price notice.
- Rejected a marketing pricing page: this surface is authenticated, org-scoped, and read-only until ops issues an invoice.

**Direction (locked):** one quiet account page. The plan summary is the anchor; capacity meters and the plan grid sit below it; invoices are the audit trail, not the hero. No checkout theatre, no second palette, no gradient “popular” card.

## 1. Atmosphere & Identity

The page answers three questions in order: **what am I paying for**, **how much capacity is left**, and **what has been billed**. It is a finance-adjacent account surface, not a sales page.

The one memorable moment is the **plan summary rail**: the 2px rail and the status badge agree (green active, amber awaiting payment, destructive expired), so a workspace owner can read the billing state before reading a number.

## 2. Color

Reuse `frontend/src/index.css` `:root` / `.dark`. No second palette.

| Role | Token / class | Usage |
|---|---|---|
| Accent | `--primary` `hsl(142 71% 45%)` | Active plan rail, current-plan card border, progress fill |
| Readable green | `--primary-text` | Plan feature checks and links |
| Warn | `bg-amber-600` / `toneWash("warn")` | Awaiting payment, pending request, ≥80% capacity |
| Danger | `--destructive` | Expired period, 100% capacity |
| Info | `bg-sky-600` | Draft invoice, Enterprise quote |
| Idle | `bg-border` | Not invoiced, canceled request |

All status colours route through `components/subscription/subscriptionChrome.ts` (`planTone`, `planBadgeVariant`) and `lib/toneMap.ts`. Do not write `text-green-700` or a new hex.

## 3. Typography

- Page title: `PageHeader` `h2` `text-2xl md:text-3xl`.
- Shell titles: shared `h3` `text-sm font-medium tracking-wide`.
- Plan price: `font-mono text-2xl font-semibold tabular-nums`.
- Capacity values: `StatTile` mono tabular value.
- Money and dates: `font-mono tabular-nums`.
- Body copy: `text-xs`/`text-sm text-muted-foreground`; no body text below 12px.
- Tier names: sentence case in i18n (`Basic`, `Pro`, `Multi`, `Enterprise`), never raw lowercase as the only label.

## 4. Spacing & Layout

- Page stack: `w-full space-y-6`.
- Summary shell: `WorkspaceShell` + `WorkspaceShellHead` + `WorkspaceShellBody className="space-y-4"`.
- Capacity: `StatGrid className="lg:grid-cols-5"`; four product tiles + one workspace-seat tile.
- Plan grid: `grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4`; each `Card` is `flex h-full flex-col`.
- À-la-carte table: `overflow-hidden rounded-md border border-border` + kit `Table`.
- Invoice list: `ul grid gap-3 lg:grid-cols-2` + `WorkspaceInvoiceCard`.
- Mobile: one column everywhere; the plan grid stacks; invoice cards stack; table rows become the existing mobile cards only where a table is present.
- Filter control: `h-10 min-h-10`, label + `Select`, equal `gap-3` rhythm.

## 5. Signature Components & States

| Primitive | Anatomy | States |
|---|---|---|
| Plan summary (`subscription-summary`) | `WorkspaceShell` + head + plan name/price/period + status badge | active / grace / pending_payment / draft / expired / unbilled / enterprise |
| Read-only notice (`subscription-read-only`) | `WorkspaceNotice` above every other notice; `tone="warn"` for overdue, `tone="danger"` for ended | overdue / canceled |
| Billing notice (`subscription-past-due` / `-cancel-scheduled` / `-grace`) | `WorkspaceNotice tone="warn"` above the pending-request notice; only one renders | past_due / cancel-at-period-end / grace |
| Payment history (`subscription-attempts`) | bordered rows under the invoice list, manager-only | empty / list |
| Capacity tile (`subscription-usage-*`) | `StatTile` + `Progress` + quota label | ok / warn ≥80% / cap 100% / **over seat** (`used > limit`) / custom limit |
| Plan card (`subscription-plan-*`) | `Card` + title + price + capacity list + footer CTA | current (disabled, primary border) / upgrade / downgrade / request-only |
| Enterprise card | `Card` with no price | quote-only |
| À-la-carte table (`subscription-alacarte-table`) | 4 products × 3 tiers, list price + seats | static |
| Invoice shell (`subscription-invoices`) | `WorkspaceShell` + status `Select` + card grid | loading / error / empty / list / admin-only |
| Request dialog | controlled `AlertDialog` + `Textarea` + submit | idle / pending / error |
| FAQ | `Accordion` | collapsed / expanded |

Notice precedence: `read_only` → `past_due` → `cancel_at_period_end` → `grace`. The read-only notice is informational and may stack with a plan notice; the other three never stack.

Over-seat precedence: `used > limit` renders "Over by N" instead of "Capacity full". The bar stays capped at 100%.

Frozen testids: `subscription-page`, `subscription-summary`, `subscription-usage-over-{product}`, `subscription-past-due`, `subscription-cancel-scheduled`, `subscription-grace`, `subscription-attempts`, `subscription-attempts-empty`, `subscription-usage-{product}`, `subscription-usage-workspace`, `subscription-plans`, `subscription-plan-{tier}`, `subscription-plan-enterprise`, `subscription-alacarte-table`, `subscription-invoices`, `subscription-invoices-empty`, `subscription-cancel-request`, `subscription-request-note`, `subscription-request-submit`, `subscription-no-org`, `subscription-error`.

## 6. Motion

- Hover on plan cards: border colour only, `transition-colors` 150ms.
- Progress fill: existing 500ms ease-out.
- Dialog: kit defaults.
- No entrance animation, no count-up, no confetti.

## 7. Depth & Surface

Borders-only. `Card` + `border-border`; rails are 2px `SiemRail` via `WorkspaceShell`. No shadows, no glass, no nested Card-in-Card. The summary rail and the plan-card current border are the only emphasis.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- One `h2` (`PageHeader`); shell titles are `h3`; section heading for capacity is `h3`.
- Every form control has a visible `Label` + `htmlFor` (request note, invoice status filter).
- Status is not colour-only: badge text is always present; progress has an accessible label.
- Plan CTA is disabled for the current plan and for roles without `can_request_change`.
- Mobile buttons are ≥44px (`min-h-11`).
- `Select` is kit-only; no native `<select>`; no `window.confirm`.
- The request dialog explains that the plan does **not** change immediately.

### Accepted Debt

| Item | Location | Why accepted | Exit |
|---|---|---|---|
| Request is a dialog, not a dedicated checkout route | `pages/Subscription.tsx` | Phase 1 is ops-issued invoice; no payment gateway | Phase 2 checkout |
| Annual is display/request only | same | No annual invoice support in `sinexis-invoice-v1` | Annual invoice slice |
| Bundle savings not shown as a badge | same | Guard is free with Host; the à-la-carte sum double-counts Guard | Resolve bundle arithmetic |
| Guard sync may exceed its seat count | `services/guard_apply.py` | Wazuh sync must not drop agents; blocking it would hide real hosts. The meter flags the overage instead. | Enforce seats at sync once agent archival exists |
| Invoice list also remains in `/settings/workspace` | `pages/WorkspaceSettings.tsx` | Backward-compatible; tests lock the billing card | Extract billing into this page in a named slice |
| Cancel banner has no resume button | `pages/Subscription.tsx` | No customer cancel/resume endpoint exists; a dead button would lie | Add resume when customer self-serve lands |
