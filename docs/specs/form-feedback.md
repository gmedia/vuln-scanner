# Form feedback contract (v1)

**Status:** normative. Enforced by `scripts/check-form-feedback.mjs` in the `form-feedback`
CI job (required by `ci-ok`).
**Applies to:** every write path in `frontend/src` — forms, dialogs, sheets, inline editors,
row actions, toggles.

---

## 1) Why this exists

A write that fails without telling the user is worse than a crash: the user believes the change
was saved. Two defects caused this in production:

1. FastAPI request validation returns `{"detail": [{"loc", "msg", "type"}]}`. The SPA normalizer
   only accepted `detail: string`, so every 422 was replaced by a generic fallback — or by
   `[object Object]` where a page did `String(detail)`.
2. A large set of `useMutation` calls declared `onSuccess` but no `onError`, so a rejected write
   was visually identical to a successful one. Some `onError` handlers only stopped a spinner.

The same audit found the mirror image: writes that succeeded with no confirmation (dialog closed,
list refetched, nothing said) and Guard `sync`/`enable` toasting success on HTTP 200
`{"ok": false}`.

---

## 2) The one rule

> Every write must produce a visible outcome — success or failure — and a failure must carry the
> backend's message when one exists.

No exceptions. If an outcome genuinely cannot be shown (e.g. an idempotent background prefetch),
the mutation is not user-initiated and must not live in a form component.

---

## 3) Reading errors

There is exactly **one** reader: `frontend/src/api/apiErrors.ts`.

```ts
import { apiErrorMessage, extractApiError } from "@/api/apiErrors";

apiErrorMessage(err, t("saveFail"));       // banner / toast text
const { message, fields, issues } = extractApiError(err, t("saveFail"));
```

- `message` — localized string, never `[object Object]`.
- `fields` — `{ email: "…", "findings[0].class": "…" }`, ready for inline rendering.
- `issues` — normalized `{ field, msg, type, params }`, in case a surface needs the raw list.
- Resolution order: translated `code` (`errors:<code>` + `params`) → localized validation issue →
  server `detail` string → caller fallback.
- Validation types are localized via `errors:validation.<type>` in
  `frontend/src/locales/{en,id}/errors.json`. `value_error` deliberately keeps the server message
  (custom validators carry the specific rule).

**Forbidden** (CI fails): a local `apiDetail` / `detailFromBody` / `extractError` helper,
`err.response.data.detail` reads, and `String(detail)`.

Backend contract: `backend/app/errors.py` + `docs/specs/i18n-v1.md §6.2`.

- Business error: `{"detail": "<string>", "code"?: "<code>", "params"?: {…}}`
- Validation error (422): `{"detail": "<string>", "code": "validation_error", "fields": {…},
  "errors": [{field, msg, type, params?}]}`. Pydantic's `input` is stripped so a rejected password
  is never echoed back.

---

## 4) Surface matrix

| Surface | Failure | Success |
|---|---|---|
| Full-page form (auth, profile, workspace, scan, schedules) | Banner above the submit row (`FormAlert`) **and** `<FieldError>` under each affected input; focus the first invalid field. Never clear the form. | Inline notice or `toast.success`; reset when a field is edited. |
| Dialog / sheet CRUD (blog, promo, SKU, host site, uptime monitor, AI provider/model, invoice, billing profile) | Field errors inside the dialog + banner; **do not close the dialog** on failure. | `toast.success` **then** close. |
| Row action / toggle / destructive (delete, pause, publish, void, send, revoke, quarantine) | `toast.error(apiErrorMessage(...))`; revert optimistic UI. | `toast.success` after the server confirms. |
| Background / async (scan enqueue, Guard sync, PDF, topup) | `toast.error` + a retry path. | Explicit text: "queued", "generating", "synced" — not just a closed dialog. |

Shared primitives:

- `frontend/src/hooks/useApiFormErrors.ts` — `{ formError, fieldErrors, apply, clearField, clear }`.
- `frontend/src/components/patterns/FormFeedback.tsx` — `<FormAlert>`, `<FieldError>`.

Wiring rules:

