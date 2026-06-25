import hashlib
import json
import os
from typing import Any, cast

import httpx
import redis
from loguru import logger

OSV_BASE_URL = os.getenv("OSV_BASE_URL", "https://api.osv.dev/v1")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
_redis_pool: redis.ConnectionPool | None = None


def _get_redis_pool() -> redis.ConnectionPool:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.ConnectionPool.from_url(REDIS_URL)
    return _redis_pool
CVE_CACHE_TTL = int(os.getenv("CVE_CACHE_TTL", "3600"))


def _cache_key(package_name: str, ecosystem: str, version: str) -> str:
    raw = f"{ecosystem}:{package_name}:{version}"
    return f"cve_cache:{hashlib.sha256(raw.encode()).hexdigest()}"


def _get_cached_vulns(package_name: str, ecosystem: str, version: str) -> list[dict] | None:
    try:
        r = redis.Redis(connection_pool=_get_redis_pool())
        key = _cache_key(package_name, ecosystem, version)
        data = r.get(key)
        if data is not None:
            assert isinstance(data, (str, bytes, bytearray))
            logger.info("CVE cache HIT for {ecosystem}:{pkg}@{ver}", ecosystem=ecosystem, pkg=package_name, ver=version)
            return cast(list[dict], json.loads(data))
        logger.debug("CVE cache MISS for {ecosystem}:{pkg}@{ver}", ecosystem=ecosystem, pkg=package_name, ver=version)
    except Exception as e:
        logger.warning("CVE cache read error for {ecosystem}:{pkg}@{ver}: {error}",
                       ecosystem=ecosystem, pkg=package_name, ver=version, error=e)
    return None


def _set_cached_vulns(package_name: str, ecosystem: str, version: str, vulns: list[dict]) -> None:
    try:
        r = redis.Redis(connection_pool=_get_redis_pool())
        r.setex(_cache_key(package_name, ecosystem, version), CVE_CACHE_TTL, json.dumps(vulns))
    except Exception as e:
        logger.warning("CVE cache write error for {ecosystem}:{pkg}@{ver}: {error}",
                       ecosystem=ecosystem, pkg=package_name, ver=version, error=e)


async def _query_ecosystem(package_name: str, ecosystem: str, version: str) -> list[dict[str, Any]]:
    cached = _get_cached_vulns(package_name, ecosystem, version)
    if cached is not None:
        return cached
    payload = {
        "package": {"name": package_name, "ecosystem": ecosystem},
        "version": version,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"{OSV_BASE_URL}/query", json=payload)
            if resp.status_code == 200:
                vulns: list[dict[str, Any]] = resp.json().get("vulns", [])
                _set_cached_vulns(package_name, ecosystem, version, vulns)
                return vulns
            logger.warning("OSV query returned status {status} for {ecosystem}:{pkg}@{ver}",
                           status=resp.status_code, ecosystem=ecosystem, pkg=package_name, ver=version)
            return []
    except Exception as e:
        logger.error("OSV query failed for {ecosystem}:{pkg}@{ver}: {error}",
                     ecosystem=ecosystem, pkg=package_name, ver=version, error=e)
        return []


async def query_osv_ecosystems(package_name: str, version: str) -> list[dict[str, Any]]:
    """Query the OSV.dev API across multiple ecosystems for known vulnerabilities."""
    ecosystems = ["Debian", "Alpine", "Ubuntu", "PyPI", "npm", "Maven", "Go"]
    all_vulns = []

    for ecosystem in ecosystems:
        vulns = await _query_ecosystem(package_name, ecosystem, version)
        all_vulns.extend(vulns)

    return all_vulns


async def lookup_service_cves(service_name: str, product: str, version: str) -> list[dict[str, Any]]:
    """Look up CVEs for a service by name, product, and version using OSV.dev."""
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
    """Extract the CVSS v3 score from an OSV vulnerability entry, falling back to any score."""
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


def _extract_remediation(vuln: dict[str, Any]) -> str | None:
    parts = []
    db_specific = vuln.get("database_specific") or {}
    fixed = db_specific.get("fixed_version") or db_specific.get("fixed")
    if fixed:
        parts.append(f"Upgrade to version {fixed} or later")
    refs = vuln.get("references") or []
    fix_urls = [r["url"] for r in refs if r.get("type") == "FIX" and r.get("url")]
    if fix_urls:
        parts.append("Fix commits: " + ", ".join(fix_urls[:3]))
    if not parts:
        advisory_urls = [r["url"] for r in refs if r.get("type") == "ADVISORY" and r.get("url")]
        if advisory_urls:
            parts.append("Advisory: " + advisory_urls[0])
    return "\n".join(parts) if parts else None


def format_vuln_finding(vuln: dict[str, Any], cvss_score: float | None) -> dict:
    """Format an OSV vulnerability into a standardized finding dict with severity and remediation."""
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
        "remediation": _extract_remediation(vuln),
        "raw_data": vuln,
    }


def severity_from_cvss(cvss: float | None) -> str:
    """Map a CVSS score to a severity label: critical, high, medium, low, or info."""
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
