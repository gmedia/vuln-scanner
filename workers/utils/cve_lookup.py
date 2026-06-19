import os
import json
import httpx
from typing import Any


OSV_BASE_URL = os.getenv("OSV_BASE_URL", "https://api.osv.dev/v1")
NVD_API_KEY = os.getenv("NVD_API_KEY", "")


async def query_osv(package_name: str, version: str) -> list[dict[str, Any]]:
    payload = {
        "package": {"name": package_name, "ecosystem": "Debian"},
        "version": version,
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{OSV_BASE_URL}/query", json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("vulns", [])
            return []
    except Exception:
        return []


async def query_osv_ecosystems(package_name: str, version: str) -> list[dict[str, Any]]:
    ecosystems = ["Debian", "Alpine", "Ubuntu", "PyPI", "npm", "Maven", "Go"]
    all_vulns = []

    for ecosystem in ecosystems:
        payload = {
            "package": {"name": package_name, "ecosystem": ecosystem},
            "version": version,
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(f"{OSV_BASE_URL}/query", json=payload)
                if resp.status_code == 200:
                    vulns = resp.json().get("vulns", [])
                    all_vulns.extend(vulns)
        except Exception:
            continue

    return all_vulns


async def lookup_service_cves(service_name: str, product: str, version: str) -> list[dict[str, Any]]:
    all_vulns = await query_osv_ecosystems(service_name, version)
    if product and product != service_name:
        product_vulns = await query_osv_ecosystems(product, version)
        all_vulns.extend(product_vulns)

    seen = set()
    unique = []
    for v in all_vulns:
        cid = v.get("id", "")
        if cid and cid not in seen:
            seen.add(cid)
            unique.append(v)

    return unique


def extract_cvss(vuln: dict[str, Any]) -> float | None:
    severity_list = vuln.get("severity", [])
    for sev in severity_list:
        if sev.get("type") == "CVSS_V3":
            score = sev.get("score")
            if isinstance(score, (int, float)):
                return float(score)
    for sev in severity_list:
        score = sev.get("score")
        if isinstance(score, (int, float)):
            return float(score)
    return None


def format_vuln_finding(vuln: dict[str, Any], cvss_score: float | None) -> dict:
    aliases = vuln.get("aliases", [])
    cve_id = ""
    for alias in aliases:
        if alias.startswith("CVE-"):
            cve_id = alias
            break
    cve_id = cve_id or vuln.get("id", "")

    summary = vuln.get("summary", "") or vuln.get("details", "") or ""
    if len(summary) > 500:
        summary = summary[:497] + "..."

    severity = severity_from_cvss(cvss_score)

    return {
        "severity": severity,
        "category": "vulnerability",
        "title": cve_id,
        "description": summary,
        "cve_id": cve_id,
        "cvss_score": cvss_score,
    }


def severity_from_cvss(cvss: float | None) -> str:
    if cvss is None:
        return "medium"
    if cvss >= 9.0:
        return "critical"
    if cvss >= 7.0:
        return "high"
    if cvss >= 4.0:
        return "medium"
    if cvss >= 0.1:
        return "low"
    return "info"
