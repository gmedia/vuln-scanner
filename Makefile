.PHONY: help install lint lint-fix typecheck test clean dev

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Install ──────────────────────────────────────────────────────────

install: ## Install all dependencies (backend + workers + frontend)
	cd backend && pip install -r requirements.txt
	cd workers && pip install -r requirements.txt
	cd frontend && npm ci

install-dev: install ## Install dependencies + pre-commit hooks + dev tools
	pip install pre-commit
	pre-commit install

# ── Lint ─────────────────────────────────────────────────────────────

lint: ## Run all linters (ruff + mypy + eslint)
	cd backend && ruff check && mypy --config-file=pyproject.toml .
	cd workers && ruff check && mypy --config-file=pyproject.toml .
	cd frontend && npm run lint

lint-fix: ## Auto-fix lint issues where possible
	cd backend && ruff check --fix && ruff format
	cd workers && ruff check --fix && ruff format
	cd frontend && npx eslint src/ --fix

typecheck: ## Run type checks only
	cd backend && mypy --config-file=pyproject.toml .
	cd workers && mypy --config-file=pyproject.toml .
	cd frontend && npx tsc --noEmit

# ── Test ─────────────────────────────────────────────────────────────

test: ## Run all tests
	cd backend && python -m pytest tests/ -v --tb=short
	cd workers && python -m pytest tests/ -v --tb=short
	cd frontend && npm test

test-backend: ## Run backend tests only
	cd backend && python -m pytest tests/ -v --tb=short

test-workers: ## Run workers tests only
	cd workers && python -m pytest tests/ -v --tb=short

test-frontend: ## Run frontend tests only
	cd frontend && npm test

test-e2e: ## Run Playwright E2E tests
	cd frontend && npx playwright test

# ── Pre-commit ───────────────────────────────────────────────────────

pre-commit: ## Run pre-commit on all files
	pre-commit run --all-files

pre-commit-staged: ## Run pre-commit on staged files only
	pre-commit run

# ── Clean ────────────────────────────────────────────────────────────

clean: ## Remove build artifacts, caches, venvs
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -not -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
	rm -rf frontend/dist 2>/dev/null || true

# ── Dev ──────────────────────────────────────────────────────────────

dev: ## Start development environment (Docker infrastructure + instructions)
	@echo "Starting PostgreSQL + Redis..."
	@docker start vscan-pg vscan-redis 2>/dev/null || \
		(docker run -d --name vscan-pg \
			-e POSTGRES_USER=vscan \
			-e POSTGRES_PASSWORD=vscan \
			-e POSTGRES_DB=vscan \
			-p 5432:5432 postgres:16 && \
		 docker run -d --name vscan-redis -p 6379:6379 redis:8)
	@echo ""
	@echo "Infrastructure running. Start services in separate terminals:"
	@echo ""
	@echo "  Backend:   cd backend && uvicorn app.main:app --reload --port 8000"
	@echo "  IP Worker: cd workers && celery -A celery_app worker -Q ip_scan --loglevel=info"
	@echo "  Domain:    cd workers && celery -A celery_app worker -Q domain_scan --loglevel=info"
	@echo "  Mobile:    cd workers && celery -A celery_app worker -Q mobile_scan --loglevel=info"
	@echo "  Frontend:  cd frontend && npm run dev"
	@echo ""
	@echo "Dashboard: http://localhost:5173"

ci-check: lint test typecheck ## Run all checks CI would run
	@echo "All CI checks passed."
