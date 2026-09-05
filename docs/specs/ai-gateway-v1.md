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

Scan credits (`users.credits` / `credit_logs` / `PricingConfig`) are **job integers**, personal, deduct-on-enqueue. Platform `api_keys` are **admin M2M**, no tenant FK, header `X-API-Key`. Neither is an LLM product.

Prod nginx (`nginx/sinexis.app.conf`) proxies `/api/` and `/ws/` to FastAPI; **`/` is the SPA**. A public `/v1` does not exist today.

---

## 2. Goals

1. OpenAI-compatible **`GET /v1/models`** and **`POST /v1/chat/completions`** (stream + non-stream) for **allowlisted aliases only**.
2. Customer keys `sk-sx-…` via `Authorization: Bearer` (OpenAI SDK drop-in). Prefix + SHA-256; plaintext once; **org-bound**.
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
| Embeddings, TTS, STT, images, tools/functions | Unpriced |
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
| **Unit** | Bill **IDR per 1K prompt + 1K completion** from model row (wholesale USD × FX snapshot × markup). Round **up** to whole IDR. |
| **FX** | Admin-set `AI_USD_IDR` (or per-day table later); no silent live FX |
| **Catalog** | **Named aliases only** (`sinexis/…`); reject unknown `model` |
| **Auth `/v1`** | Customer `Authorization: Bearer sk-sx-…` only. **Never** platform `X-API-Key` / `settings.api_key`. JWT **not** for SDK `/v1`. |
| **Playground / trial** | JWT **admin** → internal `/api/admin/ai/chat`; same proxy; `source=admin_trial`; **platform wallet + monthly IDR cap** |
| **Org roles** | Owner/admin: mint/revoke keys, read usage, spend. Member: use existing keys if issued to them. **Viewer: no mint, no spend.** |
| **Prompt retention** | **Metadata only**. `AI_STORE_PROMPTS=false`. If later true: ≤14d, hashed/redact, admin trial included. |
| **Failure billing** | Never charge **above** provider-reported usage. Missing usage / transport fail / 4xx before tokens → **charge 0**, release hold, log. Partial stream: settle on last usage chunk if present else 0. |
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
| **SDK client** | OpenAI SDK `base_url=…/v1`, `api_key=sk-sx-…` |
| **Upstream** | HTTPS OpenAI-compat `chat/completions` only |

---

## 6. Architecture

```text
SDK  -- Bearer sk-sx- -->  nginx ^~ /v1/  -->  FastAPI AI gateway
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

**Middleware:** exclude `/v1` from requiring platform `X-API-Key`. Dedicated authenticator for `sk-sx-` Bearer. Do not treat JWT user tokens as customer AI keys (30-min TTL).

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
| `hpp_usd_per_1k_in` / `hpp_usd_per_1k_out` | wholesale |
| `markup_bps` | basis points over FX’d HPP, or explicit `price_idr_per_1k_*` — pick one in S1 (prefer **explicit IDR sell prices** + HPP for margin reports) |
| `max_ctx` / `max_tokens_cap` | |
| `enabled` | |

### 7.3 `ai_api_keys`

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `organization_id` | required |
| `created_by_user_id` | |
| `name` | |
| `prefix` | `sk-sx-` + 8 chars public |
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

Platform trial: a **synthetic org** or `ai_platform_wallet` row with monthly cap.

### 7.5 `ai_reservations`

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `wallet_id` / `organization_id` | |
| `key_id` | nullable for admin trial |
| `hold_idr` | conservative cap (`max_tokens` × sell price) |
| `status` | `open` \| `settled` \| `released` |
| `created_at` | TTL job releases stale `open` |

### 7.6 `ai_usage_events` (append-only)

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `organization_id`, `user_id` nullable, `key_id` nullable |
| `source` | `customer` \| `admin_trial` |
| `model_public_id`, `provider_id` |
| `prompt_tokens`, `completion_tokens` |
| `billed_idr`, `cogs_idr` |
| `latency_ms`, `http_status`, `finish_reason` |
| `provider_request_id` | if any |
| `reservation_id` | |
| **no** prompt/completion text v1 |

HPP AI **must not** reuse `hpp_rates` scan-job rows. Optional later: `/admin/hpp` tab or `/admin/ai` only.

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

---

## 9. Request lifecycle (`/v1/chat/completions`)

1. Authenticate `sk-sx-`; load org + wallet; enforce RPM/TPM/concurrent.
2. Resolve `model` → enabled `ai_models`; reject tools/images/`n!=1`.
3. Compute **hold_idr** from `max_tokens` (or model cap) × sell price; `SELECT … FOR UPDATE` wallet; if `balance < hold` → 402; insert reservation `open`; debit hold.
4. Strip customer auth; set wholesale header; POST upstream (timeout).
5. Stream or JSON to client; parse usage from final chunk / body.
6. `billed_idr` from actual tokens; `cogs_idr` from HPP×FX; settle: credit back `hold - billed` (or full release if 0); write usage event.
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
| `/admin/ai` | Admin | Providers, models, usage, trial chat |

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

Default order **S1 → S5**. Do not combine with Host Protect / Guard PRs.

---

## 13. Tests (acceptance)

- Flag off: `/v1` and `/api/ai` 404.
- Unknown model / tools / `n=2` rejected.
- Two concurrent streams cannot drive wallet negative.
- Revoked key 401; other org key IDOR 404.
- Usage row has no prompt fields.
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
