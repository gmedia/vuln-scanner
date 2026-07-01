"""Tests for domain_utils.py: security headers, tech detection, findings."""

import asyncio
import datetime
import socket
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from utils.domain_utils import (
    DnsRecord,
    DomainResult,
    HeaderCheck,
    SslInfo,
    TechInfo,
    check_http,
    check_security_headers,
    check_ssl,
    detect_tech_stack,
    enumerate_subdomains,
    findings_from_domain,
    resolve_dns,
)


class TestCheckSecurityHeaders:
    def test_all_headers_present(self):
        headers = {
            "strict-transport-security": "max-age=31536000",
            "content-security-policy": "default-src 'self'",
            "x-frame-options": "DENY",
            "x-content-type-options": "nosniff",
            "referrer-policy": "strict-origin",
            "permissions-policy": "geolocation=()",
            "x-xss-protection": "1; mode=block",
        }
        checks = check_security_headers(headers)
        assert len(checks) == 7
        for check in checks:
            assert check.present is True
            assert check.severity == "info"
            assert check.recommendation == ""

    def test_all_headers_missing(self):
        checks = check_security_headers({})
        assert len(checks) == 7
        for check in checks:
            assert check.present is False
        non_info = [c for c in checks if c.severity != "info"]
        assert len(non_info) == 6  # X-XSS-Protection has severity "info" even when missing

    def test_partial_headers(self):
        headers = {
            "strict-transport-security": "max-age=31536000",
            "x-frame-options": "DENY",
        }
        checks = check_security_headers(headers)
        present = [c for c in checks if c.present]
        missing = [c for c in checks if not c.present]
        assert len(present) == 2
        assert len(missing) == 5
        hsts = next(c for c in checks if c.name == "Strict-Transport-Security")
        assert hsts.present is True
        assert hsts.severity == "info"
        csp = next(c for c in checks if c.name == "Content-Security-Policy")
        assert csp.present is False
        assert csp.severity == "medium"
        assert "Add CSP header" in csp.recommendation

    def test_header_values_preserved(self):
        headers = {"strict-transport-security": "max-age=31536000; includeSubDomains"}
        checks = check_security_headers(headers)
        hsts = checks[0]
        assert hsts.value == "max-age=31536000; includeSubDomains"

    def test_case_insensitive_lookup(self):
        headers = {"strict-transport-security": "max-age=31536000"}
        checks = check_security_headers(headers)
        hsts = next(c for c in checks if c.name == "Strict-Transport-Security")
        assert hsts.present is True


class TestDetectTechStack:
    def test_server_header_match(self):
        headers = {"server": "nginx/1.24.0"}
        techs = detect_tech_stack("example.com", headers)
        assert len(techs) >= 1
        nginx = next(t for t in techs if t.name == "nginx")
        assert nginx.category == "reverse-proxy"
        assert nginx.confidence == 80

    def test_x_powered_by_match(self):
        headers = {"x-powered-by": "Express"}
        techs = detect_tech_stack("example.com", headers)
        express = next(t for t in techs if t.name == "Express")
        assert express is not None
        assert express.category == "framework"

    def test_no_match_returns_empty(self):
        headers = {"server": "CustomServer/1.0"}
        techs = detect_tech_stack("example.com", headers)
        assert len(techs) == 0

    def test_multiple_techs_detected(self):
        headers = {
            "server": "nginx",
            "x-powered-by": "PHP/7.4",
        }
        techs = detect_tech_stack("example.com", headers)
        names = [t.name for t in techs]
        assert "nginx" in names
        assert "PHP" in names

    def test_no_duplicate_detections(self):
        headers = {"server": "nginx nginx"}
        techs = detect_tech_stack("example.com", headers)
        nginx_count = sum(1 for t in techs if t.name == "nginx")
        assert nginx_count == 1

    def test_header_key_missing_fallback_to_body_search(self):
        with patch(
            "utils.domain_utils.TECH_SIGNATURES",
            new=[
                ("React", "framework", "", ["react"]),
                ("Bootstrap", "css-framework", "", ["bootstrap"]),
            ],
        ):
            headers = {"content-type": "text/html; react"}
            techs = detect_tech_stack("example.com", headers)
            react = next((t for t in techs if t.name == "React"), None)
            assert react is not None
            assert react.confidence == 50

    def test_duplicate_tech_name_in_signatures_skipped(self):
        """Two signatures with same name → second is skipped via 'continue'."""
        with patch(
            "utils.domain_utils.TECH_SIGNATURES",
            new=[
                ("nginx", "reverse-proxy", "server", ["nginx"]),
                ("nginx", "other-category", "x-powered-by", ["nginx"]),
                ("PHP", "language", "x-powered-by", ["php"]),
            ],
        ):
            headers = {"server": "nginx", "x-powered-by": "php"}
            techs = detect_tech_stack("example.com", headers)
        nginx_count = sum(1 for t in techs if t.name == "nginx")
        assert nginx_count == 1
        assert any(t.name == "PHP" for t in techs)


