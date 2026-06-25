# Contributing to VulnScanner

Thank you for your interest in contributing to VulnScanner. This guide covers everything you need to get started.

## Local Development Setup

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker (for PostgreSQL and Redis)

### 1. Infrastructure

Start PostgreSQL and Redis:

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

Open separate terminals, one per queue:

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
npm run dev  # Opens at http://localhost:5173
```

## Running Tests

### Backend

```bash
cd backend
rtk test
```

The `rtk` tool wraps pytest with the project's standard configuration.

### Frontend

```bash
cd frontend
npm test
```

## Code Style

### Python

We use `ruff` for linting and `mypy` for type checking:

```bash
# Lint
ruff check .

# Type check
mypy .
```

### TypeScript

We use ESLint and the TypeScript compiler:

```bash
# Lint
npm run lint

# Type check
npx tsc --noEmit
```

## Pull Request Process

1. **Create a branch** from `main` with a descriptive name:
   - `feat/scan-scheduling` for new features
   - `fix/auth-validation` for bug fixes
   - `docs/api-reference` for documentation

2. **Run tests locally** before pushing:
   - Backend: `rtk test`
   - Frontend: `npm test`

3. **Ensure CI passes** on your PR. CI runs:
   - Linting (ruff, ESLint)
   - Type checking (mypy, tsc)
   - All tests

4. **Get one approval** from a maintainer before merging.

5. **Squash and merge** your PR when approved.

## Commit Conventions

We follow conventional commits. Use one of these prefixes:

| Prefix | Use For |
|--------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `security:` | Security improvements and vulnerability fixes |
| `deps:` | Dependency updates |
| `ci:` | CI/CD changes |
| `test:` | Test additions or modifications |
| `chore:` | Maintenance tasks, refactoring |
| `docs:` | Documentation updates |

Examples:

```
feat: add scan scheduling with cron expressions
fix: validate scan_type parameter in history endpoint
security: sanitize zip member paths to prevent ZIP slip
deps: bump pytest-asyncio to 1.4.0
```

## Security

### Never Commit Secrets

- Do not commit API keys, passwords, or tokens.
- Use `.env` files for local configuration (copy from `.env.example`).
- `.env` is gitignored. Never add secrets to `.env.example`.

### Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly by emailing the maintainers directly rather than opening a public issue. Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## License

VulnScanner is released under the MIT License. By contributing, you agree that your contributions will be licensed under the same terms.
