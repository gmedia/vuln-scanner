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
