# frontend/

**Parent:** [`../AGENTS.md`](../AGENTS.md) for tokens, Select/Button, filter bars, row actions, e2e testids.

## OVERVIEW

Vite + React + TS + shadcn. Node >=24.15.0 (jsdom 30 engine floor). Dev :5173; prod compose publishes :5174.

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Pages | `src/pages/` (+ `admin/`, `credit/`) |
| API client | `src/api/` |
| Kit | `src/components/ui/` only |
| Tokens | `src/index.css` `:root` |
| Filter-bar ref | `src/pages/credit/CreditHistory.tsx` |
| Row actions (rule) | [`../docs/specs/row-actions.md`](../docs/specs/row-actions.md) — menu vs visible button, alignment, confirm |
| Vitest | `src/test/` |
| Playwright | `e2e/` — serial, `storageState`. Two projects: `chromium` (desktop 1440×900) and `mobile` (Pixel 5, `hasTouch`). Mobile-only specs **must** be named `*.mobile.spec.ts` so each spec runs in exactly one project. |
| i18n | `src/locales/{en,id}/` |

## CONVENTIONS

- **Design changes:** read [`../docs/specs/design-invariants.md`](../docs/specs/design-invariants.md) first (Tier 1 invariants + six-question protocol), then the surface contract in [`DESIGN.md`](DESIGN.md).
- ESLint: no native `<select>` in `src/` (e2e/tests exempt). Primary actions = `Button`.
- Table/card **row actions**: follow [`../docs/specs/row-actions.md`](../docs/specs/row-actions.md) — action column is `text-right` (or `justify-end` when the cell wraps a block-level flex), menus use `onSelect` + a sibling controlled `AlertDialog` (never a nested trigger), and only irreversible actions get a confirmation.
- Alias `@/*`. `npm test` = vitest run; coverage statements/lines 75, branches/functions 70 — **enforced in CI on full runs** (`npx vitest run --coverage`). Selective runs (`VITEST_GLOBS`) skip the gate by design. Never raise a threshold to make a red build green; add tests.
- Proxy `/api` `/ws` → `http://backend:8000` (needs Docker DNS or override).

## ANTI-PATTERNS

- Restyling kit files to match one screenshot.
- Uneven `grid-cols-12` filter bars / far-right Apply gutter.
- Second palette (`#0a7`, Palatino editorial on `/blog` — blog is FastAPI HTML, not this SPA).
- Treating Playwright as Guard host enroll.
- `POST /api/auth/register` for shared prod e2e mailbox.
