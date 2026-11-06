from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.sitemap_common import lastmod_tag
from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.blog import BlogPost
from app.services.blog import escape_text, is_publicly_visible, plain_excerpt, strip_leading_html_h1

html_router = APIRouter(tags=["blog-html"])

public_limiter = RateLimiter(
    max_requests=120,
    window_seconds=60,
    prefix="ratelimit:blog-html",
)

CANONICAL_HOST = "https://sinexis.app"

# Google accepts either for `image` but prefers ~1.91:1; the 1200x630 card is
# served from frontend/public/ so it lands at the web root.
DEFAULT_SOCIAL_IMAGE = f"{CANONICAL_HOST}/og-image.png"
# Publisher logo stays square: Google renders it as a small avatar.
PUBLISHER_LOGO = f"{CANONICAL_HOST}/icon-512.png"

_PILLAR_LABELS = {
    "exposure": "Exposure",
    "onbox": "Keamanan on-box",
    "availability": "Ketersediaan",
    "ai": "AI",
}
_MORE_LABEL = "More"

_SHELL_CSS = """
:root{
  --background:hsl(0 0% 98%);
  --foreground:hsl(0 0% 7%);
  --muted:hsl(0 0% 96%);
  --muted-foreground:hsl(0 0% 32%);
  --border:hsl(0 0% 90%);
  --primary:hsl(142 71% 45%);
  --primary-foreground:hsl(0 0% 4%);
  --measure:42rem;
  --rail:72rem;
}
@media (prefers-color-scheme: dark){
  :root{
    color-scheme:dark;
    --background:hsl(0 0% 4%);
    --foreground:hsl(0 0% 96%);
    --muted:hsl(0 0% 12%);
    --muted-foreground:hsl(0 0% 72%);
    --border:hsl(0 0% 22%);
    --primary:hsl(142 71% 45%);
    --primary-foreground:hsl(0 0% 4%);
  }
}
*{box-sizing:border-box}
html{color-scheme:light;background:var(--background)}
body{
  margin:0;min-height:100dvh;display:flex;flex-direction:column;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  color:var(--foreground);background:var(--background);line-height:1.6;
  letter-spacing:-0.011em;
}
a{color:var(--primary);text-underline-offset:0.15em}
a:hover{color:var(--foreground)}
.site-header{border-bottom:1px solid var(--border)}
.site-header-inner{
  width:min(var(--rail),100%);margin:0 auto;padding:0 1rem;
  display:flex;align-items:center;justify-content:space-between;gap:0.75rem;
}
.site-header-inner{height:3rem}
.brand{
  display:inline-flex;align-items:center;gap:0.6rem;text-decoration:none;
  color:var(--foreground);
}
.brand svg{width:1.25rem;height:1.25rem;color:var(--primary);flex-shrink:0}
.brand-text{
  font-family:ui-monospace,"SFMono-Regular",Menlo,monospace;
  font-size:0.875rem;font-weight:700;letter-spacing:0.08em;
}
.brand-accent{color:var(--primary)}
.header-actions{display:flex;align-items:center;gap:0.5rem;flex-shrink:0}
.header-actions a{
  display:inline-flex;align-items:center;min-height:2.75rem;padding:0 0.75rem;
  font-size:0.75rem;text-decoration:none;color:var(--foreground);
  border:1px solid var(--border);border-radius:0.375rem;background:transparent;
  cursor:pointer;font-family:inherit;
}
.header-actions a.ghost{border-color:transparent;color:var(--muted-foreground)}
.header-actions a.primary{
  background:var(--primary);color:var(--primary-foreground);border-color:transparent;
}
.header-actions a[aria-current="page"]{color:var(--foreground);font-weight:600}
main.rail{flex:1;width:min(var(--rail),calc(100% - 2rem));margin:0 auto;padding:2.5rem 0 4rem}
main.measure{flex:1;width:min(var(--measure),calc(100% - 2rem));margin:0 auto;padding:3rem 0 4.5rem}
.page-intro{margin:0 0 2rem;max-width:40rem}
h1{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size:clamp(1.75rem,3vw,2.25rem);line-height:1.15;font-weight:700;
  letter-spacing:-0.03em;margin:0 0 0.75rem}
article h1{font-size:clamp(1.85rem,3.2vw,2.75rem)}
h2{font-size:1.125rem;margin:0 0 0.4rem;font-weight:600;letter-spacing:-0.02em}
.eyebrow{font-size:0.6875rem;font-weight:600;letter-spacing:0.08em;
  text-transform:uppercase;color:var(--primary);margin:0 0 0.5rem}
.lede,.excerpt{color:var(--muted-foreground);font-size:0.9375rem;line-height:1.55}
.cta-row{display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:1.5rem}
.cta{
  display:inline-flex;align-items:center;min-height:2.75rem;padding:0 1rem;
  background:var(--primary);color:var(--primary-foreground);text-decoration:none;
  font-size:0.875rem;font-weight:600;border-radius:0.375rem;
}
.cta-ghost{
  display:inline-flex;align-items:center;min-height:2.75rem;padding:0 0.75rem;
  color:var(--muted-foreground);text-decoration:none;font-size:0.875rem;
}
ol.index{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.75rem}
ol.index li{margin:0;padding:0;border:0}
ol.index a.card{
  display:block;color:var(--foreground);text-decoration:none;
  border:1px solid var(--border);border-radius:0.5rem;padding:1.25rem 1.35rem;
  background:transparent;transition:border-color .15s,background .15s;
}
ol.index a.card:hover{border-color:hsl(142 71% 45% / 0.45);background:var(--muted)}
ol.index a.card:hover h2{color:var(--primary)}
ol.index li:first-child a.card{padding:1.5rem 1.5rem}
ol.index li:first-child h2{font-size:clamp(1.25rem,2vw,1.5rem)}
ol.index time,article time,.meta{
  font-size:0.75rem;color:var(--muted-foreground);letter-spacing:0.02em;
}
ol.index .excerpt{
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;
  overflow:hidden;margin:0.5rem 0 0;
}
ol.index .read{
  display:inline-flex;align-items:center;gap:0.35rem;margin-top:0.85rem;
  font-size:0.8125rem;font-weight:600;color:var(--primary);
}
.pillar + .pillar{margin-top:2rem}
.pillar > h2{
  font-size:0.6875rem;font-weight:600;letter-spacing:0.08em;
  text-transform:uppercase;color:var(--muted-foreground);margin:0 0 0.75rem;
}
.body{margin-top:2rem;font-size:1.0625rem;line-height:1.75}
.body p{margin:0 0 1.1rem}
.body h2{margin:2.25rem 0 0.75rem;font-size:1.2rem}
.body ul,.body ol{margin:0 0 1.1rem;padding-left:1.25rem}
.body li{margin:0.35rem 0}
.body pre{
  font-family:ui-monospace,"SFMono-Regular",Menlo,monospace;background:var(--muted);
  padding:1rem;overflow-x:auto;border-radius:0.375rem;border:1px solid var(--border);
}
.body a{color:var(--primary)}
.back{margin-top:2.5rem;font-size:0.875rem;display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center}
.site-footer{
  margin-top:auto;border-top:1px solid var(--border);
  background:linear-gradient(to bottom, color-mix(in srgb, var(--muted) 40%, var(--background)), var(--background));
}
.site-footer-inner{
  width:min(var(--rail),100%);margin:0 auto;padding:2.5rem 1rem 2rem;
  display:block;
}
.footer-top{
  display:flex;flex-direction:column;gap:1.5rem;
}
.footer-brand p.blurb{
  margin:0.75rem 0 0;max-width:20rem;font-size:0.875rem;line-height:1.55;
  color:var(--muted-foreground);
}
.footer-nav{
  display:flex;flex-wrap:wrap;align-items:center;gap:0 0.75rem;
}
.footer-nav a{
  font-size:0.875rem;color:var(--muted-foreground);text-decoration:none;
  min-height:2.75rem;display:inline-flex;align-items:center;border-radius:0.125rem;
}
.footer-nav a:hover{color:var(--foreground)}
.footer-nav a:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.footer-nav a.primary{
  color:var(--primary);font-weight:500;text-underline-offset:0.25rem;
}
.footer-nav a.primary:hover{color:var(--foreground);text-decoration:underline}
.footer-meta{
  display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;
  gap:0.5rem;margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border);
}
.footer-meta p{margin:0;font-size:0.75rem;color:var(--muted-foreground)}
@media (min-width:1024px){
  .footer-top{flex-direction:row;align-items:flex-start;justify-content:space-between;gap:3rem}
  .footer-nav{justify-content:flex-end;max-width:28rem;gap:0 1.25rem}
}
@media (max-width:640px){
  .header-actions a.sm-hide{display:none}
}
@media (min-width:768px){
  ol.index{gap:1rem}
}
"""


