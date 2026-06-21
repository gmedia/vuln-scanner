import asyncio
import re
import socket
import ssl
from dataclasses import dataclass, field

from loguru import logger


@dataclass
class DnsRecord:
    """DNS record: type (A, AAAA, MX, etc.) and value."""
    record_type: str
    value: str


@dataclass
class SslInfo:
    """SSL/TLS certificate details: subject, issuer, validity, cipher, and issues found."""
    subject: str = ""
    issuer: str = ""
    not_before: str = ""
    not_after: str = ""
    days_remaining: int = 0
    version: str = ""
    cipher: str = ""
    supported_versions: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)


@dataclass
class HeaderCheck:
    """Security header check result: name, presence, value, severity, and recommendation."""
    name: str
    present: bool
    value: str = ""
    severity: str = "info"
    recommendation: str = ""


@dataclass
class TechInfo:
    """Detected technology: name, category, version, and confidence percentage."""
    name: str
    category: str = ""
    version: str = ""
    confidence: int = 0


@dataclass
class DomainResult:
    """Aggregated domain scan results: DNS, HTTP, SSL, headers, tech stack, and subdomains."""
    domain: str
    ip_addresses: list[str] = field(default_factory=list)
    dns_records: list[DnsRecord] = field(default_factory=list)
    subdomains: list[str] = field(default_factory=list)
    http_reachable: bool = False
    https_reachable: bool = False
    status_code: int = 0
    response_headers: dict[str, str] = field(default_factory=dict)
    ssl_info: SslInfo = field(default_factory=SslInfo)
    tech_stack: list[TechInfo] = field(default_factory=list)
    header_checks: list[HeaderCheck] = field(default_factory=list)


async def resolve_dns(domain: str) -> tuple[list[str], list[DnsRecord]]:
    """Resolve a domain to its IP addresses and A records."""
    ips = []
    records = []

    try:
        result = socket.getaddrinfo(domain, None)
        seen = set()
        for _, _, _, _, sockaddr in result:
            addr = sockaddr[0]
            if addr not in seen:
                seen.add(addr)
                ips.append(addr)
                records.append(DnsRecord(record_type="A", value=addr))
    except socket.gaierror:
        logger.debug("DNS resolution failed for {domain}", domain=domain)

    await asyncio.sleep(0)
    return ips, records


async def enumerate_subdomains(domain: str) -> list[str]:
    """Discover subdomains via crt.sh certificate transparency logs."""
    subdomains = []

    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection("crt.sh", 443, ssl=True),
            timeout=10,
        )
        request = (
            f"GET /?q=%.{domain}&output=json HTTP/1.1\r\n"
            "Host: crt.sh\r\nUser-Agent: VulnScanner/1.0\r\nConnection: close\r\n\r\n"
        )
        writer.write(request.encode())
        await writer.drain()

        data = b""
        try:
            while True:
                chunk = await asyncio.wait_for(reader.read(8192), timeout=10)
                if not chunk:
                    break
                data += chunk
        except Exception as e:
            logger.warning("Error reading crt.sh response for {domain}: {error}", domain=domain, error=e)

        writer.close()
        await writer.wait_closed()

        text = data.decode("utf-8", errors="replace")
        body = text.split("\r\n\r\n", 1)[-1] if "\r\n\r\n" in text else ""

        import json
        try:
            entries = json.loads(body)
            seen = set()
            for entry in entries[:100]:
                name = entry.get("name_value", "").strip()
                for sub in name.split("\n"):
                    sub = sub.strip().lstrip("*.").lower()
                    if sub.endswith(domain) and sub != domain and sub not in seen:
                        seen.add(sub)
                        subdomains.append(sub)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse crt.sh JSON for {domain}: {error}", domain=domain, error=e)
    except Exception as e:
        logger.warning("Subdomain enumeration failed for {domain}: {error}", domain=domain, error=e)

    return subdomains


