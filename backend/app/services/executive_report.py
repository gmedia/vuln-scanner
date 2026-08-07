from __future__ import annotations

import html
from collections.abc import Sequence
from datetime import UTC, datetime

from app.schemas.scan import ScanDiffResponse, ScanFindingResponse, ScanJobDetailResponse
from app.services.baseline_diff import SEVERITY_RANK

_TOP_N = 5

_NEXT_STEPS_BAHASA = (
    "Prioritaskan temuan critical dan high: verifikasi di lingkungan Anda, "
    "terapkan remediasi yang disarankan tim teknis, lalu jalankan ulang scan "
    "untuk memastikan temuan baru berkurang. Untuk medium/low, jadwalkan "
    "perbaikan dalam siklus maintenance. Hindari membuka layanan sensitif ke "
    "internet tanpa kontrol akses. Detail teknis lengkap tersedia di export HTML/JSON."
)


def _fmt_dt(value: datetime | None) -> str:
    if value is None:
        return "—"
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


def _period_label(job: ScanJobDetailResponse) -> str:
    start = _fmt_dt(job.started_at)
    end = _fmt_dt(job.completed_at)
    if job.started_at is None and job.completed_at is None:
        return "Periode tidak tersedia"
    return f"{start} — {end}"


def top_critical_high_findings(
    findings: Sequence[ScanFindingResponse],
    limit: int = _TOP_N,
) -> list[ScanFindingResponse]:
    eligible = [f for f in findings if (f.severity or "").lower() in ("critical", "high")]
    eligible.sort(
        key=lambda f: (
            -SEVERITY_RANK.get((f.severity or "").lower(), 0),
            -(f.cvss_score or 0.0),
            (f.title or "").lower(),
        )
    )
    return eligible[:limit]


def plain_language_next_steps(
    job: ScanJobDetailResponse,
    diff: ScanDiffResponse | None,
) -> str:
    summary = job.result_summary or {}

    def _count(key: str) -> int:
        raw = summary.get(key, 0)
        if isinstance(raw, bool):
            return int(raw)
        if isinstance(raw, int):
            return raw
        if isinstance(raw, float):
            return int(raw)
        if isinstance(raw, str) and raw.strip().isdigit():
            return int(raw.strip())
        return 0

    critical = _count("critical")
    high = _count("high")
    new_ch = 0
    if diff is not None:
        new_ch = int(diff.new_critical or 0) + int(diff.new_high or 0)

    if critical + high == 0:
        return (
            "Tidak ada temuan critical/high pada scan ini. Pertahankan baseline keamanan, "
            "lanjutkan jadwal scan berkala, dan pantau perubahan konfigurasi. " + _NEXT_STEPS_BAHASA
        )
    if new_ch > 0:
        return f"Ada {new_ch} temuan critical/high baru dibanding scan sebelumnya. " + _NEXT_STEPS_BAHASA
    return f"Terdapat {critical} critical dan {high} high yang masih terbuka. " + _NEXT_STEPS_BAHASA


def _risk_counts_html(summary: dict[str, object]) -> str:
    keys = ("critical", "high", "medium", "low", "info")
    cells = []
    for key in keys:
        val = html.escape(str(summary.get(key, 0) or 0))
        cells.append(
            f'<div class="stat"><div class="n sev-{key}">{val}</div>'
            f'<div class="l">{html.escape(key.capitalize())}</div></div>'
        )
    total = html.escape(str(summary.get("total_findings", 0) or 0))
    cells.insert(
        0,
        f'<div class="stat"><div class="n">{total}</div><div class="l">Total</div></div>',
    )
    return "".join(cells)


def _diff_section_html(diff: ScanDiffResponse | None) -> str:
    if diff is None or diff.compared_to_job_id is None:
        return (
            '<section id="whats-new">'
            "<h2>Apa yang baru</h2>"
            "<p>Belum ada scan sebelumnya pada target yang sama untuk dibandingkan "
            "(baseline pertama).</p>"
            "</section>"
        )
    compared = html.escape(str(diff.compared_to_job_id))
    return f"""<section id="whats-new">
<h2>Apa yang baru</h2>
<p class="muted">Dibandingkan dengan job <code>{compared}</code></p>
<table class="diff">
<tr><th>Metrik</th><th>Jumlah</th></tr>
<tr><td>Temuan critical baru</td><td>{int(diff.new_critical)}</td></tr>
<tr><td>Temuan high baru</td><td>{int(diff.new_high)}</td></tr>
<tr><td>Terselesaikan</td><td>{int(diff.resolved)}</td></tr>
<tr><td>Memburuk (severity naik)</td><td>{int(diff.worsened)}</td></tr>
<tr><td>Tidak berubah</td><td>{int(diff.unchanged)}</td></tr>
</table>
</section>"""


