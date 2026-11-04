import json
from datetime import UTC, datetime, timedelta

from app.config import settings
from app.services.blog import (
    BlogValidationError,
    is_publicly_visible,
    plain_excerpt,
    render_body_html,
    validate_slug,
)

API_HEADERS = {"X-API-Key": settings.api_key}


def test_validate_slug_ok():
    assert validate_slug("hello-world") == "hello-world"


def test_validate_slug_rejects():
    try:
        validate_slug("Hello World")
        raise AssertionError("expected")
    except BlogValidationError:
        pass


def test_render_strips_leading_h1():
    html = render_body_html("# Apa itu Sinexis?\n\nServer Anda sudah jalan.")
    assert html.lower().count("<h1") == 0
    assert "Server Anda sudah jalan" in html


def test_render_strips_script():
    html = render_body_html("hi <script>alert(1)</script>")
    assert "<script" not in html.lower()


def test_render_rejects_images():
    try:
        render_body_html("![x](https://evil.example/a.png)")
        raise AssertionError("expected")
    except BlogValidationError:
        pass


def test_is_publicly_visible():
    past = datetime.now(UTC) - timedelta(hours=1)
    future = datetime.now(UTC) + timedelta(hours=1)
    assert is_publicly_visible("published", past) is True
    assert is_publicly_visible("published", future) is False
    assert is_publicly_visible("draft", past) is False


def test_public_list_empty(client):
    resp = client.get("/api/blog/posts")
    assert resp.status_code == 200
    assert resp.json()["items"] == []
    assert resp.json()["total"] == 0


def test_plain_excerpt_strips_emphasis():
    assert "**Uptime**" not in plain_excerpt("Cek **Uptime** dari luar")
    assert "Uptime" in plain_excerpt("Cek **Uptime** dari luar")


def test_public_html_index(client):
    resp = client.get("/blog")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")
    assert "Blog" in resp.text
    assert "<h1>" in resp.text
    assert "Belum ada artikel" in resp.text
    assert "Scan Attach dari luar, temuan di workspace, alarm kritis di box" in resp.text
    assert "tanpa istilah konsol" not in resp.text
    assert "Scan · Guard · SIEM" not in resp.text
    assert "footer-top" in resp.text
    assert "footer-nav" in resp.text
    assert "footer-grid" not in resp.text
    assert "footer-col" not in resp.text
    assert "Sinexis · Security & operations attach" in resp.text
    assert 'href="/products"' in resp.text
    assert ">Produk<" in resp.text
    assert "probe ketersediaan" in resp.text
    assert "page-intro" in resp.text or "Belum ada artikel" in resp.text
    assert "brand-text" in resp.text
    assert 'rel="canonical"' in resp.text
    assert "sinexis.theme" not in resp.text
    assert "data-theme-set" not in resp.text
    assert "theme-switch" not in resp.text
    assert 'class="rail"' in resp.text or "class='rail'" in resp.text
    assert "prefers-color-scheme" in resp.text


def test_draft_not_public(client):
    created = client.post(
        "/api/admin/blog/posts",
        headers=API_HEADERS,
        json={
            "slug": "secret-draft",
            "title": "Secret",
            "excerpt": "nope",
            "body_md": "hello **world**",
            "locale": "id",
        },
    )
    assert created.status_code == 201
    resp = client.get("/api/blog/posts/secret-draft")
    assert resp.status_code == 404
    html = client.get("/blog/secret-draft")
    assert html.status_code == 404


