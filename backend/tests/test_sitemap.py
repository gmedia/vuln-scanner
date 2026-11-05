from datetime import UTC, datetime, timedelta
from xml.etree import ElementTree as ET

import pytest

from app.config import settings
from app.models.blog import BlogPost

SITEMAP_NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def _entries(xml_text: str) -> dict[str, str | None]:
    root = ET.fromstring(xml_text)
    return {
        url.findtext("s:loc", namespaces=SITEMAP_NS) or "": url.findtext("s:lastmod", namespaces=SITEMAP_NS)
        for url in root.findall("s:url", SITEMAP_NS)
    }


def _add_post(
    db_session,
    *,
    slug: str,
    status: str,
    published_at: datetime | None,
) -> BlogPost:
    post = BlogPost(
        slug=slug,
        title=f"Post {slug}",
        excerpt="excerpt",
        body_md="body",
        body_html="",
        locale="id",
        status=status,
        published_at=published_at,
    )
    db_session.add(post)
    return post


async def _seed_posts(db_session) -> None:
    now = datetime.now(UTC)
    _add_post(db_session, slug="published-post", status="published", published_at=now - timedelta(hours=1))
    _add_post(db_session, slug="draft-post", status="draft", published_at=None)
    _add_post(db_session, slug="future-post", status="published", published_at=now + timedelta(days=1))
    await db_session.commit()


@pytest.mark.asyncio
async def test_sitemap_returns_xml_with_public_urls(client, db_session):
    await _seed_posts(db_session)

    resp = client.get("/sitemap.xml")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "text/xml"
    assert resp.headers["cache-control"] == "public, max-age=300"

    body = resp.text
    assert "<urlset" in body
    assert "<loc>https://sinexis.app/</loc>" in body
    assert "<loc>https://sinexis.app/blog</loc>" in body
    assert "<loc>https://sinexis.app/terms</loc>" in body
    assert "<loc>https://sinexis.app/privacy</loc>" in body

    assert "<loc>https://sinexis.app/products</loc>" in body
    for slug in ("scan", "guard", "host", "uptime", "ai-gateway"):
        assert f"<loc>https://sinexis.app/products/{slug}</loc>" in body

    assert "<loc>https://sinexis.app/blog/published-post</loc>" in body
    assert "draft-post" not in body
    assert "future-post" not in body


def test_sitemap_excludes_non_public_surface(client):
    resp = client.get("/sitemap.xml")

    assert resp.status_code == 200
    body = resp.text
    assert "<loc>https://sinexis.app/products</loc>" in body
    assert "/admin" not in body
    assert "/status" not in body
    assert "/login" not in body


def test_sitemap_omits_blog_when_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "blog_enabled", False)

    resp = client.get("/sitemap.xml")

    assert resp.status_code == 200
    body = resp.text
    assert "<loc>https://sinexis.app/</loc>" in body
    assert "<loc>https://sinexis.app/terms</loc>" in body
    assert "<loc>https://sinexis.app/privacy</loc>" in body
    assert "<loc>https://sinexis.app/products</loc>" in body
    assert "<loc>https://sinexis.app/products/scan</loc>" in body
    assert "/blog" not in body


@pytest.mark.asyncio
async def test_sitemap_lastmod_covers_blog_and_only_dated_entries(client, db_session):
    await _seed_posts(db_session)

    resp = client.get("/sitemap.xml")

    entries = _entries(resp.text)
    assert entries["https://sinexis.app/blog/published-post"] is not None
    assert entries["https://sinexis.app/blog"] is not None
    for loc in ("https://sinexis.app/blog/published-post", "https://sinexis.app/blog"):
        datetime.fromisoformat(entries[loc] or "")

    # No truthful modification timestamp exists for static/product pages, so
    # they must stay bare rather than invent one.
    for path in ("/", "/products", "/products/scan", "/terms", "/privacy"):
        assert entries[f"https://sinexis.app{path}"] is None


def test_sitemap_is_well_formed_xml(client):
    root = ET.fromstring(client.get("/sitemap.xml").text)

    assert root.tag == "{http://www.sitemaps.org/schemas/sitemap/0.9}urlset"
    assert len(root.findall("s:url", SITEMAP_NS)) >= 10