class TestFindingsFromDomain:
    def test_empty_result_produces_empty_findings(self):
        result = DomainResult(domain="example.com")
        findings = findings_from_domain(result)
        assert findings == []

    def test_ip_addresses_included(self):
        result = DomainResult(
            domain="example.com",
            ip_addresses=["93.184.216.34"],
        )
        findings = findings_from_domain(result)
        ips = [f for f in findings if f["category"] == "ip_address"]
        assert len(ips) == 1
        assert "93.184.216.34" in ips[0]["title"]
        assert ips[0]["severity"] == "info"

    def test_subdomains_included(self):
        result = DomainResult(
            domain="example.com",
            subdomains=["www.example.com", "api.example.com"],
        )
        findings = findings_from_domain(result)
        subs = [f for f in findings if f["category"] == "subdomain"]
        assert len(subs) == 2
        assert subs[0]["severity"] == "info"

    def test_subdomains_capped_at_20(self):
        result = DomainResult(
            domain="example.com",
            subdomains=[f"sub{i}.example.com" for i in range(50)],
        )
        findings = findings_from_domain(result)
        subs = [f for f in findings if f["category"] == "subdomain"]
        assert len(subs) == 20

    def test_ssl_issues_included(self):
        ssl_info = SslInfo(
            subject="CN=example.com",
            issuer="CN=CA",
            issues=["Certificate expires in 10 days"],
        )
        result = DomainResult(domain="example.com", ssl_info=ssl_info)
        findings = findings_from_domain(result)
        issues = [f for f in findings if f["category"] == "ssl_issue"]
        assert len(issues) == 1
        assert "10 days" in issues[0]["title"]
        assert issues[0]["severity"] == "medium"

    def test_ssl_cipher_included(self):
        ssl_info = SslInfo(
            cipher="TLS_AES_256_GCM_SHA3 256",
            not_after="Jun 19 2026",
            days_remaining=365,
        )
        result = DomainResult(domain="example.com", ssl_info=ssl_info)
        findings = findings_from_domain(result)
        ciphers = [f for f in findings if f["category"] == "ssl_cipher"]
        assert len(ciphers) == 1
        assert "TLS_AES_256" in ciphers[0]["title"]
        assert ciphers[0]["severity"] == "info"

    def test_missing_headers_included(self):
        header_check = HeaderCheck(
            name="Strict-Transport-Security",
            present=False,
            severity="medium",
            recommendation="Add HSTS header",
        )
        result = DomainResult(
            domain="example.com",
            header_checks=[header_check],
        )
        findings = findings_from_domain(result)
        missing = [f for f in findings if f["category"] == "missing_header"]
        assert len(missing) == 1
        assert "Strict-Transport-Security" in missing[0]["title"]
        assert missing[0]["severity"] == "medium"

    def test_tech_stack_included(self):
        tech = TechInfo(name="nginx", category="reverse-proxy", confidence=80)
        result = DomainResult(
            domain="example.com",
            tech_stack=[tech],
        )
        findings = findings_from_domain(result)
        techs = [f for f in findings if f["category"] == "tech_detected"]
        assert len(techs) == 1
        assert "nginx" in techs[0]["title"]
        assert techs[0]["severity"] == "info"

    def test_complex_domain_result(self):
        ssl_info = SslInfo(
            cipher="TLS_AES_256_GCM_SHA3 256",
            not_after="Jun 19 2026",
            days_remaining=100,
            subject="CN=example.com",
            issuer="CN=CA",
            issues=["SSL check failed: timeout"],
        )
        header_check = HeaderCheck(
            name="Content-Security-Policy",
            present=False,
            severity="medium",
            recommendation="Add CSP header",
        )
        tech = TechInfo(name="Cloudflare", category="cdn", confidence=80)
        result = DomainResult(
            domain="test.com",
            ip_addresses=["1.2.3.4"],
            subdomains=["www.test.com"],
            ssl_info=ssl_info,
            header_checks=[header_check],
            tech_stack=[tech],
        )
        findings = findings_from_domain(result)
        assert len(findings) == 6
        categories = {f["category"] for f in findings}
        assert categories == {"ip_address", "subdomain", "ssl_issue", "ssl_cipher", "missing_header", "tech_detected"}


