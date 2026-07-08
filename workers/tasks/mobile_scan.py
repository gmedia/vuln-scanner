import asyncio
import json
import os
import plistlib
import time
import uuid
import zipfile
from datetime import UTC, datetime
from typing import Any

import redis
from celery import shared_task
from celery.exceptions import Retry
from loguru import logger
from sqlalchemy import update

from tasks.dead_letter import dead_letter_handler
from utils.cve_lookup import extract_cvss, format_vuln_finding, lookup_service_cves
from utils.database import get_sync_session
from utils.mobile_utils import analyze_apk, analyze_ipa
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
    except (redis.RedisError, TypeError, ValueError) as e:
        logger.warning("Redis publish failed for job {job_id} step {step}: {error}", job_id=job_id, step=step, error=e)


def _run_async(coro: Any) -> Any:
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@shared_task(bind=True, name="mobile_scan.run", max_retries=3)  # type: ignore
def run_mobile_scan(self: Any, job_id: str, file_path: str, platform: str) -> TaskResult:
    """Execute a full mobile scan: APK/IPA analysis, secret scanning, CVE lookup for embedded libraries."""
    logger.info(
        "Mobile scan started: job={job_id} platform={platform} path={path}",
        job_id=job_id,
        platform=platform,
        path=file_path,
    )
    session = get_sync_session()

    try:
        _update_status(session, job_id, "running", started_at=datetime.now(UTC))
        session.commit()

        if not os.path.exists(file_path):
            _update_status(session, job_id, "failed")
            _refund_credits(session, job_id, platform)
            session.commit()
            session.close()
            publish_progress(job_id, "failed", 100, f"File not found: {file_path}")
            logger.error(
                "Mobile scan file not found: job={job_id} path={path} retry={retry}",
                job_id=job_id,
                path=file_path,
                retry=self.request.retries,
            )
            if self.request.retries >= self.max_retries:
                dead_letter_handler.delay(
                    task_name="mobile_scan.run",
                    args=[job_id, file_path, platform],
                    kwargs={},
                    exception_info=f"File not found: {file_path}",
                )
                return {
                    "job_id": job_id,
                    "summary": {
                        "total_findings": 0,
                        "critical": 0,
                        "high": 0,
                        "medium": 0,
                        "low": 0,
                        "info": 0,
                    },
                    "error": "file not found",
                }
            raise self.retry(countdown=60 * (2**self.request.retries))

        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        publish_progress(job_id, "extracting", 5, f"Analyzing file ({file_size_mb:.1f}MB)...")

        all_findings = []

        if platform == "android":
            publish_progress(job_id, "manifest", 15, "Parsing AndroidManifest.xml...")
            try:
                apk_info, findings, libraries = analyze_apk(file_path)
                all_findings.extend(findings)
                publish_progress(
                    job_id,
                    "manifest_done",
                    30,
                    f"Package: {apk_info.package_name}, {len(apk_info.permissions)} permissions",
                )
            except (OSError, zipfile.BadZipFile, ValueError) as e:
                publish_progress(job_id, "manifest_error", 25, f"APK analysis warning: {str(e)[:100]}")

        elif platform == "ios":
            publish_progress(job_id, "plist", 15, "Parsing Info.plist...")
            try:
                ipa_info, findings, libraries = analyze_ipa(file_path)
                all_findings.extend(findings)
                publish_progress(
                    job_id,
                    "plist_done",
                    30,
                    f"Bundle: {ipa_info.bundle_id}, {len(ipa_info.ats_exceptions)} ATS exemptions",
                )
            except (OSError, zipfile.BadZipFile, ValueError, plistlib.InvalidFileException) as e:
                publish_progress(job_id, "plist_error", 25, f"IPA analysis warning: {str(e)[:100]}")

        else:
            libraries = []

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
        except (OSError, UnicodeDecodeError, ValueError) as e:
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
            except (TimeoutError, OSError, RuntimeError) as e:
                logger.warning("CVE lookup failed for lib {lib}: {error}", lib=lib_name, error=e)
                vulns = []
            for vuln in vulns:
                cvss = extract_cvss(vuln)
                finding = format_vuln_finding(vuln, cvss)
                finding["description"] = f"[{platform}] Library: {lib}\n" + (finding.get("description") or "")
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
            "Mobile scan complete: job={job_id} platform={platform} findings={total} "
            "critical={c} high={h} medium={m} low={l}",
            job_id=job_id,
            platform=platform,
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
            os.remove(file_path)
        except OSError as e:
            logger.warning("Failed to remove mobile scan file {path}: {error}", path=file_path, error=e)

        try:
            r = redis.Redis(connection_pool=get_redis_pool())
            r.set("health:last_task_completed", time.time())
        except redis.RedisError as e:
            logger.warning("Failed to update Redis health timestamp for job {job_id}: {error}", job_id=job_id, error=e)

        return {"job_id": job_id, "summary": summary}
    except Retry:
        raise
    except Exception as e:  # Broad catch at task top-level — inner exceptions already handled
        try:
            _update_status(session, job_id, "failed")
            _refund_credits(session, job_id, platform)
            session.commit()
            session.close()
        except (OSError, redis.RedisError) as e2:
            logger.warning("Failed to update status/commit for failed job {job_id}: {error}", job_id=job_id, error=e2)
        publish_progress(job_id, "failed", 100, f"Mobile scan failed: {str(e)[:200]}")
        if self.request.retries >= self.max_retries:
            dead_letter_handler.delay(
                task_name="mobile_scan.run",
                args=[job_id, file_path, platform],
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
        cve_id_raw = f.get("cve_id", "")
        finding = ScanFinding(
            id=uuid.uuid4(),
            job_id=job_id,
            severity=f.get("severity", "info"),
            category=f.get("category", ""),
            title=f.get("title", "")[:500],
            description=f.get("description", "")[:2000],
            cve_id=cve_id_raw[:20] if cve_id_raw else None,
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
