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

**Current state: no accepted residuals.** `npm audit` (full, including dev) reports **0 vulnerabilities** in `frontend/`.

### React Router — GHSA-qwww-vcr4-c8h2 (high) — **RESOLVED**

| Field | Value |
|-------|--------|
| Packages | `react-router` / `react-router-dom` (frontend SPA) |
| Advisory | [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) — RSC Mode CSRF bypass (follow-up to CVE-2026-22030) |
| Advisory note | Affects apps using **unstable RSC** APIs only |
| Our usage | `BrowserRouter` in `frontend/src/main.tsx` only — **no** RSC / unstable RSC routes |
| Vulnerable ranges | `>= 7.12.0, < 7.18.2` and `>= 8.0.0, < 8.3.0` |
| Installed | `react-router-dom@7.18.4` → **outside both ranges** |
| Status | **Closed by the 7.18.4 bump.** `npm audit` no longer reports it |

**Correction (2026-10-19):** this section previously claimed *“No patched 7.x release; first patched line is `react-router@8.3.0`.”* That was **wrong** — the advisory lists `7.18.2` as a patched 7.x release, so the residual was already closed. Check the advisory's `vulnerableVersionRange` / `firstPatchedVersion` before recording a risk as accepted.

Do **not** run `npm audit fix --force` for a React Router advisory on the SPA — it proposes a regressive downgrade.

### Frontend security overrides

Transitive highs are cleared via `overrides` in `frontend/package.json`. **The floor matters:** an override set one patch below the first patched version silently keeps the vulnerability while looking like a fix.

| Package | Override | Why that floor |
|---|---|---|
| `brace-expansion` | `^5.0.12` | Advisory covers `4.0.0 – 5.0.11`; the old `^5.0.5` resolved to 5.0.9 (vulnerable) |
| `undici` | `^8.12.1` | Advisory covers `7.0.0 – 7.29.0`; the old `^7.29.0` pinned **exactly** the last vulnerable version and forced it below `jsdom@30`'s own `^8.12.1` |
| `browserslist` | `^4.29.4` | Advisory covers `<= 4.28.6` |
| `baseline-browser-mapping` | `^2.11.29` | Advisory covers `>= 2.0.0 < 2.11.0` |

Keep optional lock entries (e.g. `@emnapi/*`) intact so `npm ci` stays in sync — see PR history on lockfile hygiene.

**Verifying an override actually helps:** compare the installed version against the advisory range (`npm ls <pkg>` / `node_modules/<pkg>/package.json`), not just that an override exists. `npm audit` is the source of truth.

### Enforcement

CI job **`deps-audit`** (in `ci-ok`) runs `node scripts/check-dependency-audit.mjs`, which fails on any **HIGH/CRITICAL** advisory not listed in [`.github/dependency-audit-allowlist.json`](../.github/dependency-audit-allowlist.json). That is what stops a stale override from silently surviving again.

To accept a risk, add an entry with `id` (GHSA), `package`, `reason`, and `expires` (ISO date). Expired entries fail the gate; entries that no longer match an advisory are reported as stale so they get removed.

Python is covered too: CI job **`deps-audit-python`** runs `python scripts/check-pip-audit.py`, which audits `backend/requirements.txt` and `workers/requirements.txt` with `pip-audit` and applies the same allowlist (`ecosystem: "pip"`). `pip-audit` reports no severity, so **any** known vulnerability blocks.

### Container images

The `docker-scan-*` jobs run Trivy twice per image: once as SARIF (HIGH+CRITICAL, into the Security tab) and once as a **blocking CRITICAL check** (`exit-code: 1`). HIGH stays advisory so a routine base-image advisory cannot turn an unrelated PR red. Both use `ignore-unfixed: true`, so only fixable issues can fail a build. Measured after the 2026-10-19 base refresh: all three images are **0 critical / 0 high**. See [`docs/dependency-pins.md`](docs/dependency-pins.md#container-image-scanning-trivy).