def _top_findings_html(findings: Sequence[ScanFindingResponse]) -> str:
    if not findings:
        return (
            '<section id="top-findings">'
            "<h2>Top temuan critical / high</h2>"
            "<p>Tidak ada temuan critical atau high.</p>"
            "</section>"
        )
    rows = []
    for f in findings:
        sev = html.escape((f.severity or "").lower())
        title = html.escape((f.title or "")[:120])
        cat = html.escape(f.category or "—")
        cve = html.escape(f.cve_id or "—")
        rem = html.escape((f.remediation or "Koordinasikan dengan tim teknis.")[:200])
        rows.append(
            f'<tr class="sev-{sev}">'
            f'<td><span class="badge badge-{sev}">{sev.upper()}</span></td>'
            f"<td>{title}</td><td>{cat}</td><td>{cve}</td><td>{rem}</td></tr>"
        )
    body = "\n".join(rows)
    return f"""<section id="top-findings">
<h2>Top temuan critical / high</h2>
<table>
<tr><th>Severity</th><th>Judul</th><th>Kategori</th><th>CVE</th><th>Arah remediasi</th></tr>
{body}
</table>
</section>"""


def render_executive_html(
    job: ScanJobDetailResponse,
    *,
    diff: ScanDiffResponse | None = None,
    account_email: str | None = None,
) -> str:
    summary = dict(job.result_summary or {})
    top = top_critical_high_findings(job.findings)
    next_steps = plain_language_next_steps(job, diff)
    email_line = ""
    if account_email:
        email_line = f"<p><strong>Akun:</strong> {html.escape(account_email)}</p>"

    target = html.escape(job.target or "")
    scan_type = html.escape(job.scan_type or "")
    status = html.escape(job.status or "")
    period = html.escape(_period_label(job))
    exported = html.escape(datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC"))
    job_id = html.escape(str(job.id))

    return f"""<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<title>Laporan Eksekutif Sinexis Scan — {target}</title>
<style>
body {{ font-family: -apple-system, system-ui, sans-serif; background: #f8fafc; color: #0f172a;
  padding: 40px; max-width: 960px; margin: 0 auto; line-height: 1.5; }}
h1 {{ color: #0f766e; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }}
h2 {{ color: #0f766e; margin-top: 28px; }}
.cover {{ background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; }}
.stats {{ display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }}
.stat {{ background: #f1f5f9; border-radius: 8px; padding: 12px 16px; min-width: 88px; text-align: center; }}
.stat .n {{ font-size: 22px; font-weight: 700; }}
.stat .l {{ font-size: 12px; color: #64748b; text-transform: uppercase; }}
.sev-critical {{ color: #dc2626; }} .sev-high {{ color: #ea580c; }}
.sev-medium {{ color: #ca8a04; }} .sev-low {{ color: #2563eb; }} .sev-info {{ color: #64748b; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 10px; background: #fff; }}
th {{ background: #0f766e; color: #fff; padding: 10px; text-align: left; font-size: 13px; }}
td {{ padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: top; }}
.badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 600; color: #fff; }}
.badge-critical {{ background: #dc2626; }}
.badge-high {{ background: #ea580c; }}
.badge-medium {{ background: #ca8a04; }}
.badge-low {{ background: #2563eb; }}
.badge-info {{ background: #64748b; }}
.muted {{ color: #64748b; font-size: 13px; }}
.next {{ background: #ecfdf5; border-left: 4px solid #0f766e; padding: 14px 16px; margin-top: 12px; }}
.footer {{ margin-top: 40px; text-align: center; color: #94a3b8; font-size: 12px; }}
code {{ font-size: 12px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }}
</style></head><body>
<header class="cover" id="cover">
<h1>Laporan Eksekutif — Sinexis Scan</h1>
<p><strong>Target:</strong> {target}</p>
<p><strong>Jenis scan:</strong> {scan_type}</p>
<p><strong>Status:</strong> {status}</p>
<p><strong>Periode:</strong> {period}</p>
<p><strong>Job ID:</strong> <code>{job_id}</code></p>
{email_line}
<p class="muted">Diekspor: {exported}</p>
<div class="stats" id="risk-counts">
{_risk_counts_html(summary)}
</div>
</header>
{_diff_section_html(diff)}
{_top_findings_html(top)}
<section id="next-steps">
<h2>Langkah selanjutnya</h2>
<div class="next"><p>{html.escape(next_steps)}</p></div>
</section>
<div class="footer">Dibuat oleh Sinexis Scan · ringkasan manajemen (bukan exploit guide)</div>
</body></html>"""