def _iso_utc(value: datetime | None) -> str:
    """ISO 8601 with an explicit offset, which structured data expects.

    Postgres returns aware datetimes, but a naive value (or another driver) must
    not silently emit a timestamp with no timezone.
    """
    if value is None:
        return ""
    stamp = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return stamp.isoformat()


def _human_date(value: datetime | None) -> str:
    if value is None:
        return ""
    months = (
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "Mei",
        "Jun",
        "Jul",
        "Agu",
        "Sep",
        "Okt",
        "Nov",
        "Des",
    )
    return f"{value.day} {months[value.month - 1]} {value.year}"


_CROSSHAIR_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round" aria-hidden="true">'
    '<circle cx="12" cy="12" r="10"/>'
    '<line x1="22" x2="18" y1="12" y2="12"/>'
    '<line x1="6" x2="2" y1="12" y2="12"/>'
    '<line x1="12" x2="12" y1="6" y2="2"/>'
    '<line x1="12" x2="12" y1="22" y2="18"/>'
    "</svg>"
)


def _shell(
    title: str,
    canonical: str,
    inner: str,
    locale: str = "id",
    *,
    rail: bool = False,
    current: str = "blog",
    description: str | None = None,
    og_type: str | None = None,
    og_url: str | None = None,
    og_image: str | None = None,
    jsonld: dict[str, Any] | None = None,
) -> str:
    main_class = "rail" if rail else "measure"
    blog_cur = ' aria-current="page"' if current == "blog" else ""
    terms_cur = ' aria-current="page"' if current == "terms" else ""
    privacy_cur = ' aria-current="page"' if current == "privacy" else ""
    description_meta = ""
    og_meta = ""
    if description is not None:
        safe_description = escape_text(description)
        safe_url = escape_text(og_url or canonical)
        safe_type = escape_text(og_type or "website")
        description_meta = f'<meta name="description" content="{safe_description}"/>\n'
        og_meta = (
            f'<meta property="og:title" content="{escape_text(title)}"/>\n'
            f'<meta property="og:description" content="{safe_description}"/>\n'
            f'<meta property="og:url" content="{safe_url}"/>\n'
            f'<meta property="og:type" content="{safe_type}"/>\n'
            f'<meta property="og:image" content="{escape_text(og_image or DEFAULT_SOCIAL_IMAGE)}"/>\n'
        )
    jsonld_block = ""
    if jsonld is not None:
        serialized = json.dumps(jsonld, ensure_ascii=False)
        serialized = serialized.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
        jsonld_block = f'<script type="application/ld+json">{serialized}</script>\n'
    return f"""<!DOCTYPE html>
<html lang="{escape_text(locale)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="theme-color" content="#fafafa"/>
<title>{escape_text(title)}</title>
<link rel="canonical" href="{escape_text(canonical)}"/>
<meta name="robots" content="index,follow"/>
{description_meta}{og_meta}{jsonld_block}
<style>{_SHELL_CSS}</style>
</head>
<body>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="/" aria-label="Sinexis home">
      {_CROSSHAIR_SVG}
      <span class="brand-text">SINE<span class="brand-accent">XIS</span></span>
    </a>
    <nav class="header-actions">
      <a class="ghost" href="/blog"{blog_cur}>Blog</a>
      <a class="ghost sm-hide" href="/login">Sign in</a>
      <a class="primary" href="/register">Get started</a>
    </nav>
  </div>
</header>
<main class="{main_class}">
{inner}
</main>
<footer class="site-footer">
  <div class="site-footer-inner">
    <div class="footer-top">
      <div class="footer-brand">
        <a class="brand" href="/" aria-label="Sinexis home">
          {_CROSSHAIR_SVG}
          <span class="brand-text">SINE<span class="brand-accent">XIS</span></span>
        </a>
        <p class="blurb">Menempel di colo, VPS, dan hospitality. Scan dari luar, satu agen tipis di mesin,
        probe ketersediaan, dan AI gateway di akun yang sama.</p>
      </div>
      <nav class="footer-nav" aria-label="Situs">
        <a href="/">Beranda</a>
        <a href="/products">Produk</a>
        <a href="/blog"{blog_cur}>Blog</a>
        <a href="/terms"{terms_cur}>Syarat</a>
        <a href="/privacy"{privacy_cur}>Privasi</a>
        <a href="/login">Sign in</a>
        <a class="primary" href="/register">Get started</a>
      </nav>
    </div>
    <div class="footer-meta">
      <p>Sinexis · Security & operations attach</p>
      <p>© {datetime.now(UTC).year} Sinexis</p>
    </div>
  </div>
</footer>
</body>
</html>
"""


