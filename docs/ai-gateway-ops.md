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

## Secrets

Provider credentials live encrypted in DB (or env per provider). Never commit wholesale URLs with keys, customer `sk-sx-` plaintext, or host SSH details.

## Routine deploy

Prefer `scripts/deploy-services.sh` (includes Alembic when `backend` is listed). Do **not** run Alembic by SSH after a green `main` CI deploy job.

```bash
COMPOSE_PROJECT_NAME=<from_inspect> ./scripts/deploy-services.sh . backend frontend
```

Flag stays **off** until ops sets `AI_GATEWAY_ENABLED` on the host.