def test_publish_then_public(client):
    created = client.post(
        "/api/admin/blog/posts",
        headers=API_HEADERS,
        json={
            "slug": "hello-sinexis",
            "title": "Hello",
            "excerpt": "intro **bold** teaser",
            "body_md": "intro **bold** teaser\n\nbody **bold**",
            "locale": "id",
        },
    )
    assert created.status_code == 201
    post_id = created.json()["id"]
    pub = client.post(f"/api/admin/blog/posts/{post_id}/publish", headers=API_HEADERS)
    assert pub.status_code == 200
    assert pub.json()["status"] == "published"
    listed = client.get("/api/blog/posts")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    detail = client.get("/api/blog/posts/hello-sinexis")
    assert detail.status_code == 200
    assert "<script" not in detail.json()["body_html"].lower()
    page = client.get("/blog/hello-sinexis")
    assert page.status_code == 200
    assert "Hello" in page.text
    assert "**bold**" not in page.text
    assert "lede excerpt" not in page.text
    body = page.text.split("<div class='body'>", 1)[-1].split("</div>", 1)[0]
    assert body.count("intro") == 1
    assert page.text.lower().count("<h1") == 1
    index = client.get("/blog")
    assert "**bold**" not in index.text
    assert "bold teaser" in index.text
    assert "class='card'" in index.text or 'class="card"' in index.text
    assert "Baca artikel" in index.text
    assert "Situs sudah jalan: cek dari luar, terjadwal" in index.text
    assert "Bukan SIEM 24/7" in index.text
    assert "bukan agen kedua" in index.text
    assert "wazuh-agent" in index.text
    assert "Host Protect helper" in index.text
    assert "tanpa istilah konsol" not in index.text
    assert "konsol ahli" not in index.text
    sm = client.get("/blog/sitemap.xml")
    assert sm.status_code == 200
    assert "hello-sinexis" in sm.text


def test_unpublish_hides(client):
    created = client.post(
        "/api/admin/blog/posts",
        headers=API_HEADERS,
        json={
            "slug": "temp-post",
            "title": "Temp",
            "excerpt": "x",
            "body_md": "y",
            "locale": "en",
        },
    )
    post_id = created.json()["id"]
    client.post(f"/api/admin/blog/posts/{post_id}/publish", headers=API_HEADERS)
    un = client.post(
        f"/api/admin/blog/posts/{post_id}/unpublish",
        headers=API_HEADERS,
        json={"status": "draft"},
    )
    assert un.status_code == 200
    assert client.get("/api/blog/posts/temp-post").status_code == 404


def test_slug_immutable_after_publish(client):
    created = client.post(
        "/api/admin/blog/posts",
        headers=API_HEADERS,
        json={
            "slug": "keep-slug",
            "title": "Keep",
            "excerpt": "e",
            "body_md": "b",
            "locale": "id",
        },
    )
    post_id = created.json()["id"]
    client.post(f"/api/admin/blog/posts/{post_id}/publish", headers=API_HEADERS)
    patched = client.patch(
        f"/api/admin/blog/posts/{post_id}",
        headers=API_HEADERS,
        json={"slug": "new-slug"},
    )
    assert patched.status_code == 422


def test_admin_list(client):
    resp = client.get("/api/admin/blog/posts", headers=API_HEADERS)
    assert resp.status_code == 200
    assert "items" in resp.json()

def _create_and_publish(client, slug: str, *, pillar: str | None = None, title: str = "Post") -> None:
    payload = {
        "slug": slug,
        "title": title,
        "excerpt": "teaser",
        "body_md": "body",
        "locale": "id",
    }
    if pillar is not None:
        payload["pillar"] = pillar
    created = client.post("/api/admin/blog/posts", headers=API_HEADERS, json=payload)
    assert created.status_code == 201
    post_id = created.json()["id"]
    published = client.post(f"/api/admin/blog/posts/{post_id}/publish", headers=API_HEADERS)
    assert published.status_code == 200


def test_invalid_pillar_rejected(client):
    resp = client.post(
        "/api/admin/blog/posts",
        headers=API_HEADERS,
        json={
            "slug": "bad-pillar",
            "title": "Bad",
            "excerpt": "x",
            "body_md": "y",
            "locale": "id",
            "pillar": "nope",
        },
    )
    assert resp.status_code == 422


