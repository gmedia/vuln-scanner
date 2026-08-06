# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Align frontend CI Node with Docker builder (`node-version: "24"`; docs `Node.js 24+`; `engines.node >=24`)
- Add `frontend/components.json` for shadcn/ui CLI (new-york, CSS variables, `@/` aliases)
- Auth brand mark links to landing (`/`)
- Landing footer and `package.json` version display `1.2.0` (aligned with last release tag)

### Fixed

- Vite/Vitest alias: use `import.meta.dirname` instead of `__dirname` (native config loader)
- NotFound: guest primary CTA is home + Sign in; dashboard only when authenticated (calls `initialize()` so session tokens apply on bare 404 routes)
- Hide browser-native number spinners on shadcn `Input` (`type="number"`)
- Pin landing footer to viewport bottom on tall displays (sticky flex shell)
- Keep DatePicker month nav chevrons inside calendar card (`rdp-*` classNames)
- Replace default Vite favicon with brand Crosshair mark (SVG/ICO/PNG)
- Inter / JetBrains fonts, dark scrollbar, shadcn form controls polish

### Security

- nginx hardening: server_tokens off, TLS ciphers, OCSP stapling, CSP headers, buffer protections, proxy_hide_headers

## [1.2.0] - 2026-06-24

### Security

- Eliminated all pip-audit CVEs in backend dependencies
- Hardened workers dependencies with security bumps
- Fixed IDOR vulnerability in scan result endpoint by enforcing ownership check
- Fixed XSS vulnerability by forcing octet-stream Content-Type on JSON exports
- Fixed ZIP slip vulnerability by sanitizing zip member paths in mobile utils
- Fixed hardcoded API key exposure in frontend client
- Added admin role requirement for API key management routes

### Added

- JWT authentication middleware and auth routes
- Unit tests for auth routes and auth service

### Fixed

- Validated scan_type parameter in scan history to prevent enumeration
- Merge nested if in ZIP slip check to satisfy ruff SIM102
- Used bindparams for alembic op.execute and safe sed delimiters
- Hardcoded DATABASE_URL from POSTGRES_USER/PASSWORD/DB to guarantee match

## [1.1.0] - 2026-06-23

### Added

- CI workflow_dispatch trigger
- DB migration steps in CI pipeline
- Password validation step in .env write to catch mismatches early
- Diagnostic info for .env password validation

### Changed

- Updated nginx configs and entrypoint script
- Improved deployment reliability with proper secret handling

### Fixed

- Derive POSTGRES_PASSWORD from DATABASE_URL_SYNC secret directly
- Write POSTGRES_PASSWORD after heredoc to allow shell expansion
- Stop nuking postgres volume on deploy
- Show psycopg2 errors during database connection

## [1.0.0] - 2026-06-22

### Added

- IP scanner: Port scan via nmap, CVE lookup via OSV.dev, severity classification
- Domain scanner: DNS resolution, subdomain enumeration, SSL/TLS analysis, security headers audit
- Mobile scanner: APK/IPA manifest analysis, permission classification, exported component detection
- React frontend with TailwindCSS and shadcn/ui components
- FastAPI backend with SQLAlchemy and Alembic migrations
- Celery workers for async scan processing (ip_scan, domain_scan, mobile_scan queues)
- Docker Compose deployment stack with nginx reverse proxy
- API key authentication
- HTML report export
- WebSocket progress updates
