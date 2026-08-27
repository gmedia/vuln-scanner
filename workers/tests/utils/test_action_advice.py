"""Tests for action_advice templates, ensure_remediation, and ensure_impact."""

from utils.action_advice import (
    CATEGORY_ADVICE,
    CATEGORY_ATTACKER_BENEFIT,
    CATEGORY_IMPACT,
    advice_for_category,
    advice_for_open_port,
    attacker_benefit_for_category,
    attacker_benefit_for_open_port,
    ensure_attacker_benefit,
    ensure_attacker_benefits,
    ensure_impact,
    ensure_impacts,
    ensure_remediation,
    ensure_remediations,
    impact_for_category,
    impact_for_open_port,
)
from utils.cve_lookup import _extract_remediation, format_vuln_finding


class TestAdviceForOpenPort:
    def test_risky_port_ssh_not_special(self):
        advice = advice_for_open_port("Open port: 22/tcp (ssh)")
        assert advice == CATEGORY_ADVICE["open_port"]

    def test_risky_port_redis(self):
        advice = advice_for_open_port("Open port: 6379/tcp (redis)")
        assert "Redis" in advice
        assert "AUTH" in advice

    def test_risky_port_rdp(self):
        advice = advice_for_open_port("Open port: 3389/tcp (ms-wbt-server)")
        assert "RDP" in advice


class TestAdviceForCategory:
    def test_explicit_wins(self):
        result = advice_for_category(
            "missing_header",
            explicit="Add HSTS header (max-age=31536000)",
        )
        assert result == "Add HSTS header (max-age=31536000)"

    def test_category_template(self):
        result = advice_for_category("android_debug")
        assert result is not None
        assert "debuggable" in result

    def test_unknown_category(self):
        assert advice_for_category("not_a_real_category") is None


class TestEnsureRemediation:
    def test_fills_when_missing(self):
        finding = {
            "severity": "info",
            "category": "open_port",
            "title": "Open port: 80/tcp (http)",
            "description": "Service: http",
        }
        ensure_remediation(finding)
        assert finding.get("remediation")
        assert "firewall" in finding["remediation"].lower() or "service" in finding["remediation"].lower()

    def test_preserves_existing(self):
        finding = {
            "severity": "high",
            "category": "vulnerability",
            "title": "CVE-2024-1",
            "description": "x",
            "remediation": "Upgrade to 2.0.0",
        }
        ensure_remediation(finding)
        assert finding["remediation"] == "Upgrade to 2.0.0"

    def test_risky_port_in_ensure(self):
        finding = {
            "severity": "info",
            "category": "open_port",
            "title": "Open port: 445/tcp (microsoft-ds)",
            "description": "SMB",
        }
        ensure_remediation(finding)
        assert "SMB" in finding["remediation"]

    def test_ensure_remediations_batch(self):
        findings = [
            {
                "severity": "info",
                "category": "ip_address",
                "title": "IP Address: 1.2.3.4",
                "description": "Resolved",
            },
            {
                "severity": "high",
                "category": "hardcoded_secret",
                "title": "Potential aws_access_key detected",
                "description": "Found: AKIAxxxx",
            },
        ]
        ensure_remediations(findings)
        assert all(f.get("remediation") for f in findings)


