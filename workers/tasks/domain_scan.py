import asyncio
import json
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import redis
from celery import shared_task
from loguru import logger
from sqlalchemy import update

from tasks.dead_letter import dead_letter_handler
from utils.cve_lookup import extract_cvss, format_vuln_finding, lookup_service_cves
from utils.database import get_sync_session
from utils.domain_utils import (
    check_http,
    check_security_headers,
    check_ssl,
    detect_tech_stack,
    enumerate_subdomains,
    findings_from_domain,
    resolve_dns,
)
from utils.nmap_runner import findings_from_nmap, run_nmap
from utils.redis_helpers import get_redis_pool
from utils.scan_types import ScanFinding, TaskResult
from utils.severity import compute_severity_summary, sort_findings_by_severity


def publish_progress(job_id: str, step: str, progress: int, message: str) -> None:
    """Publish a progress update to the scan's Redis pubsub channel."""
    try:
        r = redis.Redis(connection_pool=get_redis_pool())
        r.publish(
            f"scan_progress:{job_id}",
            json.dumps({"type": "progress", "step": step, "progress": progress, "message": message}),
        )
    except Exception as e:
        logger.warning("Redis publish failed for job {job_id} step {step}: {error}", job_id=job_id, step=step, error=e)


def _run_async(coro: Any) -> Any:
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@shared_task(bind=True, name="domain_scan.run", max_retries=3)  # type: ignore
def run_domain_scan(self: Any, job_id: str, domain: str) -> TaskResult:
    """Execute a full domain scan: DNS, subdomains, HTTP, SSL, headers, tech stack, nmap, and CVEs."""
    logger.info("Domain scan started: job={job_id} domain={domain}", job_id=job_id, domain=domain)
    domain = domain.lower().strip()
    if domain.startswith("http://") or domain.startswith("https://"):
        from urllib.parse import urlparse

        domain = urlparse(domain).hostname or domain

    try:
        session = get_sync_session()
        _update_status(session, job_id, "running", started_at=datetime.now(UTC))
        session.commit()

        publish_progress(job_id, "dns_resolve", 5, f"Resolving DNS for {domain}...")

        ips, records = _run_async(resolve_dns(domain))
        publish_progress(job_id, "dns_resolved", 10, f"Found {len(ips)} IP(s) for {domain}")

        publish_progress(job_id, "subdomain_enum", 15, "Enumerating subdomains via crt.sh...")
        subdomains = _run_async(enumerate_subdomains(domain))
        publish_progress(job_id, "subdomain_done", 25, f"Found {len(subdomains)} subdomains")

        publish_progress(job_id, "http_check", 30, f"Checking HTTP/HTTPS connectivity for {domain}...")
        http_ok, https_ok, status, headers = _run_async(check_http(domain))
        publish_progress(
            job_id,
            "http_done",
            40,
            f"{'HTTPS' if https_ok else 'HTTP' if http_ok else 'No HTTP'} reachable (status {status})",
        )

        ssl_info = None
        if https_ok:
            publish_progress(job_id, "ssl_check", 45, "Checking SSL/TLS certificate...")
            ssl_info = _run_async(check_ssl(domain))

        publish_progress(job_id, "headers_check", 55, "Analyzing security headers...")
        header_checks = check_security_headers(headers)

        publish_progress(job_id, "tech_detect", 65, "Detecting technology stack...")
        tech_stack = detect_tech_stack(domain, headers)

        domain_result = type(
            "DomainResult",
            (),
            {
                "domain": domain,
                "ip_addresses": ips,
                "dns_records": records,
                "subdomains": subdomains,
                "http_reachable": http_ok,
                "https_reachable": https_ok,
                "status_code": status,
                "response_headers": headers,
                "ssl_info": ssl_info
                or type(
                    "obj",
                    (),
                    {
                        "issues": [],
                        "cipher": "",
                        "subject": "",
                        "issuer": "",
                        "not_after": "",
                        "days_remaining": 0,
                    },
                ),
                "tech_stack": tech_stack,
                "header_checks": header_checks,
            },
        )()

        all_findings = findings_from_domain(domain_result)

        publish_progress(job_id, "nmap_scan", 70, f"Running quick nmap scan on {domain}...")
        try:
            nmap_result = _run_async(run_nmap(domain, "1-1000"))
            base_nmap = findings_from_nmap(nmap_result)
            all_findings.extend(base_nmap)
        except Exception as e:
            logger.warning("Nmap scan failed for domain scan {domain}: {error}", domain=domain, error=e)

        publish_progress(job_id, "cve_lookup", 75, "Looking up CVEs for detected technologies...")
        total_vuln = 0
        for tech in tech_stack:
            if tech.name and tech.category:
                try:
                    vulns = _run_async(lookup_service_cves(tech.name, tech.name, tech.version or ""))
                except Exception as e:
                    logger.warning(
                        "CVE lookup failed for {tech} {ver}: {error}", tech=tech.name, ver=tech.version or "", error=e
                    )
                    vulns = []
                for vuln in vulns:
                    cvss = extract_cvss(vuln)
                    finding = format_vuln_finding(vuln, cvss)
                    finding["description"] = f"[{domain}] {tech.name} ({tech.category})\n" + (
                        finding.get("description") or ""
                    )
                    all_findings.append(finding)
                    total_vuln += 1

        all_findings = sort_findings_by_severity(all_findings)
        summary = compute_severity_summary(all_findings)

        publish_progress(job_id, "saving", 90, "Saving results...")
        _save_findings(session, job_id, all_findings)

        _update_status(
            session, job_id, "completed", progress=100, result_summary=summary, completed_at=datetime.now(UTC)
        )
        session.commit()
        session.close()

        logger.info(
            "Domain scan complete: job={job_id} domain={domain} findings={total} "
            "critical={c} high={h} medium={m} low={l}",
            job_id=job_id,
            domain=domain,
            total=summary["total_findings"],
            c=summary["critical"],
            h=summary["high"],
            m=summary["medium"],
            l=summary["low"],
        )
        publish_progress(
            job_id,
            "completed",
            100,
            f"Done: {summary['total_findings']} findings "
            f"({summary['critical']}C/{summary['high']}H/{summary['medium']}M/{summary['low']}L)",
        )

        try:
            r = redis.Redis(connection_pool=get_redis_pool())
            r.set("health:last_task_completed", time.time())
        except Exception as e:
            logger.warning("Failed to update Redis health timestamp for job {job_id}: {error}", job_id=job_id, error=e)

        return {"job_id": job_id, "summary": summary}
    except Exception as e:
        try:
            _update_status(session, job_id, "failed")
            _refund_credits(session, job_id, "domain")
            session.commit()
            session.close()
        except Exception as e2:
            logger.warning("Failed to update status/commit for failed job {job_id}: {error}", job_id=job_id, error=e2)
        publish_progress(job_id, "failed", 100, f"Domain scan failed: {str(e)[:200]}")
        if self.request.retries >= self.max_retries:
            dead_letter_handler.delay(
                task_name="domain_scan.run",
                args=[job_id, domain],
                kwargs={},
                exception_info=str(e),
            )
        raise self.retry(exc=e, countdown=60 * (2**self.request.retries)) from e


def _update_status(session: Any, job_id: str, status: str, **kwargs: object) -> None:
    from app.models.scan_job import ScanJob

    values = {"status": status, **kwargs}
    session.execute(update(ScanJob).where(ScanJob.id == job_id).values(**values))


def _save_findings(session: Any, job_id: str, findings: list[ScanFinding]) -> None:
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


def _refund_credits(session: Any, job_id: str, scan_type: str) -> None:
    from app.models.credit_log import CreditLog
    from app.models.scan_job import ScanJob
    from app.models.user import User

    job = session.query(ScanJob).where(ScanJob.id == job_id).one_or_none()
    if not job or not job.user_id or not job.credit_cost:
        return

    user = session.query(User).where(User.id == job.user_id).one_or_none()
    if not user:
        return

    user.credits += job.credit_cost
    refund_log = CreditLog(
        user_id=user.id,
        amount=job.credit_cost,
        type="refund",
        description=f"Refund: {scan_type} scan failed",
        reference_id=job.id,
    )
    session.add(refund_log)
