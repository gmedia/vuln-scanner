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
from app.services.blog import escape_text, is_publicly_visible

html_router = APIRouter(tags=["blog-html"])

public_limiter = RateLimiter(
    max_requests=120,
    window_seconds=60,
    prefix="ratelimit:blog-html",
)

CANONICAL_HOST = "https://sinexis.app"

_SHELL_CSS = """
:root{
  --paper:hsl(0 0% 98%);
  --ink:hsl(0 0% 7%);
  --muted:hsl(0 0% 45%);
  --rule:hsl(0 0% 90%);
  --signal:hsl(142 71% 45%);
  --measure:42rem;
  --rail:min(90rem,100%);
}
*{box-sizing:border-box}
html{color-scheme:light;background:var(--paper)}
body{
  margin:0;min-height:100dvh;display:flex;flex-direction:column;
  font-family:"Iowan Old Style","Palatino Linotype",Palatino,"Times New Roman",serif;
  color:var(--ink);background:
    radial-gradient(1200px 500px at 12% -10%,hsl(142 20% 96%),transparent 55%),
    repeating-linear-gradient(0deg,transparent,transparent 7px,hsl(0 0% 0%/0.03) 8px),
    var(--paper);
  line-height:1.65;
}
a{color:var(--signal);text-underline-offset:0.18em}
a:hover{color:var(--ink)}
.masthead,.colophon{
  width:min(var(--rail),100%);margin-inline:auto;padding:1rem 1.25rem;
}
.masthead{
  display:flex;flex-wrap:wrap;align-items:baseline;gap:0.75rem 1.25rem;
  border-bottom:1px solid var(--rule);border-left:3px solid var(--signal);
}
.wordmark{
  font-family:ui-monospace,"Cascadia Code","SF Mono",Menlo,monospace;
  font-size:0.8rem;letter-spacing:0.28em;text-transform:uppercase;
  color:var(--ink);text-decoration:none;font-weight:600;
}
.kicker{
  font-family:ui-monospace,"Cascadia Code","SF Mono",Menlo,monospace;
  font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--signal);
}
.masthead nav{
  margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:0.75rem
}
.masthead nav a{
  color:var(--muted);text-decoration:none;margin-left:1rem;
  min-height:44px;display:inline-flex;align-items:center
}
.masthead nav a[aria-current="page"]{
  color:var(--ink);border-bottom:1px solid var(--ink)
}
.dateline{
  width:100%;margin:0;font-family:ui-monospace,Menlo,monospace;
  font-size:0.7rem;color:var(--muted);letter-spacing:0.04em
}
main{flex:1;width:min(var(--measure),calc(100% - 2rem));margin:0 auto;padding:3rem 0 4rem}
h1{font-size:clamp(1.75rem,4vw,2.75rem);line-height:1.2;font-weight:600;margin:0 0 0.75rem}
h2{font-size:1.35rem;margin:0 0 0.35rem;font-weight:600}
.eyebrow{
  font-family:ui-monospace,Menlo,monospace;font-size:0.7rem;
  letter-spacing:0.16em;text-transform:uppercase;color:var(--signal);
  margin:0 0 0.75rem
}
.lede,.excerpt{color:var(--muted);font-size:1.05rem}
.empty-frame{
  margin:2rem 0;min-height:8rem;border:1px dashed var(--rule);
  display:grid;place-items:center;color:var(--signal);font-size:1.5rem;
}
.empty-frame::before{content:"◈"}
.cta-row{display:flex;flex-wrap:wrap;gap:0.75rem 1.25rem;margin-top:1.5rem}
.cta{
  display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;
  background:var(--ink);color:var(--paper);text-decoration:none;
  font-family:ui-monospace,Menlo,monospace;font-size:0.75rem;
  letter-spacing:0.06em;text-transform:uppercase;
}
.cta:hover{background:var(--signal);color:var(--ink)}
.cta-ghost{
  display:inline-flex;align-items:center;min-height:44px;color:var(--muted);
  font-family:ui-monospace,Menlo,monospace;font-size:0.75rem
}
ol.index{list-style:none;margin:0;padding:0}
ol.index li{padding:1.5rem 0;border-bottom:1px solid var(--rule)}
ol.index time,article time,.meta{
  font-family:ui-monospace,Menlo,monospace;font-size:0.75rem;color:var(--muted);
}
ol.index a{color:var(--ink);text-decoration:none}
ol.index a:hover h2{color:var(--signal)}
.body{margin-top:1.5rem;font-size:1.0625rem}
.body h2{margin-top:2rem}
.body pre{font-family:ui-monospace,Menlo,monospace;background:hsl(0 0% 96%);padding:1rem;overflow-x:auto}
.body a{color:var(--signal)}
.back{margin-top:2.5rem;font-family:ui-monospace,Menlo,monospace;font-size:0.75rem}
.colophon{
  border-top:1px solid var(--rule);font-family:ui-monospace,Menlo,monospace;
  font-size:0.7rem;color:var(--muted);
}
@media (max-width:480px){
  .masthead nav{margin-left:0;width:100%}
  .masthead nav a{margin-left:0;margin-right:1rem}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
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


def _shell(title: str, canonical: str, inner: str, locale: str = "id") -> str:
    return f"""<!DOCTYPE html>
<html lang="{escape_text(locale)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{escape_text(title)}</title>
<link rel="canonical" href="{escape_text(canonical)}"/>
<meta name="robots" content="index,follow"/>
<style>{_SHELL_CSS}</style>
</head>
<body>
<header class="masthead">
  <a class="wordmark" href="/">Sinexis</a>
  <span class="kicker">Briefing</span>
  <nav>
    <a href="/">Beranda</a>
    <a href="/blog" aria-current="page">Blog</a>
  </nav>
  <p class="dateline">Security attach · colo/VPS · hospitality</p>
</header>
<main>
{inner}
</main>
<footer class="colophon">Sinexis · sinexis.app/blog</footer>
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
        inner = """<p class="eyebrow">Edisi 00 · belum terbit</p>
<h1>Briefing belum ada di rak.</h1>
<p class="lede">Catatan publik soal security attach di colo/VPS dan hospitality — bukan changelog dashboard.</p>
<div class="empty-frame" aria-hidden="true"></div>
<p class="cta-row"><a class="cta" href="/">Kembali ke Sinexis</a>
<a class="cta-ghost" href="/register">Mulai attach</a></p>"""
    else:
        items = []
        for p in posts:
            pub = p.published_at.isoformat() if p.published_at else ""
            human = _human_date(p.published_at)
            items.append(
                "<li>"
                f"<time datetime='{escape_text(pub)}'>{escape_text(human)}</time>"
                f"<a href='/blog/{escape_text(p.slug)}'><h2>{escape_text(p.title)}</h2></a>"
                f"<p class='excerpt'>{escape_text(p.excerpt)}</p>"
                "</li>"
            )
        inner = "<h1>Briefing</h1><ol class='index'>" + "".join(items) + "</ol>"
    html = _shell("Blog — Sinexis", f"{CANONICAL_HOST}/blog", inner)
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
        f"<p class='eyebrow'>Briefing</p>"
        f"<h1>{escape_text(post.title)}</h1>"
        f"<p class='meta'><time datetime='{escape_text(pub)}'>{escape_text(human)}</time>"
        f" · {escape_text(post.locale)}</p>"
        f"<p class='lede excerpt'>{escape_text(post.excerpt)}</p>"
        f"<div class='body'>{post.body_html}</div>"
        f"<p class='back'><a href='/blog'>← Semua briefing</a></p>"
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
