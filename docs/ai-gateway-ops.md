# AI Gateway — operator note (S1–S7.3.7)

Short ops reference. No secrets, hosts, or wholesale keys in this file. Set values via env / host `.env`.

## Flag

| Variable | Git compose default | Effect |
|----------|---------------------|--------|
| `AI_GATEWAY_ENABLED` | **false** | Off → `/v1` and `/api/ai*` **404**. SPA `/ai` still routes; shows flag-off copy. |

Do **not** flip the git default: git is the fallback. Production reads the value from the deploy
secret written into the host `.env` by the CI `deploy` job, so a wrong default here must never turn a
billing surface on by accident.

Confirm what is actually live instead of reading compose:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/v1/models
```

`404` = flag off. `401` (invalid API key) = flag on, auth reachable.

The tuning knobs (`AI_UPSTREAM_*`, `AI_BREAKER_*`, `AI_PROVIDER_PROBE_*`) follow the same path: the
deploy job writes them into the host `.env` from secrets, falling back to the compose defaults listed
under **Time budget**. Tune them as secrets, not by editing `.env` — the next deploy rewrites that file.

## What must be running

| Piece | Why |
|-------|-----|
| **backend** | `/v1/chat/completions`, `/v1/models`, JWT `/api/ai*`, admin `/api/admin/ai*` |
| **postgres** | Catalog, keys, wallet, reservations, usage |
| **redis** | Per-key RPM / TPM / concurrent (`ai:rpm:`, `ai:tpm:`, `ai:conc:`) **and** the upstream circuit breaker (`ai:cb:`). Redis down → **503** `rate_limit_unavailable` (fail closed, unchanged). The breaker is the opposite: it **fails open**, see below. |
| **celery beat + `ip_scan` worker** | `ai_providers.probe` every 5 min and `ai_reservations.reap`. Missing beat does **not** break chat; it stops health detection and hold reaping. |
| **host nginx** | `location ^~ /v1/` → backend `:8000` |

Scan workers are **not** on the chat path; only beat's AI tasks ride `ip_scan`.

## Nginx (SSE)

Compose `nginx/default.conf` and prod `nginx/sinexis.app.conf` already have `/v1/`:

- `proxy_http_version 1.1`
- `proxy_buffering off`
- `proxy_cache off`
- `proxy_read_timeout` / `proxy_send_timeout` **120s**

After copying host nginx, `nginx -t` and reload. Cloudflare: test streaming **through** orange-cloud; disable response buffering if SSE stalls.

## Limits (v1 defaults, per customer key)

| Limit | Default |
|-------|---------|
| RPM | 60 |
| TPM | 100_000 |
| Concurrent | 2 |

Stored on `ai_api_keys`. 429 details: `rate_limit_rpm` / `rate_limit_tpm` / `rate_limit_concurrent`.

## Wallet

Prepaid **org** IDR. Reserve before upstream; settle/release after. Insufficient → **402**. Admin trial chat uses platform cap, not the customer org wallet.

## Upstream failover (S7)

Each `ai_models` row still has one **primary** (`provider_id` + `upstream_id`). Up to **three** ordered
fallbacks live in `ai_model_upstreams` (`rank` 1..3). Manage them at `/admin/ai?tab=models` →
row `…` → **Kelola upstream**.

How the candidate list is built, in this exact order:

1. **Drop** a candidate whose provider is `enabled = false` or `status = 'disabled'` — the primary too.
   If this leaves nothing, the request is `404 model_not_found` and no upstream is called.
2. **Order** by `rank`, with `degraded` providers moved to the end (rank order is preserved inside each
   group, so a degraded `#2` is still tried before a degraded `#3`).
3. **Cap** at `AI_UPSTREAM_MAX_CANDIDATES`, which is why the admin API refuses a fourth fallback.
4. **Drop** a candidate whose breaker is open. If that would empty the list, the full list is used
   anyway (**fail open**) — an open breaker must never turn a priced request into a `404`.