# ---------------------------------------------------------------------------
# resolve_dns
# ---------------------------------------------------------------------------


class TestResolveDns:
    @pytest.mark.asyncio
    async def test_resolves_ips_from_getaddrinfo(self):
        """socket.getaddrinfo returns A records → returned as IPs and DnsRecord list."""
        fake_addrinfo = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.35", 0)),
        ]
        with patch("utils.domain_utils.socket.getaddrinfo", return_value=fake_addrinfo):
            ips, records = await resolve_dns("example.com")
        assert ips == ["93.184.216.34", "93.184.216.35"]
        assert len(records) == 2
        assert all(isinstance(r, DnsRecord) for r in records)
        assert records[0].record_type == "A"
        assert records[0].value == "93.184.216.34"

    @pytest.mark.asyncio
    async def test_deduplicates_ips(self):
        """Duplicate addresses in getaddrinfo are collapsed to one."""
        fake_addrinfo = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.2.3.4", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.2.3.4", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("5.6.7.8", 0)),
        ]
        with patch("utils.domain_utils.socket.getaddrinfo", return_value=fake_addrinfo):
            ips, records = await resolve_dns("example.com")
        assert ips == ["1.2.3.4", "5.6.7.8"]
        assert len(records) == 2

    @pytest.mark.asyncio
    async def test_gaierror_returns_empty_lists(self):
        """socket.gaierror is caught → empty ips and records."""
        with patch("utils.domain_utils.socket.getaddrinfo", side_effect=socket.gaierror):
            ips, records = await resolve_dns("no-such-domain.invalid")
        assert ips == []
        assert records == []

    @pytest.mark.asyncio
    async def test_empty_addrinfo_returns_empty(self):
        """getaddrinfo returns empty list → no IPs."""
        with patch("utils.domain_utils.socket.getaddrinfo", return_value=[]):
            ips, records = await resolve_dns("example.com")
        assert ips == []
        assert records == []


# ---------------------------------------------------------------------------
# enumerate_subdomains
# ---------------------------------------------------------------------------


def _crt_sh_reader_writer(response_body: str):
    """Return (reader, writer) mocks simulating crt.sh HTTPS response."""
    full_response = f"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{response_body}"
    reader = AsyncMock()
    reader.read.side_effect = [
        full_response.encode(),
        b"",  # EOF
    ]
    writer = MagicMock()
    writer.drain = AsyncMock()
    writer.wait_closed = AsyncMock()
    return reader, writer


