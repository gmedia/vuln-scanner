# AI Gateway — operator note (S5)

Short ops reference. No secrets, hosts, or wholesale keys in this file. Set values via env / host `.env`.

## Flag

| Variable | Git compose default | Effect |
|----------|---------------------|--------|
| `AI_GATEWAY_ENABLED` | **false** | Off → `/v1` and `/api/ai*` **404**. SPA `/ai` still routes; shows flag-off copy. |

Do **not** flip the git default. Enable only on the deploy host env if product wants it live.

## What must be running

| Piece | Why |
|-------|-----|
| **backend** | `/v1/chat/completions`, `/v1/models`, JWT `/api/ai*`, admin `/api/admin/ai*` |
| **postgres** | Catalog, keys, wallet, reservations, usage |
| **redis** | Per-key RPM / TPM / concurrent (`ai:rpm:`, `ai:tpm:`, `ai:conc:`). Redis down → **503** `rate_limit_unavailable` (fail closed). |
| **host nginx** | `location ^~ /v1/` → backend `:8000` |

Scan workers / Celery are **not** on the chat path.

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

## Monitoring

All four gauges are on `/metrics` (API-key protected) and ignore scrape failures: if the DB read fails, the sample is **omitted** rather than reported as `0`.

| Metric | Type | Meaning |
|--------|------|---------|
| `vuln_ai_fx_rate_age_days` | gauge | Age in days of the newest stored `USD -> IDR` rate (`ai_fx_rates.effective_date`). `+Inf` means no matching row exists yet. |
| `vuln_ai_usage_shortfall_idr_24h` | gauge | Sum of `ai_usage_events.shortfall_idr` for rows created in the last 24h — IDR billed but not collected. |
| `vuln_ai_wallet_ledger_drift_idr` | gauge | Largest `ABS(ai_wallets.balance_idr - SUM(ai_wallet_ledger.delta_idr))` across wallets; `0` when every balance matches its ledger. |
| `vuln_ai_stale_open_reservations` | gauge | Count of `open` `ai_reservations` rows older than the 20-minute reaper threshold; `0` healthy. |

| Alert | Expression | For | Severity |
|-------|------------|-----|----------|
| `VulnScannerAiFxRateStale` | `vuln_ai_fx_rate_age_days > 2` | 1h | warning |
| `VulnScannerAiBillingShortfall` | `vuln_ai_usage_shortfall_idr_24h > 0` | 15m | warning |
| `VulnScannerAiWalletLedgerDrift` | `vuln_ai_wallet_ledger_drift_idr > 0` | 30m | warning |
| `VulnScannerAiStaleReservations` | `vuln_ai_stale_open_reservations > 0` | 15m | warning |

First response:

- **FX stale** — check `ai_fx.refresh` logs (runs daily at 01:10 UTC on the `ip_scan` worker) and the worker env (DB / FX source credentials). Then use the admin FX card **Refresh now**, or enter a manual rate, to unblock billing until the fetch is fixed.
- **Shortfall** — a settle could not collect the full amount because the org wallet was exhausted. Inspect the wallet balance and the matching `ai_usage_events` row (`shortfall_idr`), then top up the wallet / reconcile with the customer.
- **Wallet ledger drift** — a wallet balance no longer matches its ledger sum, which means a code path mutated the balance without a ledger row (or a manual DB edit). Inspect `ai_wallets` vs `ai_wallet_ledger` for the offending organization, and never "fix" it by editing only one side.
- **Stale reservations** — `ai_reservations.reap` runs every 5 minutes on the `ip_scan` queue and releases holds older than 20 minutes. A sustained count means beat or its worker is not consuming, so customer funds stay locked. Check the beat schedule and worker logs, then run the task manually if needed.

Rules template: [`monitoring/alerts-vuln-scanner.example.yml`](../monitoring/alerts-vuln-scanner.example.yml).

## Secrets

Provider credentials live encrypted in DB (or env per provider). Never commit wholesale URLs with keys, customer `sx-` plaintext, or host SSH details.

## Routine deploy

Prefer `scripts/deploy-services.sh` (includes Alembic when `backend` is listed). Do **not** run Alembic by SSH after a green `main` CI deploy job.

```bash
COMPOSE_PROJECT_NAME=<from_inspect> ./scripts/deploy-services.sh . backend frontend
```

Flag stays **off** until ops sets `AI_GATEWAY_ENABLED` on the host.
