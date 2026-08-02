"""Default action advice templates that fill ScanFinding.remediation when empty."""

from __future__ import annotations

import re

from utils.scan_types import ScanFinding

_RISKY_PORTS: dict[int, str] = {
    21: "FTP is unencrypted. Prefer SFTP/FTPS, or close port 21 and use SSH file transfer.",
    23: "Telnet transmits credentials in cleartext. Disable Telnet; use SSH (port 22) instead.",
    135: "RPC endpoint — restrict to trusted networks or disable if unused.",
    139: "NetBIOS — disable on internet-facing hosts; use SMB over 445 on trusted nets only.",
    445: "SMB — never expose to the internet. Restrict to internal networks and patch regularly.",
    1433: "MSSQL — bind to internal interfaces, require strong auth, and restrict by firewall.",
    1521: "Oracle DB — do not expose publicly; restrict by firewall and use strong credentials.",
    3306: "MySQL/MariaDB — bind to localhost/private net only; require TLS and strong passwords.",
    3389: "RDP — require VPN or jump host, enable NLA, and restrict source IPs.",
    5432: "PostgreSQL — bind to private interfaces only; require TLS and strong auth.",
    5900: "VNC is often unencrypted. Tunnel via SSH/VPN or disable remote VNC.",
    6379: "Redis — bind to localhost, require AUTH, disable dangerous commands, never expose publicly.",
    9200: "Elasticsearch — require auth/TLS and restrict to internal networks.",
    11211: "Memcached — bind to localhost only; never expose to the internet (amplification risk).",
    27017: "MongoDB — enable auth, bind to private interfaces, and restrict by firewall.",
}

CATEGORY_ADVICE: dict[str, str] = {
    "open_port": (
        "Confirm the service is required. Restrict access with a firewall (allowlist source IPs), "
        "keep the service patched, and disable anonymous/default credentials."
    ),
    "os_detection": (
        "Treat OS fingerprint as informational. Keep the host patched and minimize the attack surface "
        "by closing unused ports."
    ),
    "ip_address": ("Informational. Review DNS A/AAAA records and ensure only intended hosts are published."),
    "subdomain": (
        "Inventory discovered subdomains. Decommission unused hosts and ensure each subdomain "
        "has TLS and security headers."
    ),
    "ssl_issue": (
        "Renew or re-issue the certificate before expiry. Prefer automated renewal (e.g. ACME/Let's Encrypt) "
        "and monitor certificate lifetime."
    ),
    "ssl_cipher": (
        "Prefer TLS 1.2+ with modern cipher suites. Disable weak ciphers and enable HSTS after HTTPS is solid."
    ),
    "missing_header": (
        "Add the missing security header on the web server or reverse proxy. "
        "See the finding description for the recommended value."
    ),
    "tech_detected": (
        "Informational fingerprint. Keep the detected stack updated and remove version banners where practical."
    ),
    "android_manifest": (
        "Informational package metadata. Ensure release builds use the correct applicationId and versioning."
    ),
    "android_sdk": ("Raise minSdk/targetSdk to currently supported Android API levels and retest the app."),
    "dangerous_permission": (
        "Justify each dangerous permission in privacy policy and UX. Request at runtime only when needed; "
        "remove unused permissions from the manifest."
    ),
    "android_permission": ("Review declared permissions; remove any that the app does not need."),
    "android_debug": (
        'Set android:debuggable="false" for release builds (default when debuggable is omitted). '
        "Never ship debuggable production APKs."
    ),
    "android_backup": (
        'Set android:allowBackup="false" (or configure a backup rules file) so app data cannot be '
        "extracted via ADB backup."
    ),
    "android_cleartext": (
        'Set android:usesCleartextTraffic="false" and use HTTPS only. '
        "If HTTP is required temporarily, scope it via networkSecurityConfig domain exceptions."
    ),
    "exported_component": (
        'Set android:exported="false" unless the component must be reachable by other apps. '
        "If exported, enforce permissions and validate all incoming intents."
    ),
    "ios_info": ("Informational bundle metadata. Keep MinimumOSVersion current and ship production signing profiles."),
    "ios_ats": (
        "Re-enable App Transport Security. Remove NSAllowsArbitraryLoads and narrow NSExceptionDomains "
        "to the minimum required hosts."
    ),
    "ios_url_scheme": (
        "Prefer universal links over custom URL schemes. If schemes remain, validate all incoming URLs "
        "and avoid carrying secrets in the URL."
    ),
    "hardcoded_secret": (
        "Remove secrets from the binary. Move credentials to a secure backend, use short-lived tokens, "
        "and rotate any keys that may have been exposed. Rescan after rebuild."
    ),
    "vulnerability": (
        "Review the advisory, upgrade the affected package/service to a fixed version, "
        "and redeploy. If no fix exists yet, apply vendor mitigations or isolate the component."
    ),
}


def advice_for_open_port(title: str, description: str = "") -> str:
    match = re.search(r"Open port:\s*(\d+)/", title)
    if match:
        port = int(match.group(1))
        if port in _RISKY_PORTS:
            return _RISKY_PORTS[port]
    return CATEGORY_ADVICE["open_port"]


def advice_for_category(
    category: str,
    *,
    title: str = "",
    description: str = "",
    explicit: str | None = None,
) -> str | None:
    if explicit and explicit.strip():
        return explicit.strip()
    if category == "open_port":
        return advice_for_open_port(title, description)
    return CATEGORY_ADVICE.get(category)


def ensure_remediation(finding: ScanFinding) -> ScanFinding:
    existing = finding.get("remediation")
    if existing and str(existing).strip():
        return finding
    advice = advice_for_category(
        finding.get("category", ""),
        title=finding.get("title", ""),
        description=finding.get("description", ""),
    )
    if advice:
        finding["remediation"] = advice
    return finding


def ensure_remediations(findings: list[ScanFinding]) -> list[ScanFinding]:
    for f in findings:
        ensure_remediation(f)
    return findings