async def check_http(domain: str) -> tuple[bool, bool, int, dict[str, str]]:
    """Check HTTP/HTTPS reachability for a domain and return response headers."""
    http_reachable = False
    https_reachable = False
    status_code = 0
    headers = {}

    for port, use_ssl, flag in [(80, False, "http"), (443, True, "https")]:
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(domain, port, ssl=use_ssl if use_ssl else None),
                timeout=10,
            )
            request = f"HEAD / HTTP/1.1\r\nHost: {domain}\r\nUser-Agent: VulnScanner/1.0\r\nConnection: close\r\n\r\n"
            writer.write(request.encode())
            await writer.drain()

            response = b""
            try:
                while True:
                    chunk = await asyncio.wait_for(reader.read(4096), timeout=5)
                    if not chunk:
                        break
                    response += chunk
            except Exception as e:
                logger.warning("Error reading HTTP response for {domain}:{port}: {error}",
                               domain=domain, port=port, error=e)

            writer.close()
            await writer.wait_closed()

            text = response.decode("utf-8", errors="replace")
            lines = text.split("\r\n")
            if lines:
                match = re.match(r"HTTP/\d\.\d\s+(\d+)", lines[0])
                if match:
                    status_code = int(match.group(1))

            for line in lines[1:]:
                if ":" in line:
                    key, _, value = line.partition(":")
                    headers[key.strip().lower()] = value.strip()
                if line == "" or not line.strip():
                    break

            if flag == "http":
                http_reachable = True
            else:
                https_reachable = True

        except Exception as e:
            logger.debug("HTTP check failed for {domain}:{port}: {error}", domain=domain, port=port, error=e)
            continue

    return http_reachable, https_reachable, status_code, headers


async def check_ssl(domain: str) -> SslInfo:
    """Retrieve and validate the SSL/TLS certificate for a domain."""
    info = SslInfo()

    try:
        ctx = ssl.create_default_context()
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(domain, 443, ssl=ctx),
            timeout=10,
        )

        cert = writer.get_extra_info("ssl_object")
        if cert:
            cert_dict = cert.getpeercert()
            info.subject = dict(x[0] for x in cert_dict.get("subject", [])) if cert_dict else ""
            info.issuer = dict(x[0] for x in cert_dict.get("issuer", [])) if cert_dict else ""

            not_after = cert_dict.get("notAfter", "") if cert_dict else ""
            info.not_after = not_after
            info.version = str(cert.version() if hasattr(cert, "version") else "")

            try:
                import datetime
                not_after_dt = datetime.datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                info.days_remaining = (not_after_dt - datetime.datetime.utcnow()).days
            except Exception as e:
                logger.trace("Failed to parse cert date {date} for {domain}: {error}",
                             date=not_after, domain=domain, error=e)
                info.days_remaining = -1

            cipher_info = cert.cipher() if hasattr(cert, "cipher") else ("", "", 0)
            info.cipher = f"{cipher_info[0]} {cipher_info[2]}" if cipher_info[2] else str(cipher_info[0])

        writer.close()
        await writer.wait_closed()

        if info.days_remaining >= 0 and info.days_remaining <= 30:
            info.issues.append(f"Certificate expires in {info.days_remaining} days")
        info.supported_versions = ["TLSv1.2", "TLSv1.3"]

    except Exception as e:
        logger.warning("SSL check failed for {domain}: {error}", domain=domain, error=e)
        info.issues.append(f"SSL check failed: {str(e)[:100]}")

    return info


SECURITY_HEADERS = {
    "strict-transport-security": {
        "name": "Strict-Transport-Security",
        "severity": "medium",
        "recommendation": "Add HSTS header (max-age=31536000; includeSubDomains)",
    },
    "content-security-policy": {
        "name": "Content-Security-Policy",
        "severity": "medium",
        "recommendation": "Add CSP header to prevent XSS attacks",
    },
    "x-frame-options": {
        "name": "X-Frame-Options",
        "severity": "low",
        "recommendation": "Add X-Frame-Options: DENY to prevent clickjacking",
    },
    "x-content-type-options": {
        "name": "X-Content-Type-Options",
        "severity": "low",
        "recommendation": "Add X-Content-Type-Options: nosniff",
    },
    "referrer-policy": {
        "name": "Referrer-Policy",
        "severity": "low",
        "recommendation": "Add Referrer-Policy header",
    },
    "permissions-policy": {
        "name": "Permissions-Policy",
        "severity": "low",
        "recommendation": "Add Permissions-Policy header to restrict browser features",
    },
    "x-xss-protection": {
        "name": "X-XSS-Protection",
        "severity": "info",
        "recommendation": "Set X-XSS-Protection: 1; mode=block",
    },
}


def check_security_headers(response_headers: dict[str, str]) -> list[HeaderCheck]:
    """Audit HTTP response headers against a baseline of security headers."""
    checks = []
    for header_key, config in SECURITY_HEADERS.items():
        header_value = response_headers.get(header_key, "")
        checks.append(HeaderCheck(
            name=config["name"],
            present=bool(header_value),
            value=header_value,
            severity=config["severity"] if not header_value else "info",
            recommendation="" if header_value else config["recommendation"],
        ))
    return checks


