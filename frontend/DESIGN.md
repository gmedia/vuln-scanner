# Sinexis SPA design contracts — index

**Read this file first, then only the surface file you are changing.**

The contracts used to live in one 3.3k-line file. They are now split by surface so an agent can load one contract instead of the whole system. Heading text is unchanged, so existing references such as `§ "App shell chrome (Sidebar / Header)"` still resolve.

## Rule hierarchy

1. [`docs/specs/design-invariants.md`](../docs/specs/design-invariants.md) — Tier 1 invariants + the six-question change protocol. **Normative.**
2. [`AGENTS.md`](../AGENTS.md) and [`frontend/AGENTS.md`](AGENTS.md) — short agent-facing summary.
3. Domain rules: [`row-actions.md`](../docs/specs/row-actions.md), [`theme-v1.md`](../docs/specs/theme-v1.md), [`shadcn-ui-migration.md`](../docs/specs/shadcn-ui-migration.md), [`i18n-v1.md`](../docs/specs/i18n-v1.md).
4. The surface files below — visual contracts. They **must not** redefine design law; they link back to (1).

If a surface file contradicts a higher layer, the higher layer wins and the surface file is fixed in the same PR.

## Surface map

| Surface / route | File | Lines |
|---|---|---|
| Shared system: colour, type, spacing, components, motion, depth, a11y | [`design/foundation.md`](design/foundation.md) | ~220 |
| `/siem` analyst console | [`design/siem.md`](design/siem.md) | ~170 |
| `/guard` fleet console | [`design/guard.md`](design/guard.md) | ~175 |
| `/assets` | [`design/assets.md`](design/assets.md) | ~175 |
| Page-nav line tabs (`/ai`, Host, SIEM, ScanDetail, Admin AI) + App shell chrome (Sidebar / Header) | [`design/navigation.md`](design/navigation.md) | ~250 |
| `/uptime`, `/uptime/:id`, `/uptime/status-page` | [`design/uptime.md`](design/uptime.md) | ~450 |
| `/host` | [`design/host.md`](design/host.md) | ~150 |
| `/dashboard` | [`design/dashboard.md`](design/dashboard.md) | ~150 |
| `/scan/:id`, `/schedules`, `/scan/ip`, `/scan/domain`, `/scan/mobile` | [`design/scan.md`](design/scan.md) | ~405 |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/profile`, `/settings/workspace` | [`design/auth.md`](design/auth.md) | ~470 |
| `/settings/subscription` | [`design/subscription.md`](design/subscription.md) | ~150 |
| `/admin`, `/admin/users`, `/admin/users/:id`, `/admin/hpp`, `/admin/invoices`, `/admin/blog`, `/admin/email-logs`, `/admin/ai` | [`design/admin.md`](design/admin.md) | ~360 |
| `/inbox`, `/credit-history`, `/`, `/guide` | [`design/content.md`](design/content.md) | ~300 |

## Which file do I open?

| You are changing | Open |
|---|---|
| A token, font, spacing, shared component, or motion value | `design/foundation.md` **first**, then the surface |
| A sidebar or header element, or a page-nav tab strip | `design/navigation.md` |
| A table row action | [`row-actions.md`](../docs/specs/row-actions.md) + the surface file |
| A KPI tile, empty state, or tone colour | `design/foundation.md` §5 + the surface file |
| A plan card, capacity meter, or subscription request | `design/subscription.md` + `design/foundation.md` §5 |
| A print/PDF surface | [`scan-pdf-invoice-print-v1.md`](../docs/specs/scan-pdf-invoice-print-v1.md) + [`sinexis-invoice-v1.md`](../docs/specs/sinexis-invoice-v1.md) |

## What each surface file contains

Every file keeps the original eight sections, in this order:

0. Research log — why the surface looks the way it does. Historical; do not re-litigate.
1. Atmosphere & identity — the one memorable moment.
2. Colour — tokens and tone usage for that surface.
3. Typography.
4. Spacing & layout.
5. Signature components & states — the normative anatomy tables.
6. Motion.
7. Depth & surface.
8. Accessibility constraints & accepted debt.

§5 and §8 are the parts you must satisfy. §0 is context, not a specification.

## Before you code

Run the six-question protocol in [`design-invariants.md`](../docs/specs/design-invariants.md) §3 and answer it in the PR. Then run the verification commands in §4 of the same file.

## Adding a surface

1. Create `design/<surface>.md` with the eight sections.
2. Add the row to the surface map above.
3. Add it to the "Which file do I open?" table if the route is ambiguous.
4. `docContract.test.ts` fails if a design file is not linked from this index, or if the index links a file that does not exist.