class TestEnumerateSubdomains:
    @pytest.mark.asyncio
    async def test_parses_crtsh_json(self):
        """Valid crt.sh JSON → subdomains extracted."""
        crtsh_json = '[{"name_value":"www.example.com\\napi.example.com"},{"name_value":"*.cdn.example.com"}]'
        reader, writer = _crt_sh_reader_writer(crtsh_json)

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            subs = await enumerate_subdomains("example.com")

        assert "www.example.com" in subs
        assert "api.example.com" in subs
        assert "cdn.example.com" in subs  # wildcard stripped
        assert "example.com" not in subs  # root domain excluded

    @pytest.mark.asyncio
    async def test_deduplicates_subdomains(self):
        """Duplicate name_value entries → only unique subdomains returned."""
        crtsh_json = '[{"name_value":"www.example.com"},{"name_value":"www.example.com"}]'
        reader, writer = _crt_sh_reader_writer(crtsh_json)

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            subs = await enumerate_subdomains("example.com")

        assert subs == ["www.example.com"]

    @pytest.mark.asyncio
    async def test_connection_timeout_returns_empty(self):
        """asyncio.open_connection times out → empty list."""
        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.side_effect = asyncio.TimeoutError
            subs = await enumerate_subdomains("example.com")
        assert subs == []

    @pytest.mark.asyncio
    async def test_invalid_json_returns_empty(self):
        """Response body is not valid JSON → empty list (warning logged)."""
        reader, writer = _crt_sh_reader_writer("not json at all!!!")
        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            subs = await enumerate_subdomains("example.com")
        assert subs == []

    @pytest.mark.asyncio
    async def test_no_http_header_split_returns_empty(self):
        """Response without \\r\\n\\r\\n header separator → body is empty string, no subdomains."""
        reader = AsyncMock()
        reader.read.side_effect = [b"rawdata_without_headers", b""]
        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            subs = await enumerate_subdomains("example.com")
        assert subs == []

    @pytest.mark.asyncio
    async def test_connection_refused_returns_empty(self):
        """General connection exception → caught, returns empty list."""
        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.side_effect = ConnectionRefusedError
            subs = await enumerate_subdomains("example.com")
        assert subs == []

    @pytest.mark.asyncio
    async def test_reader_exception_during_read_returns_empty(self):
        """reader.read raises Exception mid-read → caught, returns empty list."""
        reader = AsyncMock()
        reader.read.side_effect = Exception("connection reset")
        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            subs = await enumerate_subdomains("example.com")
        assert subs == []


# ---------------------------------------------------------------------------
# check_http
# ---------------------------------------------------------------------------


def _http_response(status_line, headers=None, body=""):
    """Build a full HTTP response string from status line and headers dict."""
    lines = [status_line]
    for k, v in (headers or {}).items():
        lines.append(f"{k}: {v}")
    lines.append("")
    lines.append(body)
    return "\r\n".join(lines)