class TestExtractRemediationEventsFixed:
    def test_events_fixed_single(self):
        vuln = {
            "id": "GHSA-test",
            "aliases": ["CVE-2024-9990"],
            "database_specific": {},
            "references": [],
            "affected": [
                {
                    "package": {"name": "pkg", "ecosystem": "PyPI"},
                    "ranges": [
                        {
                            "type": "ECOSYSTEM",
                            "events": [{"introduced": "0"}, {"fixed": "1.2.3"}],
                        }
                    ],
                }
            ],
        }
        result = _extract_remediation(vuln)
        assert result is not None
        assert "1.2.3" in result

    def test_events_fixed_multiple_dedup(self):
        vuln = {
            "id": "GHSA-multi",
            "database_specific": {},
            "references": [],
            "affected": [
                {
                    "ranges": [
                        {"events": [{"fixed": "2.0.0"}, {"fixed": "2.0.0"}]},
                    ]
                },
                {
                    "ranges": [
                        {"events": [{"fixed": "2.1.0"}]},
                    ]
                },
            ],
        }
        result = _extract_remediation(vuln)
        assert result is not None
        assert "2.0.0" in result
        assert "2.1.0" in result

    def test_database_specific_wins_over_events(self):
        vuln = {
            "id": "GHSA-db",
            "database_specific": {"fixed_version": "9.9.9"},
            "references": [],
            "affected": [{"ranges": [{"events": [{"fixed": "1.0.0"}]}]}],
        }
        result = _extract_remediation(vuln)
        assert result is not None
        assert "9.9.9" in result
        assert "1.0.0" not in result

    def test_format_vuln_fallback_template(self):
        vuln = {
            "id": "MAL-2025-1",
            "aliases": [],
            "summary": "Malware package",
            "severity": [],
            "database_specific": {},
            "references": [],
        }
        finding = format_vuln_finding(vuln, None)
        assert finding["remediation"] is not None
        assert "advisory" in finding["remediation"].lower() or "upgrade" in finding["remediation"].lower()
        assert finding.get("impact")
        assert "unfixed" in finding["impact"].lower() or "exploit" in finding["impact"].lower()


class TestImpactForOpenPort:
    def test_generic_port_uses_category(self):
        impact = impact_for_open_port("Open port: 22/tcp (ssh)")
        assert impact == CATEGORY_IMPACT["open_port"]

    def test_risky_port_redis(self):
        impact = impact_for_open_port("Open port: 6379/tcp (redis)")
        assert "Redis" in impact
        assert "unauthenticated" in impact.lower() or "command" in impact.lower()

    def test_risky_port_rdp(self):
        impact = impact_for_open_port("Open port: 3389/tcp (ms-wbt-server)")
        assert "RDP" in impact


class TestImpactForCategory:
    def test_explicit_wins(self):
        result = impact_for_category(
            "missing_header",
            explicit="Custom impact for missing CSP.",
        )
        assert result == "Custom impact for missing CSP."

    def test_category_template(self):
        result = impact_for_category("hardcoded_secret")
        assert result is not None
        assert "binary" in result.lower() or "secret" in result.lower()

    def test_unknown_category(self):
        assert impact_for_category("not_a_real_category") is None


class TestEnsureImpact:
    def test_fills_when_missing(self):
        finding = {
            "severity": "info",
            "category": "open_port",
            "title": "Open port: 80/tcp (http)",
            "description": "Service: http",
        }
        ensure_impact(finding)
        assert finding.get("impact")
        assert "attack" in finding["impact"].lower() or "surface" in finding["impact"].lower()

    def test_preserves_existing(self):
        finding = {
            "severity": "high",
            "category": "vulnerability",
            "title": "CVE-2024-1",
            "description": "x",
            "impact": "Custom impact text",
        }
        ensure_impact(finding)
        assert finding["impact"] == "Custom impact text"

    def test_risky_port_in_ensure(self):
        finding = {
            "severity": "info",
            "category": "open_port",
            "title": "Open port: 445/tcp (microsoft-ds)",
            "description": "SMB",
        }
        ensure_impact(finding)
        assert "SMB" in finding["impact"]

    def test_ensure_remediation_also_fills_impact(self):
        finding = {
            "severity": "high",
            "category": "android_debug",
            "title": "Debuggable APK",
            "description": "android:debuggable=true",
        }
        ensure_remediation(finding)
        assert finding.get("remediation")
        assert finding.get("impact")
        assert "debuggable" in finding["impact"].lower() or "debug" in finding["impact"].lower()
        assert finding.get("attacker_benefit")
        assert "debug" in finding["attacker_benefit"].lower()

    def test_ensure_impacts_batch(self):
        findings = [
            {
                "severity": "info",
                "category": "ip_address",
                "title": "IP Address: 1.2.3.4",
                "description": "Resolved",
            },
            {
                "severity": "high",
                "category": "hardcoded_secret",
                "title": "Potential aws_access_key detected",
                "description": "Found: AKIAxxxx",
            },
        ]
        ensure_impacts(findings)
        assert all(f.get("impact") for f in findings)

    def test_ensure_remediations_fills_impact_too(self):
        findings = [
            {
                "severity": "medium",
                "category": "ssl_cipher",
                "title": "Weak cipher suite",
                "description": "TLS_RSA_WITH_RC4_128_MD5",
            },
        ]
        ensure_remediations(findings)
        assert findings[0].get("remediation")
        assert findings[0].get("impact")
        assert findings[0].get("attacker_benefit")


