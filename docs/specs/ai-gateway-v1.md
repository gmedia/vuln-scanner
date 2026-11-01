# Spec: AI Gateway v1 (OpenAI-compatible resale)

**Status:** **S1–S5 shipped** (catalog, wallet, `/v1`, SPA, Redis limits, ops notes). Git flag default **off**.
**Goal:** resell **contracted OpenAI-compatible** wholesale APIs to Sinexis orgs: customer keys, usage ledger, admin catalog + trial chat.
**Epic:** **new business line** (not P14, not Guard, not Workspace). Does **not** jump attach / Host Protect / GTM.
**Depends:** P2 Workspace (JWT `org_id`, membership) · existing admin SPA kit · host nginx + Cloudflare for a new `/v1` location.
**Not this epic:** wrapping [9router](https://github.com/decolua/9router) or [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI); Claude/Gemini native translation; CLI OAuth / MITM; LiteLLM as identity plane.

---

## 0) Why not wrap 9router / CLIProxyAPI

| Project | What it is | Why not in-tree |
|---------|------------|-----------------|
| **9router** | Local Next.js CLI router: OAuth, optional MITM, 3-tier fallback, SQLite, keys optional | Second runtime; operator-centric; ToS-gray “subscription → free”; still need tenant keys + IDR wallet |
| **CLIProxyAPI** | Go mux of CLI OAuth (Codex/Claude/Gemini/Grok) + shared YAML `api-keys`; usage stripped since v6.10 | Reselling consumer CLI quotas; billing not included; huge config |

**V1 implementation:** thin **FastAPI reverse-proxy** (httpx + SSE) behind Sinexis auth. **LiteLLM** only if a later epic needs native Anthropic/Google **and** sold multi-provider failover.

---

## 1. Problem

Wholesale OpenAI-compatible providers (OpenRouter, Groq, DeepSeek, Azure OpenAI, official OpenAI, …) can be invoiced. Customers want **one Sinexis key**, usage they can read, and admins need catalog + a safe playground.

Scan credits (`users.credits` / `credit_logs`) are **legacy job integers**, personal (metering v3 dropped the Scan credit meter — SKU seats now). Platform `api_keys` are **admin M2M**, no tenant FK, header `X-API-Key`. Neither is an LLM product.

Prod nginx (`nginx/sinexis.app.conf`) proxies `/api/` and `/ws/` to FastAPI; **`/` is the SPA**. A public `/v1` does not exist today.

---

## 2. Goals

1. OpenAI-compatible **`GET /v1/models`** and **`POST /v1/chat/completions`** (stream + non-stream) for **allowlisted aliases only**.
2. Customer keys `sx-…` via `Authorization: Bearer` (OpenAI SDK drop-in). Prefix + SHA-256; plaintext once; **org-bound**.
3. **Org AI wallet** (prepaid IDR) with **reserve → settle/release** so concurrent streams cannot overdraw.
4. Immutable **usage events** (tokens, billed IDR, COGS IDR, latency, status) — **no prompt body** by default.
5. Admin: CRUD providers (encrypted creds), models (public alias → upstream id + HPP/markup), global usage, **trial chat** on the same gateway (`source=admin_trial`) with a **platform spend cap**.
6. Kill switch `AI_GATEWAY_ENABLED` (compose **false** like SIEM). Flag off → `/v1` and `/api/ai*` **404**.
7. Edge: dedicated nginx `location ^~ /v1/` (buffering off, long read timeout). Do not starve scan workers.
8. Tests: IDOR, key hash, reserve race, stream settle, flag-off, no leak of wholesale URL/key on upstream 401.

---

## 3. Non-goals (explicit)

| Out | Why |
|-----|-----|
| Fork/embed 9router or CLIProxyAPI | Wrong product; ToS; ops |
| Native `/v1/messages` (Anthropic) / Gemini | Translation epic |
| Combo / 3-tier fallback | Surface typed **503**; customer retries |
    | Embeddings, TTS, STT | Unpriced |
    | Native tool *execution* in the gateway | Pass `tools` / `tool_choice` / `functions` through to wholesale; no Sinexis-side tool runner |
    | Images / multimodal content (`messages[].content` parts) | Pass-through; tokens priced by wholesale usage. No Sinexis-side image storage / preview. |
| `n > 1` completions | Fan-out cost |
| Reuse `api_keys` or `credit_logs` | Wrong identity / unit |
| Unify with Workspace “credits stay personal” | Dual wallets stay; AI is the **exception** (org) |
| Full prompt replay as “logs” | PII / subpoena product |
| Same PR as Guard / Host Protect / WAF | Isolation |
| Invent list prices / `service_id` | Human/finance |
| PII, hosts, wholesale keys in markdown | Public repo |

---

## 4. Defaults (locked unless user overrides)

| Topic | Default |
|-------|---------|
| **Payer** | **Organization AI wallet** (not `users.credits`) |
| **Motion** | **Prepaid IDR** top-up by admin/ops until finance adds `service_id` |
| **Unit** | Sell prices are **USD per 1M tokens** (`price_usd_per_1m_*`). The IDR charge is the combined prompt+completion total converted **once** at the request's locked FX and rounded **up** to whole IDR. `price_idr_per_1k_*` is a derived display/rollback value, never the source of truth. |
| **FX** | Daily `ai_fx_rates` snapshot (Celery beat 01:10 UTC, `ai_fx.refresh` on the `ip_scan` worker) with **visible** source + effective date and an admin **manual override**. The rate is resolved **once at reserve**, stored on the reservation, and prices both the customer charge and COGS, so a later change cannot reprice a request. `AI_USD_IDR` is only the fallback when the table is empty. |
| **Catalog** | **Named aliases only** (`sinexis/…`); reject unknown `model` |
| **Auth `/v1`** | Customer `Authorization: Bearer sx-…` only. **Never** platform `X-API-Key` / `settings.api_key`. JWT **not** for SDK `/v1`. |
| **Playground / trial** | JWT **admin** → internal `/api/admin/ai/chat`; same proxy; `source=admin_trial`; **platform cap in USD** (`AI_TRIAL_MONTHLY_CAP_USD`, default 30) measured on COGS |
| **Org roles** | Owner/admin: mint/revoke keys, read usage, spend. Member: use existing keys if issued to them. **Viewer: no mint, no spend.** |
| **Prompt retention** | **Metadata only**. `AI_STORE_PROMPTS=false`. If later true: ≤14d, hashed/redact, admin trial included. |
| **Failure billing** | Transport fail / 4xx / 5xx before tokens → **charge 0**, release the hold, still stamp the usage row with the snapshot. A 200 with missing or zero `usage` is **estimated** (prompt from the request, completion from returned text at `chars // 4`) and marked `billed_estimated` + `usage_missing`; bill 0 only when there is no content at all. Never charge above provider-reported usage. |
| **Limits (v1 defaults)** | Per-key RPM **60**, TPM **100_000**, concurrent streams **2**; `max_tokens` cap per model row; org daily IDR cap optional |
| **Public URL** | `https://<public-origin>/v1` (nginx). CORS: SDK server-side default; browser CORS only if a later SPA playground for customers needs it. |
| **Process** | Same FastAPI image V1; **timeouts** on `/v1` (e.g. 120s) + consider dedicated uvicorn workers in ops — do not hold scan pool unbounded |
| **Legal** | Wholesale contract **allows resale**. No CLI-OAuth, no consumer Claude/ChatGPT session reuse. |

**Workspace exception (explicit):** Guide default “credits stay personal / org wallet later” **does not apply to AI**. Scan credits unchanged.

---

## 5. Actors

| Actor | Notes |
|-------|--------|
| **Org admin/owner** | Keys, usage, wallet visibility (read); cannot set wholesale creds |
| **Org member** | Call `/v1` with a key they were given |
| **Org viewer** | Usage read-only if product wants parity; **no keys, no spend** (lock: **no spend**) |
| **Platform admin** | Providers, models, FX, HPP/markup, all-org usage, trial chat, top-up org wallet, kill switch |
| **SDK client** | OpenAI SDK `base_url=…/v1`, `api_key=sx-…` |
| **Upstream** | HTTPS OpenAI-compat `chat/completions` only |

---

## 6. Architecture

```text
SDK  -- Bearer sx- -->  nginx ^~ /v1/  -->  FastAPI AI gateway
                                              │  hash key, org, RPM/TPM
                                              │  reserve wallet
                                              │  map alias → provider+upstream model
                                              ▼
                                         httpx stream/JSON to wholesale
                                              │
                                              ▼
                                         settle reservation + ai_usage_events

SPA /ai (customer keys+usage)  -- JWT -->  /api/ai/*
SPA /admin/ai                  -- admin --> /api/admin/ai/*
```

**Middleware:** exclude `/v1` from requiring platform `X-API-Key`. Dedicated authenticator for `sx-` Bearer. Do not treat JWT user tokens as customer AI keys (30-min TTL).

---

## 7. Data model (proposed)

### 7.1 `ai_providers`

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `name` | admin label |
| `base_url` | e.g. `https://api.example/v1` — **never** return to customers |
| `auth_header` | default `Authorization: Bearer` |
| `credential_enc` | envelope-encrypted; never log |
| `enabled` | bool |
| `status` | `ok` \| `degraded` \| `disabled` |

### 7.2 `ai_models`

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `provider_id` | FK |
| `public_id` | unique alias `sinexis/qwen-72b` |
| `upstream_id` | string sent upstream |
| `hpp_usd_per_1m_in` / `hpp_usd_per_1m_out` | wholesale, `NUMERIC(18,6)` **USD per 1M** — canonical for COGS |
| `hpp_usd_per_1k_in` / `hpp_usd_per_1k_out` | **legacy** integer, dual-written as `round(usd_per_1m / 1000)`; dropped after one release |
| `price_usd_per_1m_in/out` | sell price, `NUMERIC(18,6)` **USD per 1M** — the source of truth |
| `price_idr_per_1k_in/out` | **derived** display/rollback value: `round(usd * fx / 1000)` at the current effective rate; never the source of truth |
| `markup_bps` | unused in v1; explicit USD sell prices win |
| `max_ctx` / `max_tokens_cap` | |
| `enabled` | |

### 7.3 `ai_api_keys`

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `organization_id` | required |
| `created_by_user_id` | |
| `name` | |
| `prefix` | `sx-` + 8 chars public |
| `key_hash` | SHA-256 of full secret |
| `rate_limit_rpm` / `tpm` / `max_concurrent` | |
| `allowed_model_ids` | JSON list or join table; empty = all enabled in catalog |
| `is_active` | |
| `last_used_at` | |

**Do not** add tenant FKs to platform `api_keys`.

### 7.4 `ai_wallets`

| Column | Notes |
|--------|-------|
| `organization_id` | unique |
| `balance_idr` | integer |
| `currency` | `IDR` v1 |
| `updated_at` | |

Platform trial: a **synthetic org** or `ai_platform_wallet` row with a monthly cap. `balance_idr` is a cache of the ledger sum in §7.8; every mutation writes a ledger row in the same transaction.

### 7.5 `ai_reservations`

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `wallet_id` / `organization_id` | |
| `key_id` | nullable for admin trial |
| `hold_idr` | conservative cap at the locked snapshot (`prompt_est` + `max_tokens`), one combined ceil |
| `price_usd_per_1m_*`, `hpp_usd_per_1m_*` | **snapshot** of the model prices taken at reserve |
| `fx_rate`, `fx_source`, `fx_effective_date` | **locked** rate for this request |
| `prompt_tokens_est`, `completion_tokens_max` | what the hold assumed |
| `status` | `open` \| `settled` \| `released` |
| `created_at` | a reaper for stale `open` rows is **not implemented yet** (phase 6); until then a crashed stream keeps its hold |

### 7.6 `ai_usage_events` (append-only)

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `organization_id`, `user_id` nullable, `key_id` nullable |
| `source` | `customer` \| `admin_trial` |
| `model_public_id`, `provider_id` |
| `prompt_tokens`, `completion_tokens` |
| `billed_idr`, `cogs_idr` | IDR amounts actually applied |
| `billed_usd`, `cogs_usd` | `NUMERIC(24,12)` exact pre-FX amount |
| `fx_rate`, `fx_source`, `fx_effective_date` | rate actually applied (from the reservation) |
| `price_usd_per_1m_*`, `hpp_usd_per_1m_*` | price snapshots used |
| `shortfall_idr` | billed but not collected because the balance ran out; recorded, never silently forgiven |
| `usage_missing`, `billed_estimated` | estimation flags for a 200 without usage |
| `latency_ms`, `http_status`, `finish_reason` |
| `provider_request_id` | indexed, **not** unique (providers can repeat ids) |
| `reservation_id` | **unique** — one usage event per reservation, the double-settle guard |
| **no** prompt/completion text v1 |

HPP AI **must not** reuse `hpp_rates` scan-job rows. Optional later: `/admin/hpp` tab or `/admin/ai` only.

### 7.7 `ai_fx_rates` (one row per pair per day)

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `base` / `quote` | `USD` / `IDR` |
| `rate` | `NUMERIC(18,6)` — IDR per 1 USD |
| `source` | provider hostname (e.g. `api.frankfurter.app`) or `manual` |
| `effective_date` | date published by the source (or the day of a manual entry) |
| `fetched_at` | when we stored it |
| `created_by` | admin user for manual rows; `NULL` for the beat fetch |

Unique `(base, quote, effective_date)`; a same-day re-fetch or override updates the row instead of appending. The newest row at or before today is resolved **once per request at reserve** and stored on the reservation; it prices both the customer charge and COGS, so settled amounts never change retroactively. `AI_USD_IDR` is the fallback when the table is empty. The admin FX card warns when the stored snapshot is older than 7 UTC days; a stale rate is still used (never block a request) and the public catalog exposes `fx_stale`.

| Env | Default | Notes |
|-----|---------|-------|
| `AI_FX_AUTO_FETCH` | `true` | beat task skips entirely when false |
| `AI_FX_SOURCE_URL` | `https://api.frankfurter.app/latest?from=USD&to=IDR` | frankfurter (ECB, no key) shape; `open.er-api` shape also parsed |
| `AI_TRIAL_MONTHLY_CAP_USD` | `30` | admin-trial cap on COGS USD; the deprecated IDR cap applies only when this is unset |

### 7.8 `ai_wallet_ledger` (append-only)

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `organization_id` | FK `ai_wallets.organization_id`, indexed |
| `kind` | `topup` \| `reserve` \| `settle_adjust` \| `release` \| `manual_adjust` |
| `delta_idr` | signed IDR change |
| `balance_after_idr` | post-change balance, `>= 0` |
| `reservation_id`, `usage_event_id`, `actor_user_id` | nullable links |
| `note` | optional |
| `created_at` | |

Partial unique `(kind, reservation_id)`; every balance mutation writes exactly one row in the same transaction as the wallet update, so `sum(delta_idr)` equals `balance_idr`.

---

## 8. HTTP surface

### 8.1 Public OpenAI-compat

| Method | Path | Auth |
|--------|------|------|
| GET | `/v1/models` | customer key |
| POST | `/v1/chat/completions` | customer key |

Response shape: OpenAI chat completions (including `usage`). Errors: OpenAI-style `{ "error": { "message", "type", "code" } }` plus our types `insufficient_quota`, `model_not_found`, `rate_limit`.

### 8.2 Customer SPA API (JWT org)

| Method | Path | Notes |
|--------|------|------|
| GET/POST | `/api/ai/keys` | list / create (plaintext once) |
| DELETE | `/api/ai/keys/{id}` | revoke |
| GET | `/api/ai/usage` | org-scoped, metadata |
| GET | `/api/ai/wallet` | balance |
| GET | `/api/ai/models` | public catalog |

### 8.3 Admin (JWT `is_admin`)

| Method | Path | Notes |
|--------|------|------|
| CRUD | `/api/admin/ai/providers` | health ping |
| CRUD | `/api/admin/ai/models` | |
| POST | `/api/admin/ai/wallets/{org_id}/topup` | |
| GET | `/api/admin/ai/usage` | all orgs |
| POST | `/api/admin/ai/chat` | trial; cap |
| GET | `/api/admin/ai/fx` | effective rate + source + date + 30-row history |
| POST | `/api/admin/ai/fx/refresh` | fetch from `AI_FX_SOURCE_URL` now; `502` when the source is down |
| PUT | `/api/admin/ai/fx/manual` | upsert today's rate with `source=manual` |

---

## 9. Request lifecycle (`/v1/chat/completions`)

1. Authenticate `sx-`; load org + wallet; enforce RPM/TPM/concurrent.
2. Resolve `model` → enabled `ai_models`; reject tools/images/`n!=1`.
3. Resolve the FX snapshot once (newest stored rate at or before today, else `AI_USD_IDR`) and compute **hold_idr** from `prompt_est` + `max_tokens` at that snapshot — one combined total, rounded up once. `max_tokens` = min(request `max_tokens`/`max_completion_tokens`, model cap, affordable_max_tokens(balance, prompt_est)). If wallet cannot cover 1 in + 1 out token → 402. Coding agents omit `max_tokens` or send 8k–128k. The snapshot (price, HPP, FX) is stored on the reservation and is authoritative at settle.
4. Strip customer auth; set wholesale header; POST upstream (timeout).
5. Stream or JSON to client; parse usage from final chunk / body.
6. `billed_idr`/`cogs_idr` from actual tokens at the **reservation snapshot** (a price or FX edit mid-request cannot change them); settle refunds `hold - billed`, or debits the shortfall up to the available balance and records `shortfall_idr`; write the usage event and one ledger row.
7. Upstream 401/403: generic 502; **never** echo wholesale host or key. Sentry via `log_sanitizer`.

---

## 10. Edge / ops

- Host nginx + compose nginx: `location ^~ /v1/` → backend `:8000`; `proxy_http_version 1.1`; `proxy_buffering off`; `proxy_cache off`; `proxy_read_timeout` ≥ 120s; `X-Accel-Buffering: no`.
- Cloudflare: test **through** orange-cloud; disable buffering if streams stall.
- Flag default **false** in git compose (local/CI/prod until ops).
- Secrets: provider creds in DB envelope or env per provider — **not** in git.
- Do not enqueue chat through Celery scan queues.

---

## 11. SPA

| Path | Who | Notes |
|------|-----|-------|
| `/ai` | JWT org | Keys, usage, wallet, copy `base_url` — **AppShell**, kit only (`Button`/`Input`/`Select`), filter bar like Credit History |
| `/admin/ai` | Admin | Providers, models (USD per 1M + HPP), usage, trial chat |

Register both in `App.tsx` + [`AGENT_PAGE_REGISTRY.md`](../AGENT_PAGE_REGISTRY.md) **in the same implementation PR**. Sidebar distinct from Scan/Guard. Flag-off: route may exist; API 404 + empty copy (SIEM pattern).

---

## 12. Slices (implement as separate PRs)

| Slice | Deliverable | Depends |
|-------|-------------|---------|
| **S0** | This spec + guide pointer | — |
| **S1** | Flag + models/tables Alembic + admin provider/model CRUD | S0 + `buat` |
| **S2** | Wallet + reservation + usage; JWT `/api/ai/wallet|models|usage`; admin topup; no public `/v1` | S1 |
| **S3** | `/v1` + nginx location + customer keys; one wholesaler | S2 |
| **S4** | SPA `/ai` + `/admin/ai` trial chat + i18n | **done** |
| **S5** | Limits, sanitizer tests, ops notes, Playwright smoke flag-off | **done** |
| **S6** | USD-per-1M canonical prices, reservation-locked daily FX for charge + COGS, `ai_wallet_ledger`, admin USD inputs, catalog USD + derived IDR | **done** |

Default order **S1 → S5**. Do not combine with Host Protect / Guard PRs.

---

## 13. Tests (acceptance)

- Flag off: `/v1` and `/api/ai` 404.
- Unknown model / tools / `n=2` rejected.
- Two concurrent streams cannot drive wallet negative.
- Revoked key 401; other org key IDOR 404.
- Usage row has no prompt fields.
- Usage row snapshots price, HPP and FX; a mid-request model or rate change cannot alter the settled amounts.
- Wallet ledger sum equals `balance_idr`; a shortfall is recorded and the balance never goes negative.
- Customer usage JSON exposes only `billed_idr` — no COGS, HPP, margin or FX rate; admin usage exposes them.
- Admin trial counts against platform cap, not customer org.
- Upstream error body does not contain `base_url` or secret fragments.
- Stream: client receives SSE; reservation settled after complete.

---

## 14. Open questions (human — do not invent)

1. List price / floor margin vs HPP (finance).
2. Postpaid GMD `service_id` vs prepaid-only.
3. Customer playground JWT (in-app chat) vs keys-only v1 — **default keys-only + admin trial**.
4. Dedicated uvicorn/service if concurrency hurts scans.
5. Priority vs P14/GTM — **default: spec lands; code waits in queue unless user names this epic + `buat`.**

---

## 15. Docs / hygiene

- This file + one row in `AGENT_EXECUTION_GUIDE.md` Phase B.
- No production hosts, emails, passwords, API keys, customer names.
- Speak Bahasa with the user; spec English (repo convention).