class TestCheckHttp:
    @pytest.mark.asyncio
    async def test_both_http_and_https_reachable(self):
        """Port 80 and 443 both succeed → http_reachable=True, https_reachable=True."""
        http_resp = _http_response("HTTP/1.1 200 OK", {"server": "nginx", "content-type": "text/html"})
        https_resp = _http_response("HTTP/1.1 301 Moved Permanently", {"location": "https://example.com"})

        reader_http = AsyncMock()
        reader_http.read.side_effect = [http_resp.encode(), b""]
        reader_https = AsyncMock()
        reader_https.read.side_effect = [https_resp.encode(), b""]

        def _make_writer():
            w = MagicMock()
            w.drain = AsyncMock()
            w.wait_closed = AsyncMock()
            return w

        async def fake_open_conn(host, port, ssl=None):
            if port == 80:
                return reader_http, _make_writer()
            else:
                return reader_https, _make_writer()

        with patch("utils.domain_utils.asyncio.open_connection", side_effect=fake_open_conn):
            http_reachable, https_reachable, status_code, headers = await check_http("example.com")

        assert http_reachable is True
        assert https_reachable is True
        assert status_code == 301
        assert headers["location"] == "https://example.com"

    @pytest.mark.asyncio
    async def test_only_http_reachable(self):
        """Port 80 succeeds, 443 fails → http=True, https=False."""
        http_resp = _http_response("HTTP/1.1 200 OK", {"server": "nginx"})

        reader_http = AsyncMock()
        reader_http.read.side_effect = [http_resp.encode(), b""]

        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()

        async def fake_open_conn(host, port, ssl=None):
            if port == 80:
                return reader_http, writer
            raise ConnectionRefusedError

        with patch("utils.domain_utils.asyncio.open_connection", side_effect=fake_open_conn):
            http_reachable, https_reachable, status_code, headers = await check_http("example.com")

        assert http_reachable is True
        assert https_reachable is False
        assert status_code == 200
        assert headers["server"] == "nginx"

    @pytest.mark.asyncio
    async def test_neither_reachable(self):
        """Both ports fail → all False/0/empty."""
        with patch("utils.domain_utils.asyncio.open_connection", side_effect=ConnectionRefusedError):
            http_reachable, https_reachable, status_code, headers = await check_http("example.com")

        assert http_reachable is False
        assert https_reachable is False
        assert status_code == 0
        assert headers == {}

    @pytest.mark.asyncio
    async def test_status_code_extraction(self):
        """Status line with HTTP/1.1 404 → status_code=404."""
        resp = _http_response("HTTP/1.1 404 Not Found")
        reader = AsyncMock()
        reader.read.side_effect = [resp.encode(), b""]
        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            _, _, status_code, _ = await check_http("example.com")

        assert status_code == 404

    @pytest.mark.asyncio
    async def test_no_status_line_returns_zero(self):
        """Response without a status line → status_code stays 0."""
        reader = AsyncMock()
        reader.read.side_effect = [b"garbage_no_http\r\n", b""]
        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            _, _, status_code, _ = await check_http("example.com")

        assert status_code == 0

    @pytest.mark.asyncio
    async def test_headers_parsed_correctly(self):
        """Response headers become lowercase-keyed dict."""
        resp = _http_response(
            "HTTP/1.1 200 OK",
            {
                "Server": "Apache/2.4",
                "Content-Type": "text/html",
                "X-Custom": "value",
            },
        )
        reader = AsyncMock()
        reader.read.side_effect = [resp.encode(), b""]
        writer = MagicMock()
        writer.drain = AsyncMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            _, _, _, headers = await check_http("example.com")

        assert headers["server"] == "Apache/2.4"
        assert headers["content-type"] == "text/html"
        assert headers["x-custom"] == "value"


# ---------------------------------------------------------------------------
# check_ssl
# ---------------------------------------------------------------------------


def _fake_ssl_object(subject, issuer, not_after_str, cipher_tuple=("TLS_AES_256_GCM_SHA384", "TLSv1.3", 256)):
    """Create a MagicMock that behaves like an SSLSocket for getpeercert / cipher."""
    cert = MagicMock()
    cert.getpeercert.return_value = {
        "subject": ((("commonName", subject),),),
        "issuer": ((("commonName", issuer),),),
        "notAfter": not_after_str,
    }
    cert.cipher.return_value = cipher_tuple
    cert.version.return_value = 3
    return cert


