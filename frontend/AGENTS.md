# frontend/

**Parent:** [`../AGENTS.md`](../AGENTS.md) for tokens, Select/Button, filter bars, e2e testids.

## OVERVIEW

Vite + React + TS + shadcn. Node >=24. Dev :5173; prod compose publishes :5174.

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Pages | `src/pages/` (+ `admin/`, `credit/`) |
| API client | `src/api/` |
| Kit | `src/components/ui/` only |
| Tokens | `src/index.css` `:root` |
| Filter-bar ref | `src/pages/credit/CreditHistory.tsx` |
| Vitest | `src/test/` |
| Playwright | `e2e/` — serial, `storageState` |
| i18n | `src/locales/{en,id}/` |

## CONVENTIONS

- ESLint: no native `<select>` in `src/` (e2e/tests exempt). Primary actions = `Button`.
- Alias `@/*`. `npm test` = vitest run; coverage statements/lines 75, branches/functions 70.
- Proxy `/api` `/ws` → `http://backend:8000` (needs Docker DNS or override).

## ANTI-PATTERNS

- Restyling kit files to match one screenshot.
- Uneven `grid-cols-12` filter bars / far-right Apply gutter.
- Second palette (`#0a7`, Palatino editorial on `/blog` — blog is FastAPI HTML, not this SPA).
- Treating Playwright as Guard host enroll.
- `POST /api/auth/register` for shared prod e2e mailbox.
