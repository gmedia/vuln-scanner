"""Tests for severity.py: classification, summary, sorting."""

import pytest
from utils.severity import (
    classify_severity,
    compute_severity_summary,
    sort_findings_by_severity,
)


class TestClassifySeverity:
    def test_none_is_medium(self):
        assert classify_severity(None) == "medium"

    def test_critical_at_10(self):
        assert classify_severity(10.0) == "critical"

    def test_critical_at_9(self):
        assert classify_severity(9.0) == "critical"
        assert classify_severity(9.5) == "critical"

    def test_high_at_7(self):
        assert classify_severity(7.0) == "high"
        assert classify_severity(8.9) == "high"

    def test_medium_at_4(self):
        assert classify_severity(4.0) == "medium"
        assert classify_severity(6.9) == "medium"

    def test_low_at_0_1(self):
        assert classify_severity(0.1) == "low"
        assert classify_severity(3.9) == "low"

    def test_info_at_0(self):
        assert classify_severity(0.0) == "info"
        assert classify_severity(0.01) == "info"  # below 0.1 threshold

    def test_negative_is_info(self):
        assert classify_severity(-1.0) == "info"


class TestComputeSeveritySummary:
    def test_empty_findings(self):
        summary = compute_severity_summary([])
        assert summary["total_findings"] == 0
        assert summary["critical"] == 0
        assert summary["high"] == 0
        assert summary["medium"] == 0
        assert summary["low"] == 0
        assert summary["info"] == 0

    def test_counts_severities_correctly(self):
        findings = [
            {"severity": "critical"},
            {"severity": "critical"},
            {"severity": "high"},
            {"severity": "medium"},
            {"severity": "low"},
            {"severity": "info"},
            {"severity": "info"},
        ]
        summary = compute_severity_summary(findings)
        assert summary["total_findings"] == 7
        assert summary["critical"] == 2
        assert summary["high"] == 1
        assert summary["medium"] == 1
        assert summary["low"] == 1
        assert summary["info"] == 2

    def test_unknown_severity_skipped(self):
        findings = [
            {"severity": "unknown"},
            {"severity": "critical"},
        ]
        summary = compute_severity_summary(findings)
        assert summary["total_findings"] == 1
        assert summary["critical"] == 1
        assert summary["info"] == 0

    def test_missing_severity_key_defaults_to_info(self):
        findings = [{"not_severity": "critical"}]
        summary = compute_severity_summary(findings)
        assert summary["info"] == 1


class TestSortFindingsBySeverity:
    def test_sorts_critical_first_info_last(self):
        findings = [
            {"severity": "info"},
            {"severity": "critical"},
            {"severity": "medium"},
        ]
        sorted_f = sort_findings_by_severity(findings)
        assert sorted_f[0]["severity"] == "critical"
        assert sorted_f[1]["severity"] == "medium"
        assert sorted_f[2]["severity"] == "info"

    def test_full_order(self):
        findings = [
            {"severity": "high"},
            {"severity": "low"},
            {"severity": "info"},
            {"severity": "medium"},
            {"severity": "critical"},
        ]
        sorted_f = sort_findings_by_severity(findings)
        expected_order = ["critical", "high", "medium", "low", "info"]
        assert [f["severity"] for f in sorted_f] == expected_order

    def test_empty_list(self):
        assert sort_findings_by_severity([]) == []

    def test_unknown_severity_sorted_last(self):
        findings = [
            {"severity": "unknown"},
            {"severity": "critical"},
        ]
        sorted_f = sort_findings_by_severity(findings)
        assert sorted_f[0]["severity"] == "critical"
        assert sorted_f[1]["severity"] == "unknown"

    def test_missing_severity_sorted_last(self):
        findings = [
            {"severity": "high"},
            {"not_severity": "critical"},
        ]
        sorted_f = sort_findings_by_severity(findings)
        assert sorted_f[0]["severity"] == "high"
