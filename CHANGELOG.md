# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- nginx hardening: server_tokens off, TLS ciphers, OCSP stapling, CSP headers, buffer protections, proxy_hide_headers

### Changed

- Updated pytest-asyncio from 0.24.0 to 1.4.0
- Updated websockets from 14.1 to 15.0.1

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