def test_pillar_persisted_on_create_and_update(client):
    created = client.post(
        "/api/admin/blog/posts",
        headers=API_HEADERS,
        json={
            "slug": "pillar-edit",
            "title": "Pillar edit",
            "excerpt": "x",
            "body_md": "y",
            "locale": "id",
            "pillar": "exposure",
        },
    )
    assert created.status_code == 201
    assert created.json()["pillar"] == "exposure"
    post_id = created.json()["id"]
    patched = client.patch(
        f"/api/admin/blog/posts/{post_id}",
        headers=API_HEADERS,
        json={"pillar": "onbox"},
    )
    assert patched.status_code == 200
    assert patched.json()["pillar"] == "onbox"
    cleared = client.patch(
        f"/api/admin/blog/posts/{post_id}",
        headers=API_HEADERS,
        json={"pillar": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["pillar"] is None


def test_index_groups_by_pillar_and_hides_draft(client):
    _create_and_publish(client, "group-exposure", pillar="exposure", title="Exposure post")
    _create_and_publish(client, "group-onbox", pillar="onbox", title="Onbox post")
    _create_and_publish(client, "group-availability", pillar="availability", title="Availability post")
    _create_and_publish(client, "group-more", title="More post")
    _create_and_publish(client, "group-ai", pillar="ai", title="AI post")
    client.post(
        "/api/admin/blog/posts",
        headers=API_HEADERS,
        json={
            "slug": "group-draft",
            "title": "Draft post",
            "excerpt": "draft",
            "body_md": "draft",
            "locale": "id",
            "pillar": "exposure",
        },
    )
    resp = client.get("/blog")
    assert resp.status_code == 200
    text = resp.text
    for marker in (
        "data-pillar='exposure'",
        "data-pillar='onbox'",
        "data-pillar='availability'",
        "data-pillar='ai'",
        "data-pillar='none'",
    ):
        assert marker in text
    assert text.index("data-pillar='exposure'") < text.index("data-pillar='onbox'")
    assert text.index("data-pillar='onbox'") < text.index("data-pillar='availability'")
    assert text.index("data-pillar='availability'") < text.index("data-pillar='ai'")
    assert text.index("data-pillar='ai'") < text.index("data-pillar='none'")
    assert ">Exposure<" in text
    assert ">Keamanan on-box<" in text
    assert ">Ketersediaan<" in text
    assert ">AI<" in text
    assert ">More<" in text
    assert "group-draft" not in text
    assert "Draft post" not in text


def test_index_has_description_and_open_graph(client):
    _create_and_publish(client, "meta-index", pillar="exposure")
    resp = client.get("/blog")
    assert resp.status_code == 200
    assert '<meta name="description"' in resp.text
    assert '<meta property="og:title"' in resp.text
    assert '<meta property="og:description"' in resp.text
    assert '<meta property="og:url" content="https://sinexis.app/blog"' in resp.text
    assert '<meta property="og:type" content="website"' in resp.text


def test_article_emits_description_open_graph_and_jsonld(client):
    _create_and_publish(
        client,
        "meta-article",
        pillar="exposure",
        title="Meta article",
    )
    resp = client.get("/blog/meta-article")
    assert resp.status_code == 200
    text = resp.text
    assert '<meta name="description" content="teaser"' in text
    assert '<meta property="og:title" content="Meta article — Sinexis"' in text
    assert '<meta property="og:description" content="teaser"' in text
    assert '<meta property="og:url" content="https://sinexis.app/blog/meta-article"' in text
    assert '<meta property="og:type" content="article"' in text
    opening = '<script type="application/ld+json">'
    start = text.index(opening) + len(opening)
    end = text.index("</script>", start)
    payload = json.loads(text[start:end])
    assert payload["@context"] == "https://schema.org"
    assert payload["@type"] == "BlogPosting"
    assert payload["headline"] == "Meta article"
    assert payload["description"] == "teaser"
    assert payload["url"] == "https://sinexis.app/blog/meta-article"
    assert payload["datePublished"]
    assert "author" not in payload


def test_jsonld_escapes_script_breakout(client):
    title = "</script><script>alert(1)</script>"
    _create_and_publish(client, "meta-safe", pillar="exposure", title=title)
    resp = client.get("/blog/meta-safe")
    assert resp.status_code == 200
    assert resp.text.count("</script>") == 1
    opening = '<script type="application/ld+json">'
    start = resp.text.index(opening) + len(opening)
    end = resp.text.index("</script>", start)
    payload = json.loads(resp.text[start:end])
    assert payload["headline"] == title
