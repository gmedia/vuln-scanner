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

- **Design changes:** read [`../docs/specs/design-invariants.md`](../docs/specs/design-invariants.md) first (Tier 1 invariants + six-question protocol), then open [`DESIGN.md`](DESIGN.md) and **only the one surface file** in [`design/`](design/) that you are changing.
- **Page-nav tabs:** `TabsList variant="line"` + shared chrome `w-full flex-wrap justify-start sm:flex-nowrap`, max 5 tabs, wrap (never scroll) on mobile. Enforced by `src/test/pageNavTabs.test.ts`; see [`design/navigation.md`](design/navigation.md).
- ESLint: no native `<select>` in `src/` (e2e/tests exempt). Primary actions = `Button`.
- Table/card **row actions**: follow [`../docs/specs/row-actions.md`](../docs/specs/row-actions.md) — action column is `text-right` (or `justify-end` when the cell wraps a block-level flex), menus use `onSelect` + a sibling controlled `AlertDialog` (never a nested trigger), and only irreversible actions get a confirmation.
- Alias `@/*`. `npm test` = vitest run; coverage statements/lines 75, branches/functions 70 — **enforced in CI on full runs** (`npx vitest run --coverage`). Selective runs (`VITEST_GLOBS`) skip the gate by design. Never raise a threshold to make a red build green; add tests.
- Proxy `/api` `/ws` → `http://backend:8000` (needs Docker DNS or override).
- **Forms / writes:** every `useMutation` needs a surfacing `onError` **and** a visible `onSuccess` (toast/inline result/navigation); read API errors only via `apiErrorMessage()` / `extractApiError()` (`src/api/apiErrors.ts`), render 422s with `useApiFormErrors()` + `<FormAlert>`/`<FieldError>` (`src/components/patterns/FormFeedback.tsx`). Never `String(detail)` or a local `apiDetail`. Contract: [`../docs/specs/form-feedback.md`](../docs/specs/form-feedback.md); gate: `node ../scripts/check-form-feedback.mjs`.
- **Field focus:** after a failed submit, the first `aria-invalid` control must receive focus (`useApiFormErrors().apply()` handles it; local field maps use `useFocusFirstInvalidField`).
- **Silent catches:** an empty/`void 0`/comment-only `catch` anywhere in `src` fails CI; annotate genuinely best-effort work with `// silent-catch: allow <reason>`.

## ANTI-PATTERNS

- Restyling kit files to match one screenshot.
- Uneven `grid-cols-12` filter bars / far-right Apply gutter.
- Second palette (`#0a7`, Palatino editorial on `/blog` — blog is FastAPI HTML, not this SPA).
- Treating Playwright as Guard host enroll.
- `POST /api/auth/register` for shared prod e2e mailbox.
- A mutation with no `onError` / no visible error UI (silent data loss).
- Reading `err.response.data.detail` by hand or converting it with `String(...)`.
