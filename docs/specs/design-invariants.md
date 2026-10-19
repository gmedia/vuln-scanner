# Design invariants + agent change protocol

**Status:** active rule. This file is the single normative entry point for UI changes.
**Applies to:** every change under `frontend/src/`, public FastAPI HTML islands, and print/PDF surfaces.
**Does not replace:** per-surface visual contracts in [`frontend/DESIGN.md`](../../frontend/DESIGN.md).

---

## 0) Rule hierarchy (resolve conflicts in this order)

1. **This file** — hard invariants and the change protocol.
2. [`AGENTS.md`](../../AGENTS.md) and [`frontend/AGENTS.md`](../../frontend/AGENTS.md) — short agent-facing summary.
3. Domain rules: [`row-actions.md`](row-actions.md), [`theme-v1.md`](theme-v1.md), [`shadcn-ui-migration.md`](shadcn-ui-migration.md), [`i18n-v1.md`](i18n-v1.md).
4. [`frontend/DESIGN.md`](../../frontend/DESIGN.md) — per-surface contracts (`/siem`, `/guard`, `/assets`, admin, auth, Landing, …).
5. Feature specs — **must not redefine** design law; they link here instead.

If a lower layer contradicts a higher layer, the higher layer wins and the lower layer is fixed in the same PR.

---

## 1) Tier 1 — invariants

“Machine” means CI fails without human judgment. “Review” means a human must verify it; do not claim it is enforced.

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | No native `<select>` in `src/`; use `Select` from `components/ui/`. | Machine: `eslint no-restricted-syntax` + `designInvariants.test.ts` |
| 2 | No `window.confirm`, `window.alert`, or `window.prompt`; use a controlled `AlertDialog` (or `sonner` for non-blocking feedback). | Machine: `eslint no-restricted-syntax` + `designInvariants.test.ts` |
| 3 | No raw hex or numeric `hsl()`/`hsla()` color literals outside the allowlist in §2. | Machine: `designInvariants.test.ts` |
| 4 | No arbitrary hex color classes (`bg-[#…]`, `text-[#…]`, `border-[#…]`). | Machine: `designInvariants.test.ts` |
| 5 | Color comes from `index.css` tokens. Do not invent a second palette (`#0a7`, Palatino brand, Stripe purple, ad-hoc chart hues). | Machine: `designInvariants.test.ts` + `themeTokens.test.ts`; Review for semantic intent |
| 6 | Status/severity text uses `lib/toneColors.ts`; no hand-written `text-<hue>-<shade>` outside that file. | Machine: `toneColors.test.ts` |
| 7 | `--primary` stays `hsl(142 71% 45%)` in both themes; `--primary-text` is text-only; ring and button contrast hold. | Machine: `themeTokens.test.ts` |
| 8 | E2E selects by `data-testid` or role; never by palette class, Lucide class, or `.nth()`. | Machine: `e2eSelectors.test.ts` |
| 9 | Every user-visible string exists in both `en` and `id` catalogs. | Machine: `i18n.test.ts` |
| 10 | Native `<button>` only for icon toggles, full-width list/card rows, and kit internals. Primary actions use `Button`. | Review |
| 11 | Every form control has an accessible name: `Label htmlFor` + matching `id`, or `aria-label`. Placeholder-only is forbidden. | Review |
| 12 | Filter bars copy Credit History: equal `gap-3` grid, field wrapper `flex min-w-0 flex-col gap-1.5`, controls `h-10 min-h-10`, mobile `FilterSheet` where the reference uses one. No `grid-cols-12` or far-right Apply gutter. | Review; SIEM has a machine check |
| 13 | Row actions: `text-right` on head and cell, `justify-end` for block flex, 1 action = visible `Button`, 2+ = `DropdownMenu`, `onSelect`, destructive last + separator, sibling controlled `AlertDialog`, irreversible only, mobile ≥ 44px, `desktop` prop not `sm:`. | Review + per-page tests; see [`row-actions.md`](row-actions.md) |
| 14 | Do not restyle `components/ui/*` for one screenshot. Kit changes are their own PR with a written reason. | Review |
| 15 | Frozen e2e testids stay; new controls get a new stable testid. | Machine: existing unit/E2E queries; Review |
| 16 | Do not add a primitive, token, radius, shadow, font, or motion value without updating the inventory and `index.css` in the same PR. | Review |
| 17 | KPI/metric tiles use `StatTile` + `StatGrid` from `components/patterns/StatTile.tsx`. No page-local `KpiTile` / `StatTile` / `StatCard`. | Machine: `designInvariants.test.ts` |
| 18 | Empty states use `EmptyState` from `components/patterns/EmptyState.tsx`. No page-local `EmptyIsland` / `EmptyState` / `EmptyPanel`. | Machine: `designInvariants.test.ts` |

### Adding to the allowlist

The allowlist exists for third-party brand marks and generated/data-driven values, not for convenience. A new entry needs a reason and must stay narrow (file + pattern). Never add a whole directory.

---

## 2) Color-literal allowlist

Only these `src/**/*.{ts,tsx}` files may contain raw hex or numeric `hsl()` values:

| File | Why |
|------|-----|
| `src/theme/theme.ts` | `<meta name="theme-color">` duplicates the background token for the browser chrome. |
| `src/lib/tagColors.ts` | User-selectable asset tag palette; values are data, not theme tokens. |
| `src/components/auth/GoogleSignInButton.tsx` | Google brand mark colors. |
| `src/components/ui/chart.tsx` | Recharts internal default selectors (`#ccc`, `#fff`). |
| `src/pages/admin/AdminDashboard.tsx` | Recharts chart series; tracked exception until a chart-token scale exists. |

CSS variable references such as `hsl(var(--card))` are **not** literals and are allowed everywhere.

---

## 3) Tier 2 — change protocol (before coding a UI change)

Answer these six questions in the PR description. Keep each answer to one line.

1. **Surface** — which page/surface changes? Link its `frontend/DESIGN.md` section.
2. **Closest pattern** — which existing file are you copying? Name the path.
3. **Primitives** — which `components/ui/*` and shared compositions are used? If none fit, stop: a new primitive is a separate PR.
4. **States** — how are loading, empty, error, disabled, permission-denied, mobile, light, and dark handled?
5. **New vocabulary** — are you adding a color, radius, shadow, font, spacing, or motion value? If yes, justify why the existing token is insufficient and update `index.css` + inventory.
6. **Contracts** — which of these change: `frontend/DESIGN.md`, `docs/AGENT_PAGE_REGISTRY.md`, testids, tests, locale catalogs?

If the answer to (3) is “I will write custom markup”, the default is wrong. Use the kit or an existing composition.

---

## 4) Verification before push

```bash
cd frontend
npm run lint
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run \
  src/test/designInvariants.test.ts \
  src/test/themeTokens.test.ts \
  src/test/toneColors.test.ts \
  src/test/e2eSelectors.test.ts \
  src/test/i18n.test.ts
```

Then run the tests for the pages you touched. CI also runs `frontend-design-invariants` on every PR that changes `frontend/**`, even when selective Vitest globs would skip those files.

---

## 5) Anti-patterns

- Adding a rule that cannot be checked and calling it “enforced”.
- Adding a token or primitive “for this one page”.
- Copying a screenshot instead of a surface contract.
- Putting a `Select`, input, or disclosure toggle inside a `DropdownMenu`.
- Wrapping a lone row action in a `…` menu.
- Using `sm:` to switch row-action density when a `desktop` prop is available.
- Adding a second palette for charts, print, or an HTML island.
- Bypassing a failing invariant by widening the allowlist.
