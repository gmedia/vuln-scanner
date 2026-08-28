import contextlib
import html
import os
from datetime import UTC, datetime

from celery.exceptions import CeleryError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.scan_job import ScanJob
from app.models.user import User
from app.schemas.scan import (
    DomainScanRequest,
    PaginatedFindingsResponse,
    PaginatedResponse,
    ScanDiffResponse,
    ScanFindingResponse,
    ScanJobDetailResponse,
    ScanJobResponse,
    ScanRequest,
)
from app.services.auth import get_active_org_id, get_current_user
from app.services.baseline_diff import get_scan_diff
from app.services.executive_report import render_executive_html
from app.services.scanner import ScannerService

MOBILE_UPLOAD_MAX_SIZE = 500 * 1024 * 1024  # 500 MB

router = APIRouter(tags=["scans"])

scan_submit_limiter = RateLimiter(
    max_requests=settings.scan_submit_limit,
    window_seconds=settings.scan_submit_window,
    prefix="ratelimit:scan_submit",
)


def _export_json(job: ScanJobDetailResponse) -> dict[str, object]:
    return {
        "job_id": str(job.id),
        "scan_type": job.scan_type,
        "target": job.target,
        "status": job.status,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "duration_seconds": (job.completed_at - job.started_at).total_seconds()
        if job.started_at and job.completed_at
        else None,
        "summary": job.result_summary,
        "findings": [
            {
                "severity": f.severity,
                "category": f.category,
                "title": f.title,
                "description": f.description,
                "cve_id": f.cve_id,
                "cvss_score": f.cvss_score,
                "remediation": f.remediation,
                "impact": f.impact,
                "attacker_benefit": f.attacker_benefit,
                "raw_data": f.raw_data,
            }
            for f in job.findings
        ],
        "exported_at": datetime.now(UTC).isoformat(),
    }


SEVERITY_COLOR_MAP = {
    "critical": "#dc2626",
    "high": "#f97316",
    "medium": "#eab308",
    "low": "#3b82f6",
    "info": "#6b7280",
}
SEVERITY_ICON_MAP = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🔵", "info": "⚪"}