- `onError: (err) => apply(err, t("saveFail"))` for forms.
- `onError: (err) => toast.error(apiErrorMessage(err, t("saveFail")))` for row actions.
- `clearField("email")` in the input's `onChange`; `aria-invalid` + `aria-describedby` on the input.
- `apply` / `apiErrorMessage` in `onError` only; never build a message from `err.message`.

---

## 5) HTTP 200 is not success

Some endpoints return `200` with a machine failure flag: Guard `POST /api/guard/sync`,
`POST /api/guard/enable`, host-agent responses. Check the payload:

```ts
onSuccess: (data) => {
  if (data.ok === false) toast.warning(guardSyncMessage(data.reason));
  else toast.success(t("syncDone"));
}
```

Never map `ok: false` to a success toast. Never render a raw upstream `error` string (hostnames,
IPs, Wazuh internals); map the `reason` to an i18n key.

---

## 6) Success feedback

- Every user-initiated write shows a success signal: `toast.success` for actions/dialogs, an inline
  notice for page forms (persistent enough to read), or an explicit result surface (one-time API
  key, heartbeat URL, the created row selected, a simulation panel, a redirect).
- "The dialog closed" and "the list refetched" are **not** success feedback. If the result is
  genuinely visible inline, record it with `// form-feedback: allow <reason>` above the mutation.
- Success text comes from i18n (`en`/`id`), not from a backend prose field. Backend `message`
  fields are legacy; if a response carries dynamic data (`email_sent`, `heartbeat_url`, a one-time
  key), render that data through an i18n template.
- Do not rely on "dialog closed" or "list refetched" as the only confirmation.

---

## 6b) Backend validation types

Custom validators raise `PydanticCustomError("<type>", "<english fallback>", {params})`; the SPA
renders `errors:validation.<type>`. A `type` without keys in **both** `en` and `id` silently falls
back to English, which is a bug in the Indonesian UI. `scripts/check-validation-types.mjs`
enumerates every type in `backend/app` and fails when a key is missing. Prefer reusing a shared
type (`target_invalid`, `domain_invalid`, `http_method_invalid`, …) over inventing a new one for
the same rule.

## 6c) Accessibility

- After a failed submit, focus moves to the first control with `aria-invalid="true"`.
  `useApiFormErrors().apply()` does this automatically; pages holding their own field map call
  `useFocusFirstInvalidField(fieldErrors)` (`frontend/src/lib/focusFirstInvalid.ts`).
- Every input that receives a field error sets `aria-invalid` and `aria-describedby` pointing at the
  visible message. `Input`, `Textarea` and `SelectTrigger` style the invalid state with the
  destructive token.
- `FormAlert` is an `Alert` with `role="alert"`, so the banner is announced when it appears.

## 7) CI gate

```
node scripts/check-form-feedback.mjs
```

Fails when:

- a `useMutation` has no `onError` and no `// form-feedback: allow <reason>` comment;
- an `onError` body does not surface anything — it must call `toast.error`/`toast.warning`, `apply(`, `setFormError(`, `setFieldErrors(`, or a `set*Error(` setter (a bare handler reference is accepted);
- a mutation has no `onSuccess`, or its `onSuccess` only invalidates/closes — it must toast, set result state, navigate, or have an allow comment;
- a UI file (`pages/`, `components/`) has an empty `catch {}` / `catch { void 0; }` / comment-only catch and no allow comment;
- a local `apiDetail` / `detailFromBody` / `extractError` reader exists;
- `String(...detail...)` appears.

`// form-feedback: allow <reason>` must sit on the comment line directly above the mutation. It is
for call-site handling (the scan hooks pass `{ onError, onSuccess }` from the form), for inline
results that are their own confirmation (simulation panel, SIEM active case, host toggles), and for
best-effort preferences. It is not an escape hatch for a missing error/success UI.

---

## 8) Checklist for a new form

1. `useApiFormErrors()` + `<FormAlert>` + `<FieldError>` per field.
2. Every mutation has `onError`; no dialog close before success.
3. Field keys match the backend `loc` path (snake_case for request bodies).
4. Success feedback uses an i18n key.
5. `node scripts/check-form-feedback.mjs` passes.
6. Add/adjust a test when the error mapping is non-trivial (422 array, `ok:false`, nested `loc`).
