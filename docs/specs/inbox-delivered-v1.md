# Spec: Inbox “Delivered” (user-side SMTP log)

**Status:** **S0–S1c shipped** (#787 docs, #788 `GET /api/inbox` + `user_id`, #789 SPA `/inbox`, **S1c `job_id` + scan_diff link**). Bounce/SES = **S2** = Guide §1.3.1 **#1** (named, wait `buat`). Do **not** re-implement S0–S1b.
**Goal:** Let a workspace user see whether **product mail the app already sent** was **accepted by SMTP** (Sent) or **failed** — without a second notification center, Guard Discover, bounce/DSN infra, or exposing other tenants’ addresses.
**Epic:** product-depth follow-on to P1 S3 notify + admin `email_send_logs`. **Not** a new P-letter. Guide §1.3.1 **#1** = Inbox S2 (bounce/SES). S0–S1c **shipped**. Print S2 **shipped**.
**Depends:** `backend/app/services/email.py` · `EmailSendLog` / `email_send_logs` (`sent` \| `failed`) · `record_email_send` · `GET /api/admin/email-logs` · scan notify (`scan_diff`) · i18n notify locale (`id` default).
**Commercial:** not a SKU. Out already named: **Mixing into Guard Discover**.
**Not this epic:** SES/DSN “mailbox delivered”; chat inbox; unread threads; invoice SMTP; invite SMTP; bounce webhooks; unmasking recipients; `/guard/inbox`; SIEM cases; print/PDF (S1a/S1b shipped).

---

## 0) Relation to existing modules (read first)

| Surface | Today (code / shipped spec) | This spec |
|---------|-----------------------------|-----------|
| Guide §3 backlog | One-liner: Inbox “Delivered” user-side | **This file.** |
| Admin `/admin/email-logs` | Ops dump of SMTP **attempts**. Recipient **masked**. No `user_id` / `org_id`. Status `sent` \| `failed`. | **Unchanged.** Not the user inbox. Do **not** expose to org members. |
| `email_send_logs` | Columns: kind, status, `recipient_masked`, attempts, `error_message`, `created_at`. Kinds: verification, password_reset, scan_diff, uptime, host_protect, host_waf. | **Cannot** list “my mail” until S1 adds owner FK (or a projection). S0 does **not** migrate. |
| Scan notify P1 S3 | Email on **new** critical/high after completed IP/domain, plus **first scan** (`initial_report=True`). Mobile: no notify. | Inbox **shows** those attempts. Do **not** change notify rules in S0. |
| Invoice `POST .../send` | **Status flip** `draft→sent`. **Zero SMTP.** Spec I8. | **Not a mail row.** Verb collision: invoice `sent` ≠ SMTP `sent`. |
| Org invites | Copy-link / toast. **No mail.** | **Not a mail row.** |
| Guard `/guard` | Agent inventory + critical alert cards. No Discover. | **Out.** Do not mix. |
| SIEM `/siem` | Search + cases; flag-off | **Out.** |
| Scan history `/scan/:id` | Jobs + findings | **Unchanged.** Inbox may **link** to a job for `scan_diff`. |
| Print S1a/S1b | Shipped #785 / #786 | **Do not re-open.** |
| In-app bell / `/inbox` | **None** | S1b adds Account `/inbox`. |

**Hard rules (inherit):**

1. AuthZ: future user list = **only the caller’s mail** (job/schedule **owner `user_id`** — not “whole org sees all scan_diff”). Viewer: read. Platform admin uses **existing** `/admin/email-logs`, not this page as a dump.
2. Recipients stay **masked** on user UI (same helper as admin) **or** show “you” when the address is the caller’s. Never return another user’s unmasked email. Never return SMTP `error_message` to customers (ops-only).
3. No PII / real mailboxes / SMTP hosts in git or fixtures.
4. Frozen testids stay: `nav-guard`, `nav-siem`, `nav-admin-email-logs`. New: `nav-inbox` (Account).
5. Design: `--primary` `hsl(142 71% 45%)`, kit `Button`/`Select`, filter bar = Credit History. No native `<select>`, no Palatino / `#0a7`. P15 chrome frozen.
6. `GIT_MASTER=1`. Never work on `main`. Playwright ≠ Guard enroll.

---

## 1. Problem

| Today | Pain |
|-------|------|
| Product already emails scan_diff / uptime / host | GM cannot see in the SPA whether mail was **attempted**. Admin can (`/admin/email-logs`). |
| Log has **no owner FK** | Cannot answer “my mail” from `email_send_logs` without leaking other tenants. |
| Guide title says **Delivered** | Agents will invent SES/bounce or stamp “Delivered” on scan history. Current status is SMTP **Sent** (MTA accepted), not mailbox delivery. |
| Invoice button **Send** | Agents will SMTP invoices or mix Billing `sent` into Inbox. Send = **status flip**. |
| Guard alert cards | Agents will put Inbox under `/guard` (Discover). Explicit Out. |

This is a **user-safe projection of outbound SMTP attempts we already log** — not a second notify bus, not DSN.

---

## 2. Goals

1. **S0:** this file + guide/handoff pointers. No app code.
2. **S1 (later):** tenancy on send records (`user_id` required; `org_id` optional) filled from the existing `record_email_send` hook. `GET /api/inbox` (name locked) JWT-only, filtered to caller.
3. **S1b (later):** SPA `/inbox` under Account. Columns: time, kind, status (**Sent** / **Failed**), masked recipient or “you”, link to job when `scan_diff`. Empty: no product mail yet — **not** “check Guard”.
4. i18n `id` / `en` catalogs `frontend/src/locales/{id,en}/inbox.json`. Default `id`.
5. Tests: IDOR (user A empty/404 for user B’s `scan_diff`); admin logs still 403 for non-admin; invoice send still does not call `send_*email`.
6. Docs: this file; guide §1.3.1 **#2** (Inbox S2); §3 backlog pointer. **No** live `/inbox` registry row until S1b.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| Guard Discover / `/guard/inbox` / SIEM cases / `full_log` | Guide Out; thin Guard DoD |
| True mailbox **Delivered** (DSN, SES, SNS, bounce table) | No infra; park **S2** |
| Chat / threads / unread counts / compose / resend | Second product |
| Invoice SMTP / auto-email on `POST .../send` | I8; send = status flip |
| Invite SMTP | Copy-link today |
| Expose `GET /api/admin/email-logs` to org users | Cross-tenant dump |
| Unmask recipient or return `error_message` to customers | PII |
| Auth kinds (`verification`, `password_reset`) on user Inbox | Token/PII; stay admin-only |
| Change scan notify rules (mobile notify) | First-scan `initial_report` shipped; mobile still later |
| Push / FCM / Capacitor notifications | Parked spec |
| Print/PDF, WeasyPrint, `format=pdf`, gateway, Host invoice, WAF 1147+, P14 E/G/H, GTM, P15 restyle | Other queues / shipped |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| **S0 PR** | **Docs only.** This file + guide / handoff / sibling one-liners. No `*.py` / `*.tsx` / Alembic. |
| **“Delivered” in the guide title** | User-visible **outbound SMTP log**. SPA copy: **Sent / Failed**. Not bounce. Not invoice `sent`. |
| **Kinds S1** | **`scan_diff` required.** `uptime` / `host_protect` / `host_waf` optional same PR if cheap. Auth kinds **admin-only**. Invoice/invite **not rows**. |
| **Owner filter** | Rows keyed to **schedule/job owner `user_id`** (the user we mailed, or the owner of `notify_email`). **Not** “all org members see all scan_diff”. |
| **Route** | `/inbox`, Account nav, testid `nav-inbox`. Not Attach/Guard. |
| **Admin logs** | Unchanged. Masked. All tenants. `is_admin` only. |
| **Read-only** | No resend, no compose. |
| **Feature flag** | **None.** Mail already sends. |
| **Workers S0** | **Do not touch.** S1 may pass `user_id` into `record_email_send` only. |
| **Bounce / DSN (S2)** | **Parked** until named. |

**One question (owner may answer “ikut default”):**

1. S1 kinds: **`scan_diff` only** (default), or **scan_diff + uptime + host_protect + host_waf** in the first code slice? (Auth / invoice / invite still out.)

---

## 5. Q lock (S0 — 2026-09-16)

| Q | Decision |
|---|----------|
| S0 meaning | **This markdown** + pointers. No app code. |
| Delivered | **SMTP sent/failed**, not mailbox DSN |
| Guard / SIEM | **Out** |
| Invoice send | **Not email** |
| Admin dump as user API | **No** |
| Schema gap | Table **lacks** `user_id` / `org_id` — S1 migrates |
| Nav | Account `/inbox` |

---

## 6. AuthZ (S1 — document now, implement later)

| Action | Who | Fail |
|--------|-----|------|
| `GET /api/inbox` | JWT member; rows where `user_id == me` | No JWT → 401; other user’s row → not in list (empty/404), **not** 200 with their data |
| `GET /api/admin/email-logs` | `is_admin` | Non-admin → existing 403 |
| Invoice `POST .../send` | platform admin | Still **no** `send_*email` |

Do **not** filter Inbox by `organization_id` alone (would leak co-member scan_diff mail). Org column may exist for ops later; user API still **user_id**.

---

## 7. i18n

S1b catalogs `frontend/src/locales/{id,en}/inbox.json`. Labels: Sent / Terkirim, Failed / Gagal — **not** “Delivered” / “Terkirim ke kotak masuk” unless S2 exists. Kind labels reuse notify/host wording. Default `id`.

---

## 8. UX / surfaces (S1b)

- Route `/inbox`. Sidebar **Account** group (with Profile, Credit History, Workspace). testid **`nav-inbox`**.
- Filter bar = Credit History (`gap-3`, `h-10`): kind + status. `Select` only.
- Table: created_at, kind, status badge, recipient (masked or “you”), job link for `scan_diff`.
- Empty: ops-neutral (“Belum ada email produk”) — **not** Guard CTA, **not** upgrade CTA.
- Do **not** add `/inbox` to `AGENT_PAGE_REGISTRY.md` as a live route in **S0**. S1b adds the row.

---

## 9. API / files (expected)

**S0 (this PR):** markdown only.

**S1 (later, named + implement):**

| Path | Role |
|------|------|
| `backend/app/models/email_send_log.py` | Add `user_id` (FK users, nullable for backfill of old rows) |
| Alembic | New revision; **do not** rewrite `add_email_send_logs` |
| `backend/app/services/email_send_log.py` | `record_email_send(..., user_id=)` |
| `backend/app/services/email.py` | Pass owner id from callers that know it |
| New `backend/app/api/inbox_routes.py` (or similar) | `GET /api/inbox` |
| Tests | `tests/test_inbox.py` + keep admin email-log 403 |

**S1b (later):** `frontend/src/pages/Inbox.tsx`, Sidebar, locales, `Inbox.test.tsx`, registry row.

**Never in S0/S1:** SES SDK, bounce webhook router, invoice `send_*email`, Guard files, `workers/` notify rule changes unless named.

---

## 10. Slices

| Slice | Title | PR | DoD | Out |
|-------|-------|----|-----|-----|
| **S0** | This spec + pointers | **This PR — docs only** | File exists; guide §1.3.1 links here; invoice send called out as non-email; schema gap documented; `git diff` markdown only | App code |
| **S1** | Schema + `GET /api/inbox` | Own `feat/inbox-s1-*` | user_id on new rows; IDOR; admin logs unchanged; invoice send still no SMTP | Bounce, SPA optional |
| **S1b** | SPA `/inbox` | Own `feat/inbox-s1b-*` | `nav-inbox`; Sent/Failed copy; no Guard nav mix | Discover |
| **S1c** | scan_diff job link | Own `feat/inbox-s1c-*` | nullable `job_id` FK; `GET /api/inbox` includes it; SPA `inbox-job-link` → `/scan/:id` for `scan_diff` only; uptime/host stay null | Bounce/SES, notify rule change, invoice SMTP |
| **S2** | Mailbox DSN / SES | **Do not start** unless named | New provider | Default: parked |

**Order:** S0 → S1 → S1b → S1c. **Do not** combine S0 with S1. Prefer S1 and S1b **separate** (print pattern).

Suggested titles: `docs: S0 inbox delivered (user-side SMTP log)` · `feat: inbox API tenancy for SMTP send log` · `feat: SPA /inbox sent-failed list`.

---

## 11. Acceptance (agent-executable)

### S0 (this PR)

```bash
GIT_MASTER=1 git rev-parse --abbrev-ref HEAD
# expect: docs/inbox-delivered-s0 — not main

test -f docs/specs/inbox-delivered-v1.md

rg -n "inbox-delivered-v1.md" docs/AGENT_EXECUTION_GUIDE.md
# expect: §1.3.1 points at this spec (S0–S1c shipped; S2 = queue #3)

rg -n "Guard Discover|/guard/inbox" docs/specs/inbox-delivered-v1.md
rg -n "status flip|not SMTP|not email" docs/specs/inbox-delivered-v1.md
rg -n "user_id" docs/specs/inbox-delivered-v1.md

GIT_MASTER=1 git diff --stat origin/main
# expect: docs/*.md and/or handoff.md only
# expect: no *.py *.tsx Dockerfile requirements.txt alembic/versions/
```

### S1 (later — do not run as S0 DoD)

```bash
cd backend && python -m pytest tests/test_inbox.py tests/test_admin_routes.py -q -k "email_log or inbox"
# expect: GET /api/inbox 401 without JWT
# expect: user A does not see user B scan_diff
# expect: GET /api/admin/email-logs still 403 for non-admin
# expect: POST /api/admin/invoices/{id}/send does not call send_*email
```

### S1b (later)

```bash
cd frontend && npx vitest run src/test/Inbox.test.tsx src/test/Sidebar.test.tsx
# expect: data-testid="nav-inbox" under Account
# expect: nav-guard unchanged; no inbox under Guard
```

### S1c (this PR)

```bash
cd backend && python -m pytest tests/test_inbox.py tests/test_scan_notify.py -q
# expect: scan_diff item includes job_id; uptime job_id is null
# expect: send_scan_diff_email records UUID job_id; invalid string → null
# expect: still no error_message on GET /api/inbox

cd frontend && npx vitest run src/test/Inbox.test.tsx
# expect: scan_diff row has data-testid="inbox-job-link" href /scan/{job_id}
# expect: uptime row has no inbox-job-link
```

**Not required:** “user confirms mail in Gmail”; live SMTP to a real mailbox; Guard enroll; bounce.

---

## 12. Agent rules

- **Do not implement S1/S1b** until the user names the slice + `buat`.
- After S0 merges, “lanjut” without a slice → recommend **S1** (schema + API) — still wait for the verb.
- Do **not** treat admin email-logs as the user inbox.
- Do **not** treat invoice Send as email.
- Do **not** mass-merge Dependabot in the same PR.
- Do **not** print tokens, IPs, or real recipient addresses in PR bodies.

---

## 13. Open residual (not blocking S0)

- Admin SPA kind filter omits `host_waf` (backend has the kind) — admin hygiene, not this epic.
- ~~First completed scan never emails (`initial_report` unused) — named follow-up only.~~ **Shipped:** worker passes `initial_report=True`; first IP/domain scan emails via `scan_diff`.
- Old `email_send_logs` rows without `user_id` stay admin-only after S1 (no backfill guess).

---

## 14. References

- Guide **§1.3.1** row 2 · **§3** backlog
- [`scan-attach-v1.md`](scan-attach-v1.md) §8 notify; open Q “in-app notification center vs email-only”
- [`sinexis-invoice-v1.md`](sinexis-invoice-v1.md) I8 — send = status, not mail
- [`guard-v1.md`](guard-v1.md) / [`siem-v1.md`](siem-v1.md) — stay separate
- Code: `backend/app/models/email_send_log.py`, `backend/app/services/email.py`, `backend/app/services/email_send_log.py`, `frontend/src/pages/admin/AdminEmailLogs.tsx`

---

*S0 draft. Do not implement S1/S1b until the user says implement / buat / kerjakan and names the slice. Ultraworked with Sisyphus.*
