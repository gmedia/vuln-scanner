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
    assert "Scan dari luar, temuan buat tim, alarm tipis di mesin" in resp.text
    assert "Bahasa operator, bukan brosur" in resp.text
    assert "tanpa istilah konsol" not in resp.text
    assert "Scan · Guard · SIEM" not in resp.text
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
    assert "Lanjut baca" in index.text
    assert "Cek paparan dari luar, lalu jadwalkan" in index.text
    assert "Bukan SIEM yang ditunggui" in index.text
    assert "wazuh-agent" in index.text
    assert "Host Protect diam kalau helper belum ada" in index.text
    assert "tanpa istilah konsol" not in index.text
    assert "konsol ahli" not in index.text
    assert "Masuk" in index.text
    assert "Mulai" in index.text
    assert "Sign in" not in index.text
    assert "Get started" not in index.text
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
