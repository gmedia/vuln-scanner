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
from utils.mobile_utils import analyze_apk, analyze_ipa
from utils.severity import compute_severity_summary, sort_findings_by_severity

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")


def publish_progress(job_id: str, step: str, progress: int, message: str):
    """Publish a progress update to the scan's Redis pubsub channel."""
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


@shared_task(bind=True, name="mobile_scan.run", max_retries=3)
def run_mobile_scan(self, job_id: str, file_path: str, platform: str):
    """Execute a full mobile scan: APK/IPA analysis, secret scanning, CVE lookup for embedded libraries."""
    logger.info("Mobile scan started: job={job_id} platform={platform} path={path}",
                job_id=job_id, platform=platform, path=file_path)
    session = get_sync_session()

    _update_status(session, job_id, "running", started_at=datetime.now(UTC))
    session.commit()

    if not os.path.exists(file_path):
        _update_status(session, job_id, "failed")
        session.commit()
        session.close()
        publish_progress(job_id, "failed", 100, f"File not found: {file_path}")
        return {"job_id": job_id, "error": "file not found"}

    try:
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        publish_progress(job_id, "extracting", 5, f"Analyzing file ({file_size_mb:.1f}MB)...")

        all_findings = []

        if platform == "android":
            publish_progress(job_id, "manifest", 15, "Parsing AndroidManifest.xml...")
            try:
                info, findings, libraries = analyze_apk(file_path)
                all_findings.extend(findings)
                publish_progress(job_id, "manifest_done", 30,
                               f"Package: {info.package_name}, {len(info.permissions)} permissions")
            except Exception as e:
                publish_progress(job_id, "manifest_error", 25, f"APK analysis warning: {str(e)[:100]}")

        elif platform == "ios":
            publish_progress(job_id, "plist", 15, "Parsing Info.plist...")
            try:
                info, findings, libraries = analyze_ipa(file_path)
                all_findings.extend(findings)
                publish_progress(job_id, "plist_done", 30,
                               f"Bundle: {info.bundle_id}, {len(info.ats_exceptions)} ATS exemptions")
            except Exception as e:
                publish_progress(job_id, "plist_error", 25, f"IPA analysis warning: {str(e)[:100]}")

        publish_progress(job_id, "secrets", 50, "Scanning for hardcoded secrets...")
        try:
            with open(file_path, "rb") as f:
                raw = f.read(5 * 1024 * 1024)
            text = raw.decode("utf-8", errors="replace")
            from utils.mobile_utils import _scan_secrets
            secret_findings = _scan_secrets(text)
            for sf in secret_findings:
                if sf not in all_findings:
                    all_findings.append(sf)
            publish_progress(job_id, "secrets_done", 65, f"Found {len(secret_findings)} potential secrets")
        except Exception as e:
            logger.warning("Secret scan failed for job {job_id}: {error}", job_id=job_id, error=e)
            publish_progress(job_id, "secrets_done", 65, "Secret scan skipped")

        publish_progress(job_id, "cve_lookup", 70, "Looking up CVEs for embedded libraries...")
        total_vuln = 0
        seen_libs = set()
        for lib in libraries:
            lib_name = lib.lstrip("lib").replace("_", "-").lower()
            if lib_name in seen_libs or len(lib_name) < 3:
                continue
            seen_libs.add(lib_name)
            try:
                vulns = _run_async(lookup_service_cves(lib_name, lib_name, ""))
            except Exception as e:
                logger.warning("CVE lookup failed for lib {lib}: {error}", lib=lib_name, error=e)
                vulns = []
            for vuln in vulns:
                cvss = extract_cvss(vuln)
                finding = format_vuln_finding(vuln, cvss)
                finding["description"] = (
                    f"[{platform}] Library: {lib}\n"
                    + (finding.get("description") or "")
                )
                all_findings.append(finding)
                total_vuln += 1

        all_findings = sort_findings_by_severity(all_findings)
        summary = compute_severity_summary(all_findings)

        publish_progress(job_id, "saving", 90, "Saving results...")
        _save_findings(session, job_id, all_findings)

        _update_status(session, job_id, "completed", progress=100,
                       result_summary=summary, completed_at=datetime.now(UTC))
        session.commit()
        session.close()

        logger.info("Mobile scan complete: job={job_id} platform={platform} findings={total} "
                    "critical={c} high={h} medium={m} low={l}",
                    job_id=job_id, platform=platform, total=summary['total_findings'], c=summary['critical'],
                    h=summary['high'], m=summary['medium'], l=summary['low'])
        publish_progress(job_id, "completed", 100,
                       f"Done: {summary['total_findings']} findings "
                       f"({summary['critical']}C/{summary['high']}H/{summary['medium']}M/{summary['low']}L)")

        try:
            os.remove(file_path)
        except Exception as e:
            logger.warning("Failed to remove mobile scan file {path}: {error}", path=file_path, error=e)

        try:
            r = redis.Redis.from_url(REDIS_URL)
            r.set("health:last_task_completed", time.time())
        except Exception as e:
            logger.warning("Failed to update Redis health timestamp for job {job_id}: {error}", job_id=job_id, error=e)

        return {"job_id": job_id, "summary": summary}
    except Exception as e:
        try:
            _update_status(session, job_id, "failed")
            session.commit()
            session.close()
        except Exception as e2:
            logger.warning("Failed to update status/commit for failed job {job_id}: {error}", job_id=job_id, error=e2)
        publish_progress(job_id, "failed", 100, f"Mobile scan failed: {str(e)[:200]}")
        if self.request.retries >= self.max_retries:
            dead_letter_handler.delay(
                task_name="mobile_scan.run",
                args=[job_id, file_path, platform],
                kwargs={},
                exception_info=str(e),
            )
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries)) from e


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