class TestCheckSsl:
    @pytest.mark.asyncio
    async def test_valid_cert_populates_fields(self):
        """Normal cert → subject, issuer, not_after, cipher, supported_versions."""
        future_date = (datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=365)).strftime(
            "%b %d %H:%M:%S %Y %Z"
        )
        ssl_obj = _fake_ssl_object("example.com", "Let's Encrypt", future_date)

        reader = AsyncMock()
        writer = MagicMock()
        writer.get_extra_info.return_value = ssl_obj
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            info = await check_ssl("example.com")

        assert "example.com" in str(info.subject)
        assert "Let's Encrypt" in str(info.issuer)
        assert info.not_after == future_date
        assert info.days_remaining >= 364
        assert info.version == "3"
        assert info.cipher == "TLS_AES_256_GCM_SHA384 256"
        assert "TLSv1.2" in info.supported_versions
        assert "TLSv1.3" in info.supported_versions

    @pytest.mark.asyncio
    async def test_expiring_within_30_days_adds_issue(self):
        """Certificate expires in 15 days → issues list populated."""
        near_date = (datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=15)).strftime("%b %d %H:%M:%S %Y %Z")
        ssl_obj = _fake_ssl_object("example.com", "CA", near_date)

        reader = AsyncMock()
        writer = MagicMock()
        writer.get_extra_info.return_value = ssl_obj
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            info = await check_ssl("example.com")

        assert len(info.issues) == 1
        assert "expires" in info.issues[0]
        assert "15" in info.issues[0] or "14" in info.issues[0]

    @pytest.mark.asyncio
    async def test_expiring_exactly_30_days_adds_issue(self):
        """30 days remaining → still adds issue (<= 30)."""
        near_date = (datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=30)).strftime("%b %d %H:%M:%S %Y %Z")
        ssl_obj = _fake_ssl_object("example.com", "CA", near_date)

        reader = AsyncMock()
        writer = MagicMock()
        writer.get_extra_info.return_value = ssl_obj
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            info = await check_ssl("example.com")

        assert len(info.issues) >= 1
        assert any("expires" in i for i in info.issues)

    @pytest.mark.asyncio
    async def test_not_expiring_adds_no_issue(self):
        """Certificate expires far in future → issues list empty (supported_versions still set)."""
        far_date = (datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=365)).strftime("%b %d %H:%M:%S %Y %Z")
        ssl_obj = _fake_ssl_object("example.com", "CA", far_date)

        reader = AsyncMock()
        writer = MagicMock()
        writer.get_extra_info.return_value = ssl_obj
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            info = await check_ssl("example.com")

        assert len(info.issues) == 0
        assert info.days_remaining >= 364

    @pytest.mark.asyncio
    async def test_connection_failure_adds_error_issue(self):
        """asyncio.open_connection raises → SslInfo.issues has error message."""
        with patch("utils.domain_utils.asyncio.open_connection", side_effect=ConnectionRefusedError):
            info = await check_ssl("example.com")

        assert len(info.issues) == 1
        assert "SSL check failed" in info.issues[0]
        assert info.subject == ""

    @pytest.mark.asyncio
    async def test_no_ssl_object_returns_empty_info(self):
        """writer.get_extra_info returns None → no cert info, but supported_versions still set."""
        reader = AsyncMock()
        writer = MagicMock()
        writer.get_extra_info.return_value = None
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            info = await check_ssl("example.com")

        assert info.subject == ""
        assert info.issuer == ""
        assert info.cipher == ""
        assert "TLSv1.2" in info.supported_versions

    @pytest.mark.asyncio
    async def test_unparseable_date_sets_days_remaining_negative(self):
        """notAfter in unexpected format → days_remaining = -1."""
        ssl_obj = _fake_ssl_object("example.com", "CA", "not-a-real-date")

        reader = AsyncMock()
        writer = MagicMock()
        writer.get_extra_info.return_value = ssl_obj
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            info = await check_ssl("example.com")

        assert info.days_remaining == -1

    @pytest.mark.asyncio
    async def test_expired_cert_days_remaining_negative(self):
        """Certificate expired 30 days ago → days_remaining is negative."""
        past_date = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=30)).strftime("%b %d %H:%M:%S %Y %Z")
        ssl_obj = _fake_ssl_object("example.com", "CA", past_date)

        reader = AsyncMock()
        writer = MagicMock()
        writer.get_extra_info.return_value = ssl_obj
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        with patch("utils.domain_utils.asyncio.open_connection", new_callable=AsyncMock) as mock_conn:
            mock_conn.return_value = (reader, writer)
            info = await check_ssl("example.com")

        assert info.days_remaining < 0
