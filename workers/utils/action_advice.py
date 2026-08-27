"""Default action advice, impact, and attacker-benefit templates for ScanFinding enrichment.

Fills ``remediation`` (saran aksi), ``impact`` (risk if unfixed), and
``attacker_benefit`` (what an attacker gains from knowing this) when empty.
"""

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

_RISKY_PORT_IMPACT: dict[int, str] = {
    21: (
        "If left unfixed, attackers on the network path can intercept credentials and file "
        "transfers in cleartext, potentially gaining account access and sensitive data."
    ),
    23: (
        "If left unfixed, attackers can capture login credentials in cleartext and take over "
        "interactive sessions on the host."
    ),
    135: (
        "If left unfixed, exposed RPC can enable remote service enumeration and, on unpatched "
        "hosts, remote code execution or lateral movement."
    ),
    139: (
        "If left unfixed, NetBIOS exposure can leak host and share information and aid "
        "SMB-based lateral movement inside the network."
    ),
    445: (
        "If left unfixed, internet-facing SMB can enable remote code execution via known "
        "exploits, ransomware propagation, and credential theft."
    ),
    1433: (
        "If left unfixed, attackers can attempt brute-force or exploit database flaws to read, "
        "modify, or delete application data and pivot further into the network."
    ),
    1521: (
        "If left unfixed, exposed Oracle listeners can allow credential attacks and data "
        "exfiltration from critical enterprise databases."
    ),
    3306: (
        "If left unfixed, attackers can attempt authentication attacks or abuse weak "
        "configuration to access, alter, or drop application databases."
    ),
    3389: (
        "If left unfixed, exposed RDP can enable brute-force logins, session takeover, and "
        "full interactive control of the Windows host."
    ),
    5432: (
        "If left unfixed, attackers can target weak credentials or misconfiguration to access "
        "or corrupt PostgreSQL data stores."
    ),
    5900: (
        "If left unfixed, unencrypted VNC can allow session hijacking and remote desktop "
        "control by anyone who reaches the port."
    ),
    6379: (
        "If left unfixed, unauthenticated Redis can allow remote command execution, data "
        "theft, or use of the instance as a foothold for further attacks."
    ),
    9200: (
        "If left unfixed, open Elasticsearch can expose indexed documents, enable data "
        "destruction, or leak credentials and PII stored in indices."
    ),
    11211: (
        "If left unfixed, exposed Memcached can be abused for DDoS amplification and may "
        "leak or allow manipulation of cached application data."
    ),
    27017: (
        "If left unfixed, open MongoDB can allow unauthenticated reads/writes, mass data "
        "exfiltration, or ransomware-style collection wipes."
    ),
}

