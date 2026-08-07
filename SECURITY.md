# Security Policy

## Supported Versions

Only the latest release receives security patches. We do not backport fixes to older versions.

| Version | Supported |
|---------|-----------|
| latest (main branch) | Yes |
| < latest | No |

## Reporting a Vulnerability

**Do not open a public issue.** Email details to **[security@vulnscan.dev](mailto:security@vulnscan.dev)**.

Include:
- A clear description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Any proof-of-concept or exploit code (if available)

PGP key available on request.

## Response Timeline

| Phase | Target |
|-------|--------|
| Acknowledge receipt | Within 48 hours |
| Triage and confirm | Within 5 business days |
| Patch released | Within 30 days (depending on severity) |

We will keep you informed of progress and coordinate public disclosure if applicable. Credit is given in release notes and our advisory (unless you prefer anonymity).

## Scope

### In Scope
- The VulnScanner application (backend, frontend, workers)
- Docker Compose deployment configurations
- API endpoints and authentication

### Out of Scope
- Vulnerabilities in third-party dependencies that are not exploitable through VulnScanner
- Issues requiring physical access to the host
- Social engineering attacks
- Denial-of-service attacks (DoS)
- Scanner output / false positives from external services (nmap, OSV.dev, crt.sh)

## Bug Bounty

VulnScanner does not operate a bug bounty program. Vulnerability reports are accepted on a voluntary basis with no financial reward.

## Accepted residual dependency risks

Tracked so `npm audit` / dependency scanners do not force unsafe “fixes.” Revisit when a **compatible patched release** exists.

### React Router — GHSA-qwww-vcr4-c8h2 (high)

| Field | Value |
|-------|--------|
| Packages | `react-router` / `react-router-dom` (frontend SPA, currently 7.18.x line) |
| Advisory | [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) — RSC Mode CSRF bypass (follow-up to CVE-2026-22030) |
| Advisory note | Affects apps using **unstable RSC** APIs only |
| Our usage | `BrowserRouter` in `frontend/src/main.tsx` only — **no** RSC / unstable RSC routes |
| Why not auto-fix | `npm audit fix --force` proposes **downgrade** to `react-router-dom@7.11.0` (regressive). No patched **7.x** release; first patched line is `react-router@8.3.0`, while `react-router-dom@8` was not published when last reviewed |
| Decision | **Accept** residual audit finding until we can bump to a patched `react-router-dom` without a force-downgrade |
| Revisit when | `react-router-dom` ships a release that depends on patched `react-router` (≥8.3 or a future 7.x patch), then open a dedicated bump PR + full frontend CI |

Do **not** run `npm audit fix --force` for this GHSA on the SPA.

### Related frontend pins

Transitive highs cleared on main via overrides (see `frontend/package.json`): `brace-expansion` ≥5.0.5, `undici` ≥7.29.0. Keep optional lock entries (e.g. `@emnapi/*`) intact so `npm ci` stays in sync — see PR history on lockfile hygiene.
