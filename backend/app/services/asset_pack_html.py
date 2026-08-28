from __future__ import annotations

import html
from datetime import UTC, datetime

from app.i18n import AppLocale, normalize_lang, t
from app.schemas.asset import AssetPackResponse


def render_asset_pack_html(pack: AssetPackResponse, *, lang: str | None = None) -> str:
    locale: AppLocale = normalize_lang(lang)
    exported = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
    html_lang = html.escape(t(locale, "asset_pack", "html_lang"))
    page_title = html.escape(t(locale, "asset_pack", "title"))
    sku = html.escape(pack.sku or "—")
    org_id = html.escape(str(pack.organization_id))
    count = html.escape(str(pack.count))
    limit = html.escape(str(pack.sku_limit))

    if not pack.assets:
        table_body = f'<p class="muted">{html.escape(t(locale, "asset_pack", "empty"))}</p>'
    else:
        rows = []
        for item in pack.assets:
            sched = t(locale, "asset_pack", "scheduled") if item.schedule_id else t(locale, "asset_pack", "unscheduled")
            rows.append(
                "<tr>"
                f"<td>{html.escape(item.name)}</td>"
                f"<td>{html.escape(item.scan_type)}</td>"
                f"<td><code>{html.escape(item.target)}</code></td>"
                f"<td>{html.escape(sched)}</td>"
                "</tr>"
            )
        headers = "".join(
            f"<th>{html.escape(t(locale, 'asset_pack', key))}</th>"
            for key in ("col_name", "col_type", "col_target", "col_schedule")
        )
        table_body = f"<table><tr>{headers}</tr>\n{chr(10).join(rows)}</table>"

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
.cover {{
  background: #fff; border: 1px solid var(--border); border-radius: 0.5rem; padding: 1.25rem 1.5rem;
}}
.cover p {{ margin: 0.25rem 0; font-size: 0.875rem; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 1rem; background: #fff; }}
th {{
  background: var(--muted); color: var(--foreground); padding: 0.625rem 0.75rem;
  text-align: left; font-size: 0.8125rem; font-weight: 650; border-bottom: 1px solid var(--border);
}}
td {{
  padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.875rem;
  vertical-align: top;
}}
.muted {{ color: var(--muted-foreground); font-size: 13px; }}
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
<h1>{html.escape(t(locale, "asset_pack", "h1"))}</h1>
<p><strong>{html.escape(t(locale, "asset_pack", "label_org"))}</strong> <code>{org_id}</code></p>
<p><strong>{html.escape(t(locale, "asset_pack", "label_sku"))}</strong> {sku}</p>
<p><strong>{html.escape(t(locale, "asset_pack", "label_count"))}</strong> {count} / {limit}</p>
<p class="muted">{html.escape(t(locale, "asset_pack", "exported", exported=exported))}</p>
<p class="muted">{html.escape(t(locale, "asset_pack", "note"))}</p>
{table_body}
</header>
<div class="footer">{html.escape(t(locale, "asset_pack", "footer"))}</div>
</body></html>"""
