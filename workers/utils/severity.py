from utils.scan_types import ScanFinding, SeveritySummary


def classify_severity(cvss_score: float | None) -> str:
    """Map a CVSS score to a severity label: critical, high, medium, low, or info."""
    if cvss_score is None:
        return "medium"
    if cvss_score >= 9.0:
        return "critical"
    if cvss_score >= 7.0:
        return "high"
    if cvss_score >= 4.0:
        return "medium"
    if cvss_score >= 0.1:
        return "low"
    return "info"


def compute_severity_summary(findings: list[ScanFinding]) -> SeveritySummary:
    """Count findings by severity level and return a summary with totals."""
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        sev = f.get("severity", "info")
        if sev in counts:
            counts[sev] += 1
    return {
        "total_findings": sum(counts.values()),
        "critical": counts["critical"],
        "high": counts["high"],
        "medium": counts["medium"],
        "low": counts["low"],
        "info": counts["info"],
    }


SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def sort_findings_by_severity(findings: list[ScanFinding]) -> list[ScanFinding]:
    """Sort findings in descending severity order (critical first, info last)."""
    return sorted(findings, key=lambda f: SEVERITY_ORDER.get(f.get("severity", "info"), 4))