@html_router.get("/blog", response_class=HTMLResponse)
@html_router.get("/blog/", response_class=HTMLResponse)
async def blog_index_html(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    if not settings.blog_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    limited = await public_limiter(request)
    if limited:
        return limited  # type: ignore[return-value]
    now = datetime.now(UTC)
    result = await db.execute(
        select(BlogPost)
        .where(
            BlogPost.status == "published",
            BlogPost.published_at.is_not(None),
            BlogPost.published_at <= now,
        )
        .order_by(BlogPost.published_at.desc())
        .limit(50)
    )
    posts = list(result.scalars().all())
    if not posts:
        inner = """<p class="eyebrow">Blog</p>
<h1>Belum ada artikel.</h1>
<p class="lede">Scan Attach dari luar, temuan di workspace, alarm kritis di box. Satu wazuh-agent. Bukan SIEM 24/7.</p>
<p class="cta-row"><a class="cta" href="/register">Get started</a>
<a class="cta-ghost" href="/">Kembali ke Sinexis</a></p>"""
    else:
        groups: dict[str | None, list[BlogPost]] = {pillar: [] for pillar in _PILLAR_LABELS}
        groups[None] = []
        for post in posts:
            key = post.pillar if post.pillar in _PILLAR_LABELS else None
            groups[key].append(post)
        sections = []
        for pillar in (*_PILLAR_LABELS, None):
            group = groups[pillar]
            if not group:
                continue
            items = []
            for p in group:
                pub = p.published_at.isoformat() if p.published_at else ""
                human = _human_date(p.published_at)
                items.append(
                    "<li>"
                    f"<a class='card' href='/blog/{escape_text(p.slug)}'>"
                    f"<time datetime='{escape_text(pub)}'>{escape_text(human)}</time>"
                    f"<h2>{escape_text(p.title)}</h2>"
                    f"<p class='excerpt'>{escape_text(plain_excerpt(p.excerpt))}</p>"
                    "<span class='read'>Baca artikel →</span>"
                    "</a>"
                    "</li>"
                )
            label = _PILLAR_LABELS[pillar] if pillar else _MORE_LABEL
            data_key = pillar or "none"
            sections.append(
                f"<section class='pillar' data-pillar='{escape_text(data_key)}'>"
                f"<h2>{escape_text(label)}</h2>"
                "<ol class='index'>" + "".join(items) + "</ol>"
                "</section>"
            )
        inner = (
            "<div class='page-intro'><p class='eyebrow'>Blog</p>"
            "<h1>Situs sudah jalan: cek dari luar, terjadwal</h1>"
            "<p class='lede'>Scan Attach memotret permukaan (port, DNS/TLS, CVE dikenal) ke workspace. "
            "Guard satu wazuh-agent, alarm kritis. Host Protect helper di VPS Anda. "
            "Bukan SIEM 24/7, bukan agen kedua.</p></div>" + "".join(sections)
        )
    index_jsonld: dict[str, Any] | None = None
    if posts:
        index_jsonld = {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "url": f"{CANONICAL_HOST}/blog",
            "numberOfItems": len(posts),
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": position,
                    "url": f"{CANONICAL_HOST}/blog/{p.slug}",
                }
                for position, p in enumerate(posts, start=1)
            ],
        }
    html = _shell(
        "Blog — Sinexis",
        f"{CANONICAL_HOST}/blog",
        inner,
        rail=True,
        description=(
            "Artikel Sinexis soal exposure, keamanan on-box, ketersediaan, dan AI untuk colo, VPS, dan hospitality."
        ),
        og_type="website",
        og_url=f"{CANONICAL_HOST}/blog",
        jsonld=index_jsonld,
    )
    return HTMLResponse(
        html,
        headers={"Cache-Control": "public, max-age=60, s-maxage=300"},
    )