TECH_SIGNATURES: list[tuple[str, str, str, list[str]]] = [
    ("nginx", "reverse-proxy", "server", ["nginx"]),
    ("Apache", "reverse-proxy", "server", ["apache", "httpd"]),
    ("Cloudflare", "cdn", "server", ["cloudflare"]),
    ("PHP", "language", "x-powered-by", ["php"]),
    ("Express", "framework", "x-powered-by", ["express"]),
    ("React", "framework", "", ["react"]),
    ("Next.js", "framework", "", ["next.js", "__next"]),
    ("Vue.js", "framework", "", ["vue"]),
    ("jQuery", "library", "", ["jquery"]),
    ("Bootstrap", "css-framework", "", ["bootstrap"]),
    ("WordPress", "cms", "", ["wordpress", "wp-content"]),
    ("Drupal", "cms", "", ["drupal"]),
    ("Django", "framework", "", ["django", "csrftoken"]),
    ("Ruby on Rails", "framework", "", ["rails"]),
    ("Laravel", "framework", "", ["laravel"]),
    ("FastAPI", "framework", "server", ["uvicorn", "fastapi"]),
    ("PostgreSQL", "database", "", ["postgresql"]),
    ("MySQL", "database", "", ["mysql"]),
    ("Redis", "database", "", ["redis"]),
    ("MongoDB", "database", "", ["mongodb"]),
    ("GraphQL", "api", "", ["graphql"]),
    ("OpenResty", "reverse-proxy", "server", ["openresty"]),
    ("Caddy", "reverse-proxy", "server", ["caddy"]),
]


def detect_tech_stack(domain: str, headers: dict[str, str]) -> list[TechInfo]:
    """Fingerprint the technology stack from HTTP response headers and signatures."""
    detected = []
    seen_names = set()

    for name, category, header_key, triggers in TECH_SIGNATURES:
        if name in seen_names:
            continue

        if header_key:
            header_value = headers.get(header_key, "").lower()
            for trigger in triggers:
                if trigger in header_value:
                    detected.append(TechInfo(name=name, category=category, confidence=80))
                    seen_names.add(name)
                    break

        if not header_key and name not in seen_names:
            pass

    for name, category, header_key, triggers in TECH_SIGNATURES:
        if name in seen_names:
            continue
        if not header_key:
            for trigger in triggers:
                if trigger in str(headers).lower():
                    detected.append(TechInfo(name=name, category=category, confidence=50))
                    seen_names.add(name)
                    break

    return detected


def findings_from_domain(result: DomainResult) -> list[dict]:
    """Convert a DomainResult into a list of finding dicts for database persistence."""
    findings = []

    for ip in result.ip_addresses:
        findings.append({
            "severity": "info",
            "category": "ip_address",
            "title": f"IP Address: {ip}",
            "description": f"Resolved IP for {result.domain}",
        })

    for sub in result.subdomains[:20]:
        findings.append({
            "severity": "info",
            "category": "subdomain",
            "title": f"Subdomain: {sub}",
            "description": "Found via certificate transparency logs",
        })

    if result.ssl_info.issues:
        for issue in result.ssl_info.issues:
            findings.append({
                "severity": "medium",
                "category": "ssl_issue",
                "title": f"SSL Issue: {issue}",
                "description": f"Subject: {result.ssl_info.subject}, Issuer: {result.ssl_info.issuer}",
            })

    if result.ssl_info.cipher:
        findings.append({
            "severity": "info",
            "category": "ssl_cipher",
            "title": f"SSL Cipher: {result.ssl_info.cipher}",
            "description": (
                f"Certificate expires on {result.ssl_info.not_after} "
                f"({result.ssl_info.days_remaining} days)"
            ),
        })

    for check in result.header_checks:
        if not check.present:
            findings.append({
                "severity": check.severity,
                "category": "missing_header",
                "title": f"Missing header: {check.name}",
                "description": check.recommendation,
            })

    for tech in result.tech_stack:
        findings.append({
            "severity": "info",
            "category": "tech_detected",
            "title": f"{tech.name} ({tech.category})",
            "description": f"Confidence: {tech.confidence}%",
            "product": tech.name,
            "version": tech.version,
        })

    return findings
