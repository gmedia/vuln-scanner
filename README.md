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

## Local Development

Prerequisites: Node.js 20+, Python 3.12+, Docker (PostgreSQL & Redis).

### 1. Infrastructure (PostgreSQL + Redis)

```bash
docker run -d --name vscan-pg -e POSTGRES_USER=vscan -e POSTGRES_PASSWORD=vscan -e POSTGRES_DB=vscan -p 5432:5432 postgres:16
docker run -d --name vscan-redis -p 6379:6379 redis:8
```

### 2. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start dev server (hot-reload)
uvicorn app.main:app --reload --port 8000
```

### 3. Workers

Open separate terminals — one per queue:

```bash
cd workers
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Terminal 1 — IP scans
celery -A celery_app worker -Q ip_scan --loglevel=info

# Terminal 2 — Domain scans
celery -A celery_app worker -Q domain_scan --loglevel=info

# Terminal 3 — Mobile scans
celery -A celery_app worker -Q mobile_scan --loglevel=info
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev  # → http://localhost:5173
```

### Project Structure

```
vuln-scanner/
├── backend/             # FastAPI app
│   ├── app/
│   │   ├── api/         # Routes, WebSocket, router
│   │   ├── models/      # SQLAlchemy models
│   │   ├── schemas/     # Pydantic schemas
│   │   └── services/    # Business logic
│   └── alembic/         # DB migrations
├── workers/             # Celery workers
│   ├── tasks/           # ip_scan, domain_scan, mobile_scan
│   └── utils/           # nmap, CVE lookup, domain/mobile utils
├── frontend/            # React + Vite
│   └── src/
│       ├── api/         # API client
│       ├── components/  # UI components
│       ├── hooks/       # WebSocket hooks
│       ├── pages/       # Page views
│       └── store/       # State management
├── nginx/               # Reverse proxy config
├── docker-compose.yml   # Production stack
└── .env.example         # Environment template
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