class TestAttackerBenefitForOpenPort:
    def test_generic_port_uses_category(self):
        benefit = attacker_benefit_for_open_port("Open port: 22/tcp (ssh)")
        assert benefit == CATEGORY_ATTACKER_BENEFIT["open_port"]

    def test_risky_port_redis(self):
        benefit = attacker_benefit_for_open_port("Open port: 6379/tcp (redis)")
        assert "Redis" in benefit
        assert "AUTH" in benefit or "foothold" in benefit.lower()


class TestAttackerBenefitForCategory:
    def test_explicit_wins(self):
        result = attacker_benefit_for_category(
            "missing_header",
            explicit="Custom attacker benefit text.",
        )
        assert result == "Custom attacker benefit text."

    def test_category_template(self):
        result = attacker_benefit_for_category("hardcoded_secret")
        assert result is not None
        assert "secret" in result.lower() or "binary" in result.lower() or "key" in result.lower()

    def test_unknown_category(self):
        assert attacker_benefit_for_category("not_a_real_category") is None


class TestEnsureAttackerBenefit:
    def test_fills_when_missing(self):
        finding = {
            "severity": "info",
            "category": "open_port",
            "title": "Open port: 80/tcp (http)",
            "description": "Service: http",
        }
        ensure_attacker_benefit(finding)
        assert finding.get("attacker_benefit")
        assert "port" in finding["attacker_benefit"].lower() or "service" in finding["attacker_benefit"].lower()

    def test_preserves_existing(self):
        finding = {
            "severity": "high",
            "category": "vulnerability",
            "title": "CVE-2024-1",
            "description": "x",
            "attacker_benefit": "Custom benefit text",
        }
        ensure_attacker_benefit(finding)
        assert finding["attacker_benefit"] == "Custom benefit text"

    def test_risky_port_in_ensure(self):
        finding = {
            "severity": "info",
            "category": "open_port",
            "title": "Open port: 445/tcp (microsoft-ds)",
            "description": "SMB",
        }
        ensure_attacker_benefit(finding)
        assert "SMB" in finding["attacker_benefit"]

    def test_ensure_remediation_also_fills_attacker_benefit(self):
        finding = {
            "severity": "high",
            "category": "android_debug",
            "title": "Debuggable APK",
            "description": "android:debuggable=true",
        }
        ensure_remediation(finding)
        assert finding.get("remediation")
        assert finding.get("impact")
        assert finding.get("attacker_benefit")
        assert "debug" in finding["attacker_benefit"].lower()

    def test_ensure_attacker_benefits_batch(self):
        findings = [
            {
                "severity": "info",
                "category": "ip_address",
                "title": "IP Address: 1.2.3.4",
                "description": "Resolved",
            },
            {
                "severity": "high",
                "category": "hardcoded_secret",
                "title": "Potential aws_access_key detected",
                "description": "Found: AKIAxxxx",
            },
        ]
        ensure_attacker_benefits(findings)
        assert all(f.get("attacker_benefit") for f in findings)
