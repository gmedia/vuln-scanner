from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import RateLimiter
from app.models.blog import BlogPost
from app.services.blog import escape_text, is_publicly_visible, plain_excerpt

html_router = APIRouter(tags=["blog-html"])

public_limiter = RateLimiter(
    max_requests=120,
    window_seconds=60,
    prefix="ratelimit:blog-html",
)

CANONICAL_HOST = "https://sinexis.app"

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
.site-header-inner,.site-footer-inner{
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
  font-family:ui-monospace,"JetBrains Mono",Menlo,monospace;
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
.body{margin-top:2rem;font-size:1.0625rem;line-height:1.75}
.body p{margin:0 0 1.1rem}
.body h2{margin:2.25rem 0 0.75rem;font-size:1.2rem}
.body ul,.body ol{margin:0 0 1.1rem;padding-left:1.25rem}
.body li{margin:0.35rem 0}
.body pre{
  font-family:ui-monospace,Menlo,monospace;background:var(--muted);
  padding:1rem;overflow-x:auto;border-radius:0.375rem;border:1px solid var(--border);
}
.body a{color:var(--primary)}
.back{margin-top:2.5rem;font-size:0.875rem;display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center}
.site-footer{margin-top:auto;border-top:1px solid var(--border);padding:1.5rem 0}
.site-footer-inner{flex-wrap:wrap;gap:0.75rem 1rem}
.site-footer p{margin:0;font-size:0.75rem;color:var(--muted-foreground)}
.site-footer a{
  font-size:0.75rem;color:var(--muted-foreground);text-decoration:none;
  min-height:2.75rem;display:inline-flex;align-items:center;padding:0 0.35rem;
}
.site-footer a:hover{color:var(--foreground)}
.site-footer a.primary{
  background:var(--primary);color:var(--primary-foreground);border-radius:0.375rem;
  padding:0 0.75rem;font-weight:600;
}
@media (max-width:640px){
  .header-actions a.sm-hide{display:none}
}
@media (min-width:768px){
  ol.index{gap:1rem}
}
"""


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
) -> str:
    main_class = "rail" if rail else "measure"
    blog_cur = ' aria-current="page"' if current == "blog" else ""
    terms_cur = ' aria-current="page"' if current == "terms" else ""
    privacy_cur = ' aria-current="page"' if current == "privacy" else ""
    return f"""<!DOCTYPE html>
<html lang="{escape_text(locale)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="theme-color" content="#fafafa"/>
<title>{escape_text(title)}</title>
<link rel="canonical" href="{escape_text(canonical)}"/>
<meta name="robots" content="index,follow"/>
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
    <p>Sinexis · Scan · Guard · SIEM</p>
    <nav>
      <a href="/blog"{blog_cur}>Blog</a>
      <a href="/terms"{terms_cur}>Syarat</a>
      <a href="/privacy"{privacy_cur}>Privasi</a>
      <a href="/login">Sign in</a>
      <a class="primary" href="/register">Get started</a>
    </nav>
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
<p class="lede">Security attach di colo/VPS dan hospitality: jadwal cek, bukan nmap sekali.</p>
<p class="cta-row"><a class="cta" href="/register">Get started</a>
<a class="cta-ghost" href="/">Kembali ke Sinexis</a></p>"""
    else:
        items = []
        for p in posts:
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
        inner = (
            "<div class='page-intro'><p class='eyebrow'>Blog</p>"
            "<h1>Catatan buat yang situsnya sudah jalan</h1>"
            "<p class='lede'>Jadwal cek, kredit, tim, dan alarm di server yang sudah "
            "Anda bayar — bukan SIEM, bukan agen kedua.</p></div>"
            "<ol class='index'>" + "".join(items) + "</ol>"
        )
    html = _shell("Blog — Sinexis", f"{CANONICAL_HOST}/blog", inner, rail=True)
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "public, max-age=60, s-maxage=300",
            "X-Robots-Tag": "index, follow",
        },
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
    urls = [f"  <url><loc>{CANONICAL_HOST}/blog</loc></url>"]
    for p in posts:
        urls.append(f"  <url><loc>{CANONICAL_HOST}/blog/{escape_text(p.slug)}</loc></url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += "\n".join(urls) + "\n</urlset>\n"
    cache = {"Cache-Control": "public, max-age=60, s-maxage=300"}
    return Response(content=xml, media_type="application/xml", headers=cache)


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
    inner = (
        f"<article data-testid='blog-article-title'>"
        f"<p class='eyebrow'>Blog</p>"
        f"<h1>{escape_text(post.title)}</h1>"
        f"<p class='meta'><time datetime='{escape_text(pub)}'>{escape_text(human)}</time>"
        f" · {escape_text(post.locale)}</p>"
        f"<div class='body'>{post.body_html}</div>"
        f"<p class='back'><a href='/blog'>← Semua artikel</a>"
        f"<a class='cta' href='/register'>Get started</a></p>"
        f"</article>"
    )
    html = _shell(
        f"{post.title} — Sinexis",
        f"{CANONICAL_HOST}/blog/{post.slug}",
        inner,
        post.locale,
    )
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "public, max-age=60, s-maxage=300",
            "X-Robots-Tag": "index, follow",
        },
    )
