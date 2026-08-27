from __future__ import annotations

import html
from collections.abc import Sequence
from datetime import UTC, datetime

from app.i18n import AppLocale, normalize_lang, t
from app.schemas.scan import ScanDiffResponse, ScanFindingResponse, ScanJobDetailResponse
from app.services.baseline_diff import SEVERITY_RANK

_TOP_N = 5


def _fmt_dt(value: datetime | None) -> str:
    if value is None:
        return "—"
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


def _period_label(job: ScanJobDetailResponse, locale: AppLocale) -> str:
    start = _fmt_dt(job.started_at)
    end = _fmt_dt(job.completed_at)
    if job.started_at is None and job.completed_at is None:
        return t(locale, "executive", "period_unavailable")
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
    *,
    lang: str | None = None,
) -> str:
    locale = normalize_lang(lang)
    tail = t(locale, "executive", "next_tail")
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
        return t(locale, "executive", "next_none", tail=tail)
    if new_ch > 0:
        return t(locale, "executive", "next_new", n=new_ch, tail=tail)
    return t(locale, "executive", "next_open", critical=critical, high=high, tail=tail)


def _risk_counts_html(summary: dict[str, object], locale: AppLocale) -> str:
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
        f'<div class="stat"><div class="n">{total}</div>'
        f'<div class="l">{html.escape(t(locale, "executive", "stat_total"))}</div></div>',
    )
    return "".join(cells)


def _diff_section_html(diff: ScanDiffResponse | None, locale: AppLocale) -> str:
    if diff is None or diff.compared_to_job_id is None:
        return (
            '<section id="whats-new">'
            f"<h2>{html.escape(t(locale, 'executive', 'whats_new'))}</h2>"
            f"<p>{html.escape(t(locale, 'executive', 'no_baseline'))}</p>"
            "</section>"
        )
    compared = html.escape(str(diff.compared_to_job_id))
    return f"""<section id="whats-new">
<h2>{html.escape(t(locale, "executive", "whats_new"))}</h2>
<p class="muted">{html.escape(t(locale, "executive", "compared_to"))} <code>{compared}</code></p>
<table class="diff">
<tr><th>{html.escape(t(locale, "executive", "metric"))}</th><th>{html.escape(t(locale, "executive", "count"))}</th></tr>
<tr><td>{html.escape(t(locale, "executive", "new_critical"))}</td><td>{int(diff.new_critical)}</td></tr>
<tr><td>{html.escape(t(locale, "executive", "new_high"))}</td><td>{int(diff.new_high)}</td></tr>
<tr><td>{html.escape(t(locale, "executive", "resolved"))}</td><td>{int(diff.resolved)}</td></tr>
<tr><td>{html.escape(t(locale, "executive", "worsened"))}</td><td>{int(diff.worsened)}</td></tr>
<tr><td>{html.escape(t(locale, "executive", "unchanged"))}</td><td>{int(diff.unchanged)}</td></tr>
</table>
</section>"""


def _top_findings_html(findings: Sequence[ScanFindingResponse], locale: AppLocale) -> str:
    if not findings:
        return (
            '<section id="top-findings">'
            f"<h2>{html.escape(t(locale, 'executive', 'top_findings'))}</h2>"
            f"<p>{html.escape(t(locale, 'executive', 'no_top'))}</p>"
            "</section>"
        )
    default_rem = t(locale, "executive", "default_remediation")
    rows = []
    for f in findings:
        sev = html.escape((f.severity or "").lower())
        title = html.escape((f.title or "")[:120])
        cat = html.escape(f.category or "—")
        cve = html.escape(f.cve_id or "—")
        rem = html.escape((f.remediation or default_rem)[:200])
        rows.append(
            f'<tr class="sev-{sev}">'
            f'<td><span class="badge badge-{sev}">{sev.upper()}</span></td>'
            f"<td>{title}</td><td>{cat}</td><td>{cve}</td><td>{rem}</td></tr>"
        )
    body = "\n".join(rows)
    headers = "".join(
        f"<th>{html.escape(t(locale, 'executive', key))}</th>"
        for key in (
            "col_severity",
            "col_title",
            "col_category",
            "col_cve",
            "col_remediation",
        )
    )
    return f"""<section id="top-findings">
<h2>{html.escape(t(locale, "executive", "top_findings"))}</h2>
<table>
<tr>{headers}</tr>
{body}
</table>
</section>"""


