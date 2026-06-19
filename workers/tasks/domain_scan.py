import os
import json
import uuid
from datetime import datetime, timezone

import redis
from celery import shared_task
from sqlalchemy import update

from utils.database import get_sync_session
from utils.domain_utils import (
    resolve_dns, enumerate_subdomains, check_http, check_ssl,
    check_security_headers, detect_tech_stack, findings_from_domain,
)
from utils.cve_lookup import lookup_service_cves, extract_cvss, format_vuln_finding
from utils.severity import compute_severity_summary, sort_findings_by_severity
from utils.nmap_runner import run_nmap, findings_from_nmap

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


def publish_progress(job_id: str, step: str, progress: int, message: str):
    try:
        r = redis.Redis.from_url(REDIS_URL)
        r.publish(
            f"scan_progress:{job_id}",
            json.dumps({"type": "progress", "step": step, "progress": progress, "message": message}),
        )
    except Exception:
        pass


def _run_async(coro):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@shared_task(bind=True, name="domain_scan.run", max_retries=2, default_retry_delay=60)
def run_domain_scan(self, job_id: str, domain: str):
    domain = domain.lower().strip()
    if domain.startswith("http://") or domain.startswith("https://"):
        from urllib.parse import urlparse
        domain = urlparse(domain).hostname or domain

    session = get_sync_session()
    _update_status(session, job_id, "running", started_at=datetime.now(timezone.utc))
    session.commit()

    publish_progress(job_id, "dns_resolve", 5, f"Resolving DNS for {domain}...")

    ips, records = _run_async(resolve_dns(domain))
    publish_progress(job_id, "dns_resolved", 10, f"Found {len(ips)} IP(s) for {domain}")

    publish_progress(job_id, "subdomain_enum", 15, "Enumerating subdomains via crt.sh...")
    subdomains = _run_async(enumerate_subdomains(domain))
    publish_progress(job_id, "subdomain_done", 25, f"Found {len(subdomains)} subdomains")

    publish_progress(job_id, "http_check", 30, f"Checking HTTP/HTTPS connectivity for {domain}...")
    http_ok, https_ok, status, headers = _run_async(check_http(domain))
    publish_progress(job_id, "http_done", 40, f"{'HTTPS' if https_ok else 'HTTP' if http_ok else 'No HTTP'} reachable (status {status})")

    ssl_info = None
    if https_ok:
        publish_progress(job_id, "ssl_check", 45, "Checking SSL/TLS certificate...")
        ssl_info = _run_async(check_ssl(domain))

    publish_progress(job_id, "headers_check", 55, "Analyzing security headers...")
    header_checks = check_security_headers(headers)

    publish_progress(job_id, "tech_detect", 65, "Detecting technology stack...")
    tech_stack = detect_tech_stack(domain, headers)

    domain_result = type("DomainResult", (), {
        "domain": domain,
        "ip_addresses": ips,
        "dns_records": records,
        "subdomains": subdomains,
        "http_reachable": http_ok,
        "https_reachable": https_ok,
        "status_code": status,
        "response_headers": headers,
        "ssl_info": ssl_info or type("obj", (), {"issues": [], "cipher": "", "subject": "", "issuer": "", "not_after": "", "days_remaining": 0}),
        "tech_stack": tech_stack,
        "header_checks": header_checks,
    })()

    all_findings = findings_from_domain(domain_result)

    publish_progress(job_id, "nmap_scan", 70, f"Running quick nmap scan on {domain}...")
    try:
        nmap_result = _run_async(run_nmap(domain, "1-1000"))
        base_nmap = findings_from_nmap(nmap_result)
        all_findings.extend(base_nmap)
    except Exception:
        pass

    publish_progress(job_id, "cve_lookup", 75, "Looking up CVEs for detected technologies...")
    total_vuln = 0
    for tech in tech_stack:
        if tech.name and tech.category:
            try:
                vulns = _run_async(lookup_service_cves(tech.name, tech.name, tech.version or ""))
            except Exception:
                vulns = []
            for vuln in vulns:
                cvss = extract_cvss(vuln)
                finding = format_vuln_finding(vuln, cvss)
                finding["description"] = (
                    f"[{domain}] {tech.name} ({tech.category})\n"
                    + (finding.get("description") or "")
                )
                all_findings.append(finding)
                total_vuln += 1

    all_findings = sort_findings_by_severity(all_findings)
    summary = compute_severity_summary(all_findings)

    publish_progress(job_id, "saving", 90, "Saving results...")
    _save_findings(session, job_id, all_findings)

    _update_status(session, job_id, "completed", progress=100,
                   result_summary=summary, completed_at=datetime.now(timezone.utc))
    session.commit()
    session.close()

    publish_progress(job_id, "completed", 100,
                   f"Done: {summary['total_findings']} findings "
                   f"({summary['critical']}C/{summary['high']}H/{summary['medium']}M/{summary['low']}L)")

    return {"job_id": job_id, "summary": summary}


def _update_status(session, job_id: str, status: str, **kwargs):
    from app.models.scan_job import ScanJob
    values = {"status": status, **kwargs}
    session.execute(update(ScanJob).where(ScanJob.id == job_id).values(**values))


def _save_findings(session, job_id: str, findings: list[dict]):
    from app.models.scan_finding import ScanFinding
    for f in findings:
        finding = ScanFinding(
            id=uuid.uuid4(),
            job_id=job_id,
            severity=f.get("severity", "info"),
            category=f.get("category", ""),
            title=f.get("title", "")[:500],
            description=f.get("description", "")[:2000],
            cve_id=f.get("cve_id", "")[:20] if f.get("cve_id") else None,
            cvss_score=f.get("cvss_score"),
            remediation=f.get("remediation"),
            raw_data=f.get("raw_data"),
        )
        session.add(finding)