PDF_TEMPLATE = (
    """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vulnerability Scan Report</title>
<style>
:root {{
  --background: hsl(0 0% 98%);
  --foreground: hsl(0 0% 7%);
  --muted: hsl(0 0% 96%);
  --muted-foreground: hsl(0 0% 45%);
  --border: hsl(0 0% 90%);
  --primary: hsl(142 71% 45%);
  --primary-foreground: hsl(0 0% 4%);
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 2rem 1.25rem; max-width: 72rem; margin-inline: auto;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--foreground); background: var(--background); line-height: 1.5;
}}
.brand {{
  display: inline-flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem;
  text-decoration: none; color: var(--foreground);
}}
.brand svg {{ width: 1.25rem; height: 1.25rem; color: var(--primary); flex-shrink: 0; }}
.brand-text {{
  font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
  font-size: 0.875rem; font-weight: 700; letter-spacing: 0.08em;
}}
.brand-accent {{ color: var(--primary); }}
.cover {{
  background: #fff; border: 1px solid var(--border); border-radius: 0.5rem;
  padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;
}}
h1 {{
  margin: 0 0 0.75rem; font-size: 1.375rem; font-weight: 650; letter-spacing: -0.02em;
  color: var(--foreground); border-bottom: 1px solid var(--border); padding-bottom: 0.75rem;
}}
h2 {{
  margin: 1.5rem 0 0.5rem; font-size: 1.05rem; font-weight: 650; color: var(--foreground);
}}
.meta p {{ margin: 0.25rem 0; color: var(--muted-foreground); font-size: 0.875rem; }}
.meta strong {{ color: var(--foreground); font-weight: 600; }}
.kpis {{
  display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem;
}}
.kpi {{
  background: var(--muted); border: 1px solid var(--border); border-radius: 0.5rem;
  padding: 0.75rem 1rem; min-width: 5.5rem; text-align: center;
}}
.kpi .n {{ font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }}
.kpi .l {{
  font-size: 0.6875rem; color: var(--muted-foreground); text-transform: uppercase;
  letter-spacing: 0.04em;
}}
.kpi .n.sev-critical {{ color: #dc2626; }}
.kpi .n.sev-high {{ color: #f97316; }}
.kpi .n.sev-medium {{ color: #ca8a04; }}
.kpi .n.sev-low {{ color: #3b82f6; }}
.kpi .n.sev-info {{ color: #6b7280; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 0.5rem; background: #fff; }}
th {{
  background: var(--muted); color: var(--foreground); padding: 0.625rem 0.75rem;
  text-align: left; font-size: 0.75rem; font-weight: 650; border-bottom: 1px solid var(--border);
}}
td {{
  padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.875rem;
  vertical-align: top;
}}
.sev-critical {{ border-left: 4px solid #dc2626; }}
.sev-high {{ border-left: 4px solid #f97316; }}
.sev-medium {{ border-left: 4px solid #eab308; }}
.sev-low {{ border-left: 4px solid #3b82f6; }}
.sev-info {{ border-left: 4px solid #6b7280; }}
.badge {{
  display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;
}}
.badge-critical {{ background: #dc2626; color: #fff; }}
.badge-high {{ background: #f97316; color: #fff; }}
.badge-medium {{ background: #eab308; color: #000; }}
.badge-low {{ background: #3b82f6; color: #fff; }}
.badge-info {{ background: #6b7280; color: #fff; }}
.finding-row {{ margin: 5px 0; }}
.findings-array {{ margin: 20px 0; }}
.footer {{
  margin-top: 2.5rem; text-align: center; color: var(--muted-foreground); font-size: 12px;
  border-top: 1px solid var(--border); padding-top: 1rem;
}}
@media print {{
  body {{ padding: 0; max-width: none; }}
  .cover {{ break-inside: avoid; }}
}}
</style></head><body>
<a class="brand" href="https://sinexis.app">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
</svg>
<span class="brand-text">SINE<span class="brand-accent">XIS</span></span>
</a>
<div class="cover">
<h1>Vulnerability Scan Report</h1>
<div class="meta">
<p><strong>Target:</strong> {target}</p>
<p><strong>Scan Type:</strong> {scan_type}</p>
<p><strong>Status:</strong> {status}</p>
<p><strong>Duration:</strong> {duration}</p>
"""
    + (
        "<p><strong>Findings:</strong> {total_findings} total "
        "({critical} critical, {high} high, {medium} medium, {low} low, {info} info)</p>\n"
    )
    + """<p><strong>Exported:</strong> {exported_at}</p>
</div>
<div class="kpis">
<div class="kpi"><div class="n">{total_findings}</div><div class="l">Total</div></div>
<div class="kpi"><div class="n sev-critical">{critical}</div><div class="l">Critical</div></div>
<div class="kpi"><div class="n sev-high">{high}</div><div class="l">High</div></div>
<div class="kpi"><div class="n sev-medium">{medium}</div><div class="l">Medium</div></div>
<div class="kpi"><div class="n sev-low">{low}</div><div class="l">Low</div></div>
<div class="kpi"><div class="n sev-info">{info}</div><div class="l">Info</div></div>
</div>
</div>

<h2>Findings</h2>
<table>
<tr><th>Severity</th><th>Category</th><th>Title</th><th>CVE</th><th>CVSS</th></tr>
{findings_rows}
</table>

<div class="footer">Generated by Vuln Scanner</div>
</body></html>"""
)