@html_router.get("/blog/sitemap.xml")
async def blog_sitemap(db: AsyncSession = Depends(get_db)) -> Response:
    if not settings.blog_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    now = datetime.now(UTC)
    result = await db.execute(
        select(BlogPost).where(
            BlogPost.status == "published",
            BlogPost.published_at.is_not(None),
            BlogPost.published_at <= now,
        )
    )
    posts = list(result.scalars().all())
    index_lastmod = max((p.updated_at for p in posts), default=None)
    urls = [f"  <url><loc>{CANONICAL_HOST}/blog</loc>{lastmod_tag(index_lastmod)}</url>"]
    for p in posts:
        stamp = lastmod_tag(p.updated_at or p.published_at)
        urls.append(f"  <url><loc>{CANONICAL_HOST}/blog/{escape_text(p.slug)}</loc>{stamp}</url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(urls) + "\n</urlset>\n"
    cache = {"Cache-Control": "public, max-age=60, s-maxage=300"}
    return Response(content=xml, headers={"Content-Type": "text/xml", **cache})


@html_router.get("/blog/{slug}", response_class=HTMLResponse)
async def blog_article_html(
    request: Request,
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    if not settings.blog_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    if slug == "sitemap.xml":
        raise HTTPException(status_code=404, detail="Not found")
    limited = await public_limiter(request)
    if limited:
        return limited  # type: ignore[return-value]
    result = await db.execute(select(BlogPost).where(BlogPost.slug == slug))
    post = result.scalar_one_or_none()
    if post is None or not is_publicly_visible(post.status, post.published_at):
        raise HTTPException(status_code=404, detail="Not found")
    pub = post.published_at.isoformat() if post.published_at else ""
    human = _human_date(post.published_at)
    article_url = f"{CANONICAL_HOST}/blog/{post.slug}"
    description = plain_excerpt(post.excerpt, 160)
    jsonld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post.title,
        "description": description,
        "datePublished": _iso_utc(post.published_at),
        "dateModified": _iso_utc(post.updated_at or post.published_at),
        "url": article_url,
        "mainEntityOfPage": {"@type": "WebPage", "@id": article_url},
        "image": [DEFAULT_SOCIAL_IMAGE],
        "inLanguage": post.locale,
        # Published by the platform. `User` has no display name, and the only
        # other column is the email, which must not reach public HTML.
        "author": {"@type": "Organization", "name": "Sinexis", "url": CANONICAL_HOST},
        "publisher": {
            "@type": "Organization",
            "name": "Sinexis",
            "url": CANONICAL_HOST,
            "logo": {"@type": "ImageObject", "url": PUBLISHER_LOGO},
        },
    }
    inner = (
        f"<article data-testid='blog-article-title'>"
        f"<p class='eyebrow'>Blog</p>"
        f"<h1>{escape_text(post.title)}</h1>"
        f"<p class='meta'><time datetime='{escape_text(pub)}'>{escape_text(human)}</time>"
        f" · {escape_text(post.locale)}</p>"
        f"<div class='body'>{strip_leading_html_h1(post.body_html)}</div>"
        f"<p class='back'><a href='/blog'>← Semua artikel</a>"
        f"<a class='cta' href='/register'>Get started</a></p>"
        f"</article>"
    )
    html = _shell(
        f"{post.title} — Sinexis",
        article_url,
        inner,
        post.locale,
        description=description,
        og_type="article",
        og_url=article_url,
        jsonld=jsonld,
    )
    return HTMLResponse(
        html,
        headers={"Cache-Control": "public, max-age=60, s-maxage=300"},
    )
