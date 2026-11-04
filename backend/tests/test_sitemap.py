from datetime import UTC, datetime, timedelta

import pytest

from app.config import settings
from app.models.blog import BlogPost


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
