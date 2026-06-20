import json
import os
import time
import uuid
from datetime import UTC, datetime

import redis
from celery import shared_task
from loguru import logger
from sqlalchemy import update

from tasks.dead_letter import dead_letter_handler
from utils.cve_lookup import extract_cvss, format_vuln_finding, lookup_service_cves
from utils.database import get_sync_session
from utils.nmap_runner import findings_from_nmap, run_nmap
from utils.severity import compute_severity_summary, sort_findings_by_severity

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


def publish_progress(job_id: str, step: str, progress: int, message: str):
    try:
        r = redis.Redis.from_url(REDIS_URL)
        r.publish(
            f"scan_progress:{job_id}",
            json.dumps({"type": "progress", "step": step, "progress": progress, "message": message}),
        )
    except Exception as e:
        logger.warning("Redis publish failed for job {job_id} step {step}: {error}", job_id=job_id, step=step, error=e)


def _run_async(coro):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@shared_task(bind=True, name="ip_scan.run", max_retries=3)
def run_ip_scan(self, job_id: str, target: str, ports: str = "1-1000"):
    logger.info("IP scan started: job={job_id} target={target} ports={ports}", job_id=job_id, target=target, ports=ports)
    session = get_sync_session()

    _update_status(session, job_id, "running", started_at=datetime.now(UTC))
    session.commit()

    publish_progress(job_id, "nmap_scan", 5, f"Starting Nmap scan on {target} ports {ports}...")

    try:
        nmap_result = _run_async(run_nmap(target, ports))
    except Exception as e:
        _update_status(session, job_id, "failed")
        session.commit()
        session.close()
        publish_progress(job_id, "failed", 100, f"Nmap scan failed: {str(e)[:200]}")
        if self.request.retries >= self.max_retries:
            dead_letter_handler.delay(
                task_name="ip_scan.run",
                args=[job_id, target, ports],
                kwargs={},
                exception_info=str(e),
            )
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))

    hosts_up = [h for h in nmap_result.hosts if h.status == "up"]
    port_count = sum(len(h.ports) for h in hosts_up)
    logger.info("IP scan nmap complete: job={job_id} hosts={hosts} ports={ports}", job_id=job_id, hosts=len(hosts_up), ports=port_count)
    publish_progress(job_id, "nmap_done", 30, f"Found {len(hosts_up)} hosts, {port_count} open ports")

    base_findings = findings_from_nmap(nmap_result)
    all_findings = list(base_findings)

    total_vuln = 0
    checked = 0
    for host in hosts_up:
        for port in host.ports:
            checked += 1
            if port.product and port.version:
                try:
                    vulns = _run_async(lookup_service_cves(port.service, port.product, port.version))
                except Exception as e:
                    logger.warning("CVE lookup failed for {service} {product} {ver}: {error}", service=port.service, product=port.product, ver=port.version, error=e)
                    vulns = []
                for vuln in vulns:
                    cvss = extract_cvss(vuln)
                    finding = format_vuln_finding(vuln, cvss)
                    finding["description"] = (
                        f"[{host.ip}:{port.port}/{port.protocol}] {port.service} {port.product} {port.version}\n"
                        + (finding.get("description") or "")
                    )
                    all_findings.append(finding)
                    total_vuln += 1

            progress = 35 + int((checked / max(port_count, 1)) * 50)
            publish_progress(job_id, "cve_lookup", progress,
                           f"Checked {checked}/{port_count} services, found {total_vuln} CVEs")

    all_findings = sort_findings_by_severity(all_findings)
    summary = compute_severity_summary(all_findings)

    publish_progress(job_id, "saving", 85, "Saving results...")
    _save_findings(session, job_id, all_findings)

    _update_status(session, job_id, "completed", progress=100,
                   result_summary=summary, completed_at=datetime.now(UTC))
    session.commit()
    session.close()

    logger.info("IP scan complete: job={job_id} findings={total} critical={c} high={h} medium={m} low={l}",
                job_id=job_id, total=summary['total_findings'], c=summary['critical'], h=summary['high'],
                m=summary['medium'], l=summary['low'])
    publish_progress(job_id, "completed", 100,
                   f"Done: {summary['total_findings']} findings "
                   f"({summary['critical']}C/{summary['high']}H/{summary['medium']}M/{summary['low']}L)")

    try:
        r = redis.Redis.from_url(REDIS_URL)
        r.set("health:last_task_completed", time.time())
    except Exception:
        pass

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
