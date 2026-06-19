"""Tests for domain_utils.py: security headers, tech detection, findings."""

from unittest.mock import patch, MagicMock

import pytest

from utils.domain_utils import (
    check_security_headers,
    detect_tech_stack,
    findings_from_domain,
    DomainResult,
    SslInfo,
    HeaderCheck,
    TechInfo,
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
        with patch("utils.domain_utils.TECH_SIGNATURES", new=[
            ("React", "framework", "", ["react"]),
            ("Bootstrap", "css-framework", "", ["bootstrap"]),
        ]):
            headers = {"content-type": "text/html; react"}
            techs = detect_tech_stack("example.com", headers)
            react = next((t for t in techs if t.name == "React"), None)
            assert react is not None
            assert react.confidence == 50


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
        assert categories == {
            "ip_address", "subdomain", "ssl_issue",
            "ssl_cipher", "missing_header", "tech_detected"
        }