def render_executive_html(
    job: ScanJobDetailResponse,
    *,
    diff: ScanDiffResponse | None = None,
    account_email: str | None = None,
    lang: str | None = None,
) -> str:
    locale = normalize_lang(lang)
    summary = dict(job.result_summary or {})
    top = top_critical_high_findings(job.findings)
    next_steps = plain_language_next_steps(job, diff, lang=locale)
    email_line = ""
    if account_email:
        email_line = (
            f"<p><strong>{html.escape(t(locale, 'executive', 'label_account'))}</strong> "
            f"{html.escape(account_email)}</p>"
        )

    target = html.escape(job.target or "")
    scan_type = html.escape(job.scan_type or "")
    status = html.escape(job.status or "")
    period = html.escape(_period_label(job, locale))
    exported = html.escape(datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC"))
    job_id = html.escape(str(job.id))
    html_lang = html.escape(t(locale, "executive", "html_lang"))
    page_title = html.escape(t(locale, "executive", "title", target=job.target or ""))

    return f"""<!DOCTYPE html>
<html lang="{html_lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{page_title}</title>
<style>
:root {{
  --background: hsl(0 0% 98%);
  --foreground: hsl(0 0% 7%);
  --muted: hsl(0 0% 96%);
  --muted-foreground: hsl(0 0% 45%);
  --border: hsl(0 0% 90%);
  --primary: hsl(142 71% 45%);
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 2rem 1.25rem; max-width: 60rem; margin-inline: auto;
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
h1 {{
  margin: 0 0 0.75rem; font-size: 1.375rem; font-weight: 650; letter-spacing: -0.02em;
  color: var(--foreground); border-bottom: 1px solid var(--border); padding-bottom: 0.75rem;
}}
h2 {{
  margin: 1.75rem 0 0.5rem; font-size: 1.05rem; font-weight: 650; color: var(--foreground);
}}
.cover {{
  background: #fff; border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem 1.5rem;
}}
.cover p {{ margin: 0.25rem 0; font-size: 0.875rem; }}
.stats {{ display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }}
.stat {{
  background: var(--muted); border: 1px solid var(--border); border-radius: 0.5rem;
  padding: 0.75rem 1rem; min-width: 5.5rem; text-align: center;
}}
.stat .n {{ font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }}
.stat .l {{
  font-size: 0.6875rem; color: var(--muted-foreground); text-transform: uppercase;
  letter-spacing: 0.04em;
}}
.sev-critical {{ color: #dc2626; }} .sev-high {{ color: #ea580c; }}
.sev-medium {{ color: #ca8a04; }} .sev-low {{ color: #2563eb; }} .sev-info {{ color: #64748b; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 0.5rem; background: #fff; }}
th {{
  background: var(--muted); color: var(--foreground); padding: 0.625rem 0.75rem;
  text-align: left; font-size: 0.8125rem; font-weight: 650; border-bottom: 1px solid var(--border);
}}
td {{
  padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.875rem;
  vertical-align: top;
}}
.badge {{
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 600; color: #fff;
}}
.badge-critical {{ background: #dc2626; }}
.badge-high {{ background: #ea580c; }}
.badge-medium {{ background: #ca8a04; }}
.badge-low {{ background: #2563eb; }}
.badge-info {{ background: #64748b; }}
.muted {{ color: var(--muted-foreground); font-size: 13px; }}
.next {{
  background: hsl(142 40% 96%); border-left: 4px solid var(--primary);
  padding: 0.875rem 1rem; margin-top: 0.75rem;
}}
.footer {{
  margin-top: 2.5rem; text-align: center; color: var(--muted-foreground); font-size: 12px;
  border-top: 1px solid var(--border); padding-top: 1rem;
}}
code {{ font-size: 12px; background: var(--muted); padding: 1px 4px; border-radius: 3px; }}
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
<header class="cover" id="cover">
<h1>{html.escape(t(locale, "executive", "h1"))}</h1>
<p><strong>{html.escape(t(locale, "executive", "label_target"))}</strong> {target}</p>
<p><strong>{html.escape(t(locale, "executive", "label_scan_type"))}</strong> {scan_type}</p>
<p><strong>{html.escape(t(locale, "executive", "label_status"))}</strong> {status}</p>
<p><strong>{html.escape(t(locale, "executive", "label_period"))}</strong> {period}</p>
<p><strong>{html.escape(t(locale, "executive", "label_job_id"))}</strong> <code>{job_id}</code></p>
{email_line}
<p class="muted">{html.escape(t(locale, "executive", "exported", exported=exported))}</p>
<div class="stats" id="risk-counts">
{_risk_counts_html(summary, locale)}
</div>
</header>
{_diff_section_html(diff, locale)}
{_top_findings_html(top, locale)}
<section id="next-steps">
<h2>{html.escape(t(locale, "executive", "next_steps"))}</h2>
<div class="next"><p>{html.escape(next_steps)}</p></div>
</section>
<div class="footer">{html.escape(t(locale, "executive", "footer"))}</div>
</body></html>"""