def _render_pdf_html(job: ScanJobDetailResponse) -> str:
    summary = job.result_summary or {}
    findings_rows = ""
    for f in job.findings:
        sev_class = f"sev-{f.severity}" if f.severity in ("critical", "high", "medium", "low", "info") else ""
        findings_rows += f"""
<tr class="{sev_class}">
  <td><span class="badge badge-{f.severity}">{html.escape(f.severity.upper() if f.severity else "")}</span></td>
  <td>{html.escape(f.category or "")}</td>
  <td>{html.escape((f.title or "")[:100])}</td>
  <td>{html.escape(f.cve_id or "")}</td>
  <td>{html.escape(str(f.cvss_score) if f.cvss_score is not None else "")}</td>
</tr>"""

    return PDF_TEMPLATE.format(
        target=html.escape(job.target or ""),
        scan_type=html.escape(job.scan_type or ""),
        status=html.escape(job.status or ""),
        duration=f"{(job.completed_at - job.started_at).total_seconds():.0f}s"
        if job.started_at and job.completed_at
        else "N/A",
        total_findings=html.escape(str(summary.get("total_findings", 0))),
        critical=html.escape(str(summary.get("critical", 0))),
        high=html.escape(str(summary.get("high", 0))),
        medium=html.escape(str(summary.get("medium", 0))),
        low=html.escape(str(summary.get("low", 0))),
        info=html.escape(str(summary.get("info", 0))),
        exported_at=datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC"),
        findings_rows=findings_rows,
    )