5. Try what remains, in order.

Retry happens only **before the first streamed byte**:

| Upstream answer | Retried on the next candidate? |
|---|---|
| `TransportError`, connect/read timeout | yes |
| `401` `403` `429` `500` `502` `503` `504` | yes |
| `400` `404` `409` `413` `422`, other `4xx` | **no** — terminal, and it does not touch the breaker |
| `200` with a non-JSON body | **no** — surfaces as `502` to the customer |
| any answer after the first streamed byte | **no** |

### Time budget

| Variable | Default | Meaning |
|---|---|---|
| `AI_UPSTREAM_FAILOVER_DEADLINE_SECONDS` | `100` | Whole-request budget. Must stay **below** nginx `proxy_read_timeout` (120s) so the gateway answers before the proxy gives up. |
| `AI_UPSTREAM_TIMEOUT_SECONDS` | `120` | Hard ceiling per attempt; every attempt is additionally clamped to whatever is left of the budget. |
| `AI_UPSTREAM_CONNECT_TIMEOUT_SECONDS` | `10` | Fail an unreachable provider fast instead of burning the budget. |
| `AI_UPSTREAM_STREAM_IDLE_TIMEOUT_SECONDS` | `45` | Streaming idle read timeout, so a provider that accepts then stalls is failed over **before** the first byte. |
| `AI_UPSTREAM_MIN_ATTEMPT_SECONDS` | `5` | Do not start an attempt with less budget than this left. |
| `AI_UPSTREAM_MAX_CANDIDATES` | `4` | Primary + 3 fallbacks. The admin API enforces the same ceiling. |
| `AI_UPSTREAM_FAILOVER_ENABLED` | `true` | Set `false` to force a single attempt to the primary (today's pre-S7 behaviour). |

**Known limit:** a *non-streaming* provider that stays silent cannot be failed over, because its read
timeout *is* the remaining budget and shortening it would break legitimate slow completions. The
breaker mitigates repeat offenders; it cannot help the first stall.

## Circuit breaker + health probe (S7.3)

**One writer per state.** Only the request path writes `ai:cb:*`; only the probe writes
`ai_providers.status`. The probe must never clear a breaker — a `2xx` on `/models` is not evidence that
`/chat/completions` works.

| Key | Set by | TTL |
|---|---|---|
| `ai:cb:{provider_id}:fails` | every retryable failure | `AI_BREAKER_WINDOW_SECONDS` (120) |
| `ai:cb:{provider_id}:open` | failure count reaches `AI_BREAKER_FAILURE_THRESHOLD` (5) | `AI_BREAKER_COOLDOWN_SECONDS` (60) |

One success deletes both. A `4xx` (client error) is never counted. Any Redis error disables the
breaker rather than the traffic.

`ai_providers.probe` (beat, every 5 min, queue `ip_scan`) GETs `{base_url}/models`:

| Probe answer | `ai_providers.status` |
|---|---|
| `2xx` | `ok` |
| `401` / `403` | `degraded` |
| `5xx` | `degraded` |
| timeout / connection error | `degraded` |
| any other `4xx` | **untouched** — some vendors have no `/models` |

`last_probed_at` is written only when the probe reaches one of those verdicts. If the request
cannot even be built (an unreadable credential, a rotated encryption key, any unexpected
exception) the timestamp is left as-is, so it never claims a check that did not happen. That is
what lets `vuln_ai_providers_probe_age_seconds` stay honest.

Limit worth knowing: the age gauge reads `MIN(last_probed_at)`, which ignores `NULL`. So it catches
a probe that is dead for **every** provider, but not a single provider that always errors while
the rest are fine. That gap is covered twice over: `vuln_ai_providers_never_probed` counts exactly
those rows for Prometheus, and the Providers tab shows each provider's last check time for a human.

`degraded` providers stay in rotation but are tried last. A human never sets `degraded`: the probe
owns it. The two suppression flags are separate but have the same effect on both routing and probing:

| Flag | Set from | Routed? | Probed? |
|---|---|---|---|
| `enabled = false` | Providers tab → **Nonaktifkan**, or `PATCH {enabled:false}` | no | **no** (the probe selects `enabled IS TRUE`) |
| `status = 'disabled'` | API only; the Providers tab shows it as not routed, and **Aktifkan** clears it | no | **no** |

So switching a provider off is not a pause: nothing checks it, and it stays out until someone turns
it back on. Rotate an expired key instead of disabling the provider you intend to keep using.

Breaker entries are skipped for their TTL only. To force a provider back into rotation before the
cooldown ends, delete its keys:

```bash
redis-cli --scan --pattern 'ai:cb:<provider_id>:*' | xargs -r redis-cli del
```

## Monitoring


Every sample is on `/metrics` and ignores scrape failures: when a read fails the sample is
**omitted** rather than reported as `0`, so a gap is "unknown", never "healthy".

`/metrics` authenticates with the platform key — `X-API-Key: $API_KEY`, compared in constant time.
Any other header, including `Authorization: Bearer …`, gets `401`. Optional hardening on the host:
add an `allow <scraper-cidr>; deny all;` line to the `/metrics` location, but only once the scraper's
address is known — a wrong allowlist makes the scrape fail silently, which looks exactly like a
healthy stack.

| Metric | Type | Meaning |
|--------|------|---------|
| `vuln_ai_fx_rate_age_days` | gauge | Age in days of the newest stored `USD -> IDR` rate (`ai_fx_rates.effective_date`). `+Inf` means no matching row exists yet. |
| `vuln_ai_usage_shortfall_idr_24h` | gauge | Sum of `ai_usage_events.shortfall_idr` for rows created in the last 24h — IDR billed but not collected. |
| `vuln_ai_wallet_ledger_drift_idr` | gauge | Largest `ABS(ai_wallets.balance_idr - SUM(ai_wallet_ledger.delta_idr))` across wallets; `0` when every balance matches its ledger. |
| `vuln_ai_stale_open_reservations` | gauge | Count of `open` `ai_reservations` rows older than the 20-minute reaper threshold; `0` healthy. |
| `vuln_ai_upstream_attempts_total` | counter | One increment per upstream attempt. `outcome` = `served` \| `retried` \| `failed` \| `rejected`; `reason` = `none` \| `transport` \| `auth` \| `rate_limit` \| `server_error` \| `client_error`; `model` = the alias. |
| `vuln_ai_upstream_breakers_open` | gauge | Open breaker keys in Redis. Above `0` means at least one provider is being skipped. |
| `vuln_ai_providers_degraded` | gauge | Enabled providers with `status = 'degraded'` — still used, but tried last. |
| `vuln_ai_providers_never_probed` | gauge | Enabled, non-disabled providers with **no** `last_probed_at`. Above `0` means the probe cannot even build a request for them: unreadable credential, rotated key, malformed base URL. Sample omitted when the gateway or the probe is switched off. |
| `vuln_ai_providers_probe_age_seconds` | gauge | Seconds since the oldest enabled, non-disabled provider was probed; `+Inf` means the probe has never run; omitted when no provider is enabled. |

Reading the counter:

- `retried` + `served` for one request is normal failover.
- `failed` means **every** candidate failed and the customer got an upstream error.
- `rejected` is a non-retryable `4xx` from the provider: the alias points at an upstream model id that
  refuses the request (retired model, unsupported parameter). Failover never retries these by design.
- A rising `retried` share with flat `failed` means a primary is degraded and failover is hiding it —
  that is the case that silently costs duplicate COGS.

> **These rules are a template, not an active deployment.** Nothing in this repo ships
> Prometheus or Alertmanager — `docker-compose.yml` and `docker-compose.prod.yml` contain neither,
> and `monitoring/` holds example files only. Until an operator deploys them
> (`monitoring/prometheus-scrape.example.yml` + these rules) and the target shows `up`, **none of
> these alerts fire**. Treat `/metrics` as data you have collected, not as monitoring you have.

| Alert | Expression | For | Severity |
|-------|------------|-----|----------|
| `VulnScannerAiFxRateStale` | `vuln_ai_fx_rate_age_days > 2` | 1h | warning |
| `VulnScannerAiBillingShortfall` | `vuln_ai_usage_shortfall_idr_24h > 0` | 15m | warning |
| `VulnScannerAiWalletLedgerDrift` | `vuln_ai_wallet_ledger_drift_idr > 0` | 30m | warning |
| `VulnScannerAiStaleReservations` | `vuln_ai_stale_open_reservations > 0` | 15m | warning |
| `VulnScannerAiUpstreamAuthRejected` | `sum(rate(vuln_ai_upstream_attempts_total{reason="auth"}[5m])) > 0` | 5m | **critical** |
| `VulnScannerAiUpstreamFailedRequests` | `sum(rate(vuln_ai_upstream_attempts_total{outcome="failed"}[10m])) > 0` | 10m | **critical** |
| `VulnScannerAiUpstreamFailoverRate` | `sum(rate(vuln_ai_upstream_attempts_total{outcome=~"retried&#124;failed"}[15m])) / sum(rate(vuln_ai_upstream_attempts_total[15m])) > 0.2` | 15m | warning |
| `VulnScannerAiUpstreamRejectedRequests` | `sum(rate(vuln_ai_upstream_attempts_total{outcome="rejected"}[30m])) > 0` | 30m | warning |
| `VulnScannerAiUpstreamBreakerOpen` | `vuln_ai_upstream_breakers_open > 0` | 10m | warning |
| `VulnScannerAiProvidersDegraded` | `vuln_ai_providers_degraded > 0` | 15m | warning |
| `VulnScannerAiProviderNeverProbed` | `vuln_ai_providers_never_probed > 0` | 30m | warning |
| `VulnScannerAiProviderProbeStale` | `vuln_ai_providers_probe_age_seconds > 900` | 10m | warning |

First response:

- **FX stale** — check `ai_fx.refresh` logs (runs daily at 01:10 UTC on the `ip_scan` worker) and the worker env (DB / FX source credentials). Check both providers (primary `AI_FX_SOURCE_URL`, then fallback `AI_FX_FALLBACK_URL`) before entering a manual rate. Then use the admin FX card **Refresh now**, or enter a manual rate, to unblock billing until the fetch is fixed.
- **Shortfall** — a settle could not collect the full amount because the org wallet was exhausted. Inspect the wallet balance and the matching `ai_usage_events` row (`shortfall_idr`), then top up the wallet / reconcile with the customer.
- **Wallet ledger drift** — a wallet balance no longer matches its ledger sum, which means a code path mutated the balance without a ledger row (or a manual DB edit). Inspect `ai_wallets` vs `ai_wallet_ledger` for the offending organization, and never "fix" it by editing only one side.
- **Stale reservations** — `ai_reservations.reap` runs every 5 minutes on the `ip_scan` queue and releases holds older than 20 minutes. A sustained count means beat or its worker is not consuming, so customer funds stay locked. Check the beat schedule and worker logs, then run the task manually if needed.
- **Upstream auth rejected** — a wholesale key is expired or revoked. Every request to that provider
  fails over and pays duplicate COGS. Fix the credential in `/admin/ai?tab=providers`; do **not** set
  the provider `disabled` for an expired key you intend to rotate, because a disabled provider is not
  probed and stays out of rotation.
- **Upstream failed requests** — all candidates failed, so customers are getting upstream errors. Check
  provider status and the `ai_upstream_attempt_failed` log lines for the failing model and reason.
- **Failover rate above 20%** — a primary is degraded but failover is hiding it from customers.
  Inspect the `reason` label, then the provider row.
- **Upstream rejected** — sustained non-retryable `4xx`. The alias points at an upstream model id that
  no longer accepts this request. Compare the model's primary and fallback `upstream_id` values.
- **Breaker open** — at least one provider is being skipped for its cooldown. If it stays open, the
  provider is down; check `/admin/ai?tab=providers` and the probe output.
- **Providers degraded** — the probe (or an admin) marked a provider `degraded`. It is still used, only
  tried last. Verify before touching anything: a provider that answers `/models` but fails
  `/chat/completions` will not show up here.
- **Provider never probed** — a provider has produced no verdict for 30 minutes, so the probe cannot
  build a request for it. Rotate the credential or check `credential_enc` decryption; the provider
  stays at its last known `status` until it does. This is the case the age gauge cannot see, because
  `MIN(last_probed_at)` ignores `NULL`.
- **Provider probe stale** — `ai_providers.probe` runs every 5 minutes, so 15 minutes means at least
  three cycles were missed and `status` is frozen: the fleet looks healthy while nothing is being
  checked. First check that celery beat is running and that `ai_providers.probe` is routed to the
  `ip_scan` queue (compose `task_routes`), then read the worker logs.

Rules template: [`monitoring/alerts-vuln-scanner.example.yml`](../monitoring/alerts-vuln-scanner.example.yml).

## First live smoke test

Run once after the flag is on and the catalog is populated. This is the only step that proves the
whole path — tests cover the code, not the deployment. Replace `<host>`; never paste keys into a
ticket or chat.

1. **Catalog exists.** In `/admin/ai?tab=providers` at least one provider must be `enabled` with
   `status` `ok` and a working credential, and in `?tab=models` at least one model must be `enabled`
   with both sell prices and HPP filled in.
2. **Flag is on.**
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://<host>/v1/models   # expect 401
   ```
3. **Key works.** Create a key at `/ai`, then:
   ```bash
   curl -s https://<host>/v1/models -H "Authorization: Bearer <key>" | head
   ```
   An empty `data` array means the catalog has no enabled model.
4. **One real completion.**
   ```bash
   curl -s https://<host>/v1/chat/completions \
     -H "Authorization: Bearer <key>" -H 'Content-Type: application/json' \
     -d '{"model":"<alias>","messages":[{"role":"user","content":"say ok"}],"max_tokens":8}'
   ```
5. **Billing landed once.** In `/admin/ai?tab=usage` the new row must show one row per request with
   `billed_idr > 0`, `cogs_idr > 0`, and `provider_id` equal to the provider that actually served —
   not necessarily the primary, if a fallback was used.
6. **Counter moved.** `/metrics` takes the **platform** key in `X-API-Key`, not a bearer token —
   the API rejects anything else, so a `Bearer` header returns `401`.
   ```bash
   curl -s https://<host>/metrics -H "X-API-Key: $API_KEY" \
     | grep vuln_ai_upstream_attempts_total
   ```
   Expect `outcome="served"` to increase by exactly 1. Any `retried`/`failed` on a healthy stack means
   the primary is not answering.

Rollback if anything above fails: set `AI_GATEWAY_ENABLED=false` on the host and redeploy. The
gateway is the only billed surface here, so turning it off is always the safe first move.

## Secrets

Provider credentials live encrypted in DB (or env per provider). Never commit wholesale URLs with keys, customer `sx-` plaintext, or host SSH details.

## Routine deploy

Prefer `scripts/deploy-services.sh` (includes Alembic when `backend` is listed). Do **not** run Alembic by SSH after a green `main` CI deploy job.

```bash
COMPOSE_PROJECT_NAME=<from_inspect> ./scripts/deploy-services.sh . backend frontend
```

The flag is controlled by the deploy secret, not by this repo (see **Flag**). Do not hand-edit the
host `.env`: the next deploy rewrites it.
