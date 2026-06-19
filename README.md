# VulnScanner

Web-based vulnerability scanner with 3 scan modes — IP, domain, and APK/IPA mobile analysis. Deployed via Docker Compose with async task processing.

## Architecture

```
┌─────────────────────────────────────────────┐
│                   nginx :80                  │
├─────────────────────────────────────────────┤
│         frontend (React + Vite) :5173        │
├─────────────────────────────────────────────┤
│            backend (FastAPI) :8000           │
├──────┬──────┬──────┬────────────────────────┤
│ ip   │domain│mobile│                        │
│worker│worker│worker│  Redis ── Postgres     │
└──────┴──────┴──────┴────────────────────────┘
```

## Quick Start

```bash
# 1. Clone & configure
cp .env.example .env
# Edit .env — set API_KEY to a secret value

# 2. Start all services
docker compose up -d

# 3. Open dashboard
# http://localhost
```

## Scan Modes

| Mode | Input | What It Does |
|------|-------|-------------|
| **IP Scanner** | IP address | Port scan via nmap (`-sV -sC -O`), CVE lookup via OSV.dev, severity classification |
| **Domain Scanner** | Domain name | DNS resolution, subdomain enum (crt.sh), SSL/TLS analysis, security headers audit, tech stack fingerprinting |
| **Mobile Scanner** | APK/IPA file | Manifest analysis, permission classification, exported component detection, hardcoded secret scanning |

## API

All endpoints require `X-API-Key` header.

```bash
# Start scan
curl -X POST http://localhost/api/scan \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"scan_type": "ip", "target": "8.8.8.8"}'

# Get results
curl http://localhost/api/scan/{id} \
  -H "X-API-Key: your-key"

# Export HTML report
curl http://localhost/api/scan/{id}/export?format=html \
  -H "X-API-Key: your-key" -o report.html
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | `dev-api-key-change-me` | API authentication key |
| `DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection string |

## Services

| Service | Port | Description |
|---------|------|-------------|
| nginx | `:80` | Reverse proxy |
| frontend | `:5173` | React dashboard |
| backend | `:8000` | FastAPI REST API |
| ip_worker | — | IP scan tasks |
| domain_worker | — | Domain scan tasks |
| mobile_worker | — | Mobile scan tasks |
| postgres | `:5432` | Database |
| redis | `:6379` | Message broker / cache |

## Tech Stack

- **Frontend**: TypeScript, React, Vite, TailwindCSS, shadcn/ui
- **Backend**: Python, FastAPI, SQLAlchemy, Alembic
- **Workers**: Celery, Redis
- **CVE Source**: OSV.dev (free, no API key)
- **Deployment**: Docker Compose

## License

MIT