@router.post("/scan/ip", response_model=ScanJobResponse, status_code=202)
async def start_ip_scan(
    request: Request,
    req: ScanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanJob | JSONResponse:
    limit_response = await scan_submit_limiter(request)
    if limit_response:
        return limit_response
    svc = ScannerService(db)
    job = await svc.start_scan(
        user=current_user,
        scan_type="ip",
        target=req.target,
        ports=req.ports,
        organization_id=get_active_org_id(request),
    )
    return job


@router.post("/scan/domain", response_model=ScanJobResponse, status_code=202)
async def start_domain_scan(
    request: Request,
    req: DomainScanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanJob | JSONResponse:
    limit_response = await scan_submit_limiter(request)
    if limit_response:
        return limit_response
    svc = ScannerService(db)
    job = await svc.start_scan(
        user=current_user,
        scan_type="domain",
        target=req.domain,
        organization_id=get_active_org_id(request),
    )
    return job


@router.post("/scan/mobile", response_model=ScanJobResponse, status_code=202)
async def start_mobile_scan(
    request: Request,
    file: UploadFile = File(...),
    platform: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanJob | JSONResponse:
    limit_response = await scan_submit_limiter(request)
    if limit_response:
        return limit_response
    if platform not in ("android", "ios"):
        raise HTTPException(status_code=400, detail="platform must be 'android' or 'ios'")

    # Validate file before reading: filename length, magic bytes, size limit
    if not file.filename:
        raise HTTPException(status_code=400, detail="File must have a filename")
    if len(file.filename) > 255:
        raise HTTPException(status_code=400, detail="Filename too long")

    header = await file.read(4)
    await file.seek(0)
    if header[:2] != b"PK":
        raise HTTPException(status_code=400, detail="File must be a valid ZIP archive (APK/AAB/IPA)")

    safe_name = os.path.basename(file.filename)
    if not safe_name or safe_name in (".", ".."):
        raise HTTPException(status_code=400, detail="File must have a filename")

    lower_name = safe_name.lower()
    if platform == "android" and not (lower_name.endswith(".apk") or lower_name.endswith(".aab")):
        raise HTTPException(status_code=400, detail="Android uploads must use .apk or .aab extension")
    if platform == "ios" and not lower_name.endswith(".ipa"):
        raise HTTPException(status_code=400, detail="iOS uploads must use .ipa extension")

    os.makedirs(settings.upload_dir, exist_ok=True)
    staging_path = os.path.join(settings.upload_dir, f"{os.urandom(8).hex()}_{safe_name}")

    max_size = MOBILE_UPLOAD_MAX_SIZE
    total = 0
    with open(staging_path, "wb") as buffer:
        while chunk := await file.read(8192):
            total += len(chunk)
            if total > max_size:
                buffer.close()
                os.unlink(staging_path)
                raise HTTPException(status_code=413, detail="File exceeds 500 MB limit")
            buffer.write(chunk)

    storage_ref = staging_path
    try:
        from app.services.object_storage import (
            ObjectStorageError,
            build_object_key,
            get_object_storage,
        )

        storage = get_object_storage()
        object_key = build_object_key(safe_name)
        storage_ref = storage.put_file(staging_path, object_key)
        if storage_ref != staging_path:
            with contextlib.suppress(OSError):
                os.remove(staging_path)

        scan_type = "apk" if platform == "android" else "ipa"
        svc = ScannerService(db)
        job = await svc.start_scan(
            user=current_user,
            scan_type=scan_type,
            target=safe_name,
            platform=platform,
            file_path=storage_ref,
            organization_id=get_active_org_id(request),
        )
        return job
    except ObjectStorageError as e:
        with contextlib.suppress(Exception):
            os.remove(staging_path)
        raise HTTPException(status_code=502, detail=f"Object storage error: {e}") from e
    except (HTTPException, OSError, CeleryError):
        with contextlib.suppress(Exception):
            if os.path.isfile(staging_path):
                os.remove(staging_path)
            if storage_ref != staging_path:
                try:
                    from app.services.object_storage import get_object_storage

                    get_object_storage().delete(storage_ref)
                except Exception:
                    pass
        raise


@router.get("/scan/history", response_model=PaginatedResponse)
async def get_scan_history(
    request: Request,
    page: int = 1,
    limit: int = 20,
    scan_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse:
    """List scan jobs with pagination. Optionally filter by scan type."""
    svc = ScannerService(db)
    return await svc.get_history(
        page=page,
        limit=limit,
        scan_type=scan_type,
        user_id=current_user.id,
        organization_id=get_active_org_id(request),
    )


@router.get("/scan/{job_id}", response_model=ScanJobDetailResponse)
async def get_scan(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanJobDetailResponse:
    """Retrieve a single scan job with all findings by job ID."""
    svc = ScannerService(db)
    job = await svc.get_job(job_id, user_id=current_user.id)
    if not job:
        raise HTTPException(status_code=404, detail="Scan job not found")
    return job


@router.get("/scan/{job_id}/findings/{finding_id}", response_model=ScanFindingResponse)
async def get_scan_finding(
    job_id: str,
    finding_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanFindingResponse:
    svc = ScannerService(db)
    return await svc.get_finding(job_id, finding_id, user_id=current_user.id)


@router.get("/scan/{job_id}/findings", response_model=PaginatedFindingsResponse)
async def get_scan_findings(
    job_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedFindingsResponse:
    svc = ScannerService(db)
    return await svc.get_findings(job_id, user_id=current_user.id, page=page, limit=limit)


@router.get("/scan/{job_id}/diff", response_model=ScanDiffResponse)
async def get_scan_baseline_diff(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanDiffResponse:
    """Compare findings vs prior completed job on same user/type/target."""
    return await get_scan_diff(db, job_id, user_id=current_user.id)


@router.get(
    "/scan/{job_id}/export",
    response_model=None,
    responses={200: {"content": {"application/json": {}, "text/html": {}}}},
)
async def export_scan(
    job_id: str,
    format: str = Query(default="json"),
    lang: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse | HTMLResponse:
    svc = ScannerService(db)
    job = await svc.get_job(job_id, user_id=current_user.id, include_raw=True)
    if not job:
        raise HTTPException(status_code=404, detail="Scan job not found")

    if format == "json":
        result = _export_json(job)
        return JSONResponse(
            content=result,
            headers={
                "Content-Disposition": f'attachment; filename="scan_{job_id}.json"',
                "Content-Type": "application/octet-stream",
            },
        )

    if format == "html":
        return HTMLResponse(content=_render_pdf_html(job))

    if format == "executive":
        diff: ScanDiffResponse | None = None
        if job.status == "completed":
            diff = await get_scan_diff(db, job_id, user_id=current_user.id)
        body = render_executive_html(
            job,
            diff=diff,
            account_email=getattr(current_user, "email", None),
            lang=lang,
        )
        return HTMLResponse(
            content=body,
            headers={
                "Content-Disposition": f'attachment; filename="scan_{job_id}_executive.html"',
            },
        )

    raise HTTPException(
        status_code=400,
        detail="format must be 'json', 'html', or 'executive'",
    )