_RISKY_PORT_ATTACKER_BENEFIT: dict[int, str] = {
    21: (
        "Knowing FTP is open tells an attacker they can try default or leaked credentials "
        "and sniff file transfers on the path — no custom exploit required."
    ),
    23: (
        "Telnet on the wire means login traffic is readable. An attacker who can sit on "
        "the path learns credentials without breaking encryption."
    ),
    135: ("Exposed RPC lets an attacker enumerate services and match the host to known Windows remote-execution bugs."),
    139: (
        "NetBIOS exposure confirms file-sharing heritage and helps an attacker plan "
        "SMB-based movement once they are on the LAN."
    ),
    445: (
        "Internet-facing SMB is a high-value target: public advisories exist for remote "
        "code execution and ransomware worms that scan this port."
    ),
    1433: (
        "A reachable MSSQL port tells an attacker where to aim credential stuffing and "
        "database-specific flaws against application data."
    ),
    1521: (
        "An open Oracle listener is a map to a high-value data store; attackers look up "
        "listener and TNS issues rather than guessing where data lives."
    ),
    3306: (
        "MySQL/MariaDB on the network is a direct path to application data if auth is "
        "weak — attackers do not need a web bug first."
    ),
    3389: (
        "RDP on the internet is a known brute-force and session-takeover surface; "
        "attackers script password sprays against this port at scale."
    ),
    5432: (
        "PostgreSQL reachable from untrusted networks is a credential and data target "
        "without needing application-layer access."
    ),
    5900: (
        "VNC often lacks strong encryption. Knowing the port is open lets an attacker "
        "try default passwords or hijack an existing desktop session."
    ),
    6379: (
        "Unauthenticated Redis is a common foothold: attackers use it for remote "
        "commands or as a cache dump — AUTH is frequently missing."
    ),
    9200: (
        "Open Elasticsearch often holds indexed documents and credentials. Attackers "
        "query it directly once they know the port is reachable."
    ),
    11211: (
        "Memcached on the internet is useful for DDoS amplification and for reading "
        "cached application objects if they are not isolated."
    ),
    27017: (
        "MongoDB without auth is a well-known smash-and-grab: attackers dump or wipe "
        "collections as soon as they confirm the port."
    ),
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

CATEGORY_IMPACT: dict[str, str] = {
    "open_port": (
        "If left unfixed, an exposed service expands the remote attack surface and can be probed "
        "for weak credentials, unpatched flaws, or misconfiguration leading to unauthorized access."
    ),
    "os_detection": (
        "OS fingerprint alone is low risk, but it helps attackers choose OS-specific exploits "
        "and prioritise unpatched hosts."
    ),
    "ip_address": (
        "Informational DNS mapping. Unexpected published addresses can reveal internal hosts "
        "or staging systems that attackers may target next."
    ),
    "subdomain": (
        "Forgotten or unmanaged subdomains can host outdated software, default pages, or "
        "takeover-prone DNS records that attackers use as an entry point."
    ),
    "ssl_issue": (
        "If left unfixed, users may receive certificate warnings or fall back to insecure channels; "
        "attackers can more easily run phishing or man-in-the-middle attacks against the site."
    ),
    "ssl_cipher": (
        "If left unfixed, weak TLS configuration can allow protocol downgrade or cryptographic "
        "attacks that expose session data and credentials in transit."
    ),
    "missing_header": (
        "If left unfixed, browsers lack defenses against clickjacking, XSS, mixed content, or "
        "unwanted framing — increasing the chance of successful client-side attacks."
    ),
    "tech_detected": (
        "Stack fingerprints help attackers map known CVEs to your software versions and "
        "prioritise exploits against outdated components."
    ),
    "android_manifest": (
        "Informational package identity. Misconfigured release metadata rarely grants direct "
        "access but can complicate incident response and update tracking."
    ),
    "android_sdk": (
        "If left unfixed, outdated SDK levels miss platform security fixes and may allow "
        "attacks that modern Android versions already block."
    ),
    "dangerous_permission": (
        "If left unfixed, excess dangerous permissions enlarge the blast radius if the app is "
        "compromised — attackers can abuse camera, location, SMS, or storage access."
    ),
    "android_permission": (
        "Unnecessary permissions increase privacy exposure and give malware more capability "
        "if the app process is abused."
    ),
    "android_debug": (
        "If left unfixed, a debuggable release build can allow runtime inspection, code injection, "
        "and extraction of app secrets on a physical or emulated device."
    ),
    "android_backup": (
        "If left unfixed, ADB backup can extract app data — including tokens and local databases — "
        "from a device an attacker briefly controls."
    ),
    "android_cleartext": (
        "If left unfixed, HTTP traffic can be intercepted on hostile networks, exposing "
        "credentials, session tokens, or personal data in transit."
    ),
    "exported_component": (
        "If left unfixed, other apps can invoke the exported component with crafted intents, "
        "potentially triggering privileged actions or data leakage without user consent."
    ),
    "ios_info": (
        "Informational bundle metadata. Outdated minimum OS versions may leave users on "
        "platforms without current security patches."
    ),
    "ios_ats": (
        "If left unfixed, disabled ATS allows cleartext or weakly protected connections that "
        "attackers on the network path can intercept or tamper with."
    ),
    "ios_url_scheme": (
        "If left unfixed, custom URL schemes can be hijacked by another app to intercept deep "
        "links, steal tokens passed in URLs, or trigger unintended app actions."
    ),
    "hardcoded_secret": (
        "If left unfixed, anyone who extracts the binary can reuse API keys, tokens, or "
        "credentials to impersonate the app, access backends, or incur fraudulent usage."
    ),
    "vulnerability": (
        "If left unfixed, known vulnerabilities can be exploited using public proof-of-concepts "
        "to gain unauthorized access, execute code, or exfiltrate data depending on the CVE."
    ),
}

CATEGORY_ATTACKER_BENEFIT: dict[str, str] = {
    "open_port": (
        "An open port is a confirmed service to probe. Attackers use it to pick "
        "credential attacks, version-specific bugs, or misconfiguration without guessing "
        "what is listening."
    ),
    "os_detection": (
        "OS fingerprint lets attackers filter exploit kits to that family and skip "
        "payloads that would fail on a different kernel."
    ),
    "ip_address": (
        "A published address is a concrete target. Attackers add it to scan lists and "
        "look for staging or internal hosts that should not be public."
    ),
    "subdomain": (
        "Each subdomain is another hostname to hijack, phish from, or find forgotten "
        "apps on. Attackers treat unused names as cheap entry points."
    ),
    "ssl_issue": (
        "Certificate problems signal users may click through warnings. Attackers can "
        "more credibly run lookalike sites or intercept traffic on hostile networks."
    ),
    "ssl_cipher": (
        "Weak TLS tells an attacker they can try protocol downgrade or older crypto "
        "breaks against sessions instead of attacking the application."
    ),
    "missing_header": (
        "Missing browser defenses (framing, XSS filters, mixed content) make "
        "client-side attacks cheaper: attackers reuse public XSS or clickjacking recipes."
    ),
    "tech_detected": (
        "A stack fingerprint maps the site to known CVEs. Attackers search version "
        "strings against public advisories instead of fuzzing blindly."
    ),
    "android_manifest": (
        "Package identity helps attackers find the same app in stores or prior APKs "
        "and track whether a malicious update would look legitimate."
    ),
    "android_sdk": (
        "An old SDK level tells attackers which platform bugs are still in play on devices that can install the app."
    ),
    "dangerous_permission": (
        "Declared dangerous permissions are a shopping list: if the app is abused, "
        "attackers know they may get camera, location, SMS, or storage without extra work."
    ),
    "android_permission": (
        "Extra permissions increase what stolen app context can do. Attackers prefer "
        "apps that already asked for more than they need."
    ),
    "android_debug": (
        "A debuggable release build lets an attacker attach a debugger, inspect memory, "
        "and pull secrets from a device they briefly control."
    ),
    "android_backup": (
        "Backup enabled means ADB backup can dump local data. An attacker with brief "
        "device access can extract tokens without reversing the APK."
    ),
    "android_cleartext": (
        "Cleartext allowed means HTTP is in scope. Attackers on the same network can "
        "read or alter API calls without breaking TLS."
    ),
    "exported_component": (
        "An exported component is an IPC API other apps can call. Attackers write a "
        "tiny companion app to trigger privileged flows or leak data."
    ),
    "ios_info": (
        "Bundle and minimum-OS metadata help attackers know which devices still run "
        "the app and which platform bugs still apply."
    ),
    "ios_ats": (
        "Disabled ATS means the app may talk HTTP. Attackers on the path can intercept "
        "or tamper with those connections."
    ),
    "ios_url_scheme": (
        "Custom URL schemes can be claimed by another app. Attackers intercept deep links or tokens passed in URLs."
    ),
    "hardcoded_secret": (
        "A secret in the binary can be extracted once and reused against backends, "
        "billing APIs, or third-party services as the app."
    ),
    "vulnerability": (
        "A named CVE or advisory gives attackers a public write-up to follow. They "
        "do not need to invent a new bug — they apply the known issue to this host."
    ),
}


def _open_port_number(title: str) -> int | None:
    match = re.search(r"Open port:\s*(\d+)/", title)
    if match:
        return int(match.group(1))
    return None


def advice_for_open_port(title: str, description: str = "") -> str:
    port = _open_port_number(title)
    if port is not None and port in _RISKY_PORTS:
        return _RISKY_PORTS[port]
    return CATEGORY_ADVICE["open_port"]


def impact_for_open_port(title: str, description: str = "") -> str:
    port = _open_port_number(title)
    if port is not None and port in _RISKY_PORT_IMPACT:
        return _RISKY_PORT_IMPACT[port]
    return CATEGORY_IMPACT["open_port"]


def attacker_benefit_for_open_port(title: str, description: str = "") -> str:
    port = _open_port_number(title)
    if port is not None and port in _RISKY_PORT_ATTACKER_BENEFIT:
        return _RISKY_PORT_ATTACKER_BENEFIT[port]
    return CATEGORY_ATTACKER_BENEFIT["open_port"]


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


def impact_for_category(
    category: str,
    *,
    title: str = "",
    description: str = "",
    explicit: str | None = None,
) -> str | None:
    if explicit and explicit.strip():
        return explicit.strip()
    if category == "open_port":
        return impact_for_open_port(title, description)
    return CATEGORY_IMPACT.get(category)


def attacker_benefit_for_category(
    category: str,
    *,
    title: str = "",
    description: str = "",
    explicit: str | None = None,
) -> str | None:
    if explicit and explicit.strip():
        return explicit.strip()
    if category == "open_port":
        return attacker_benefit_for_open_port(title, description)
    return CATEGORY_ATTACKER_BENEFIT.get(category)


def ensure_remediation(finding: ScanFinding) -> ScanFinding:
    existing = finding.get("remediation")
    if not (existing and str(existing).strip()):
        advice = advice_for_category(
            finding.get("category", ""),
            title=finding.get("title", ""),
            description=finding.get("description", ""),
        )
        if advice:
            finding["remediation"] = advice
    return ensure_impact(finding)


def ensure_impact(finding: ScanFinding) -> ScanFinding:
    existing = finding.get("impact")
    if not (existing and str(existing).strip()):
        impact = impact_for_category(
            finding.get("category", ""),
            title=finding.get("title", ""),
            description=finding.get("description", ""),
        )
        if impact:
            finding["impact"] = impact
    return ensure_attacker_benefit(finding)


def ensure_attacker_benefit(finding: ScanFinding) -> ScanFinding:
    existing = finding.get("attacker_benefit")
    if existing and str(existing).strip():
        return finding
    benefit = attacker_benefit_for_category(
        finding.get("category", ""),
        title=finding.get("title", ""),
        description=finding.get("description", ""),
    )
    if benefit:
        finding["attacker_benefit"] = benefit
    return finding


def ensure_remediations(findings: list[ScanFinding]) -> list[ScanFinding]:
    for f in findings:
        ensure_remediation(f)
    return findings


def ensure_impacts(findings: list[ScanFinding]) -> list[ScanFinding]:
    for f in findings:
        ensure_impact(f)
    return findings


def ensure_attacker_benefits(findings: list[ScanFinding]) -> list[ScanFinding]:
    for f in findings:
        ensure_attacker_benefit(f)
    return findings
