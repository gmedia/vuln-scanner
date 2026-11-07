import re


def test_terms_html_public(client):
    resp = client.get("/terms")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")
    assert "Syarat dan Ketentuan" in resp.text
    assert 'rel="canonical"' in resp.text
    assert "https://sinexis.app/terms" in resp.text
    assert 'href="/privacy"' in resp.text
    assert "sinexis.theme" not in resp.text
    assert "bukan nasihat hukum" in resp.text
    assert 'aria-current="page"' in resp.text
    assert "footer-nav" in resp.text
    assert "footer-grid" not in resp.text
    assert "Sinexis · Security & operations attach" in resp.text
    assert 'href="/products"' in resp.text
    assert ">Produk<" in resp.text


def test_privacy_html_public(client):
    resp = client.get("/privacy")
    assert resp.status_code == 200
    assert "Kebijakan Privasi" in resp.text
    assert "https://sinexis.app/privacy" in resp.text
    assert "hash kata sandi" in resp.text
    assert 'href="/terms"' in resp.text
    assert "footer-nav" in resp.text
    assert "footer-grid" not in resp.text


def _meta_content(html: str, attr: str, key: str) -> str | None:
    match = re.search(rf'<meta[^>]*\b{attr}="{re.escape(key)}"[^>]*>', html, re.S)
    if not match:
        return None
    content = re.search(r'content="([^"]*)"', match.group(0), re.S)
    return content.group(1) if content else None


def test_legal_pages_carry_a_meta_description(client):
    for path in ("/terms", "/privacy"):
        resp = client.get(path)
        assert resp.status_code == 200

        assert _meta_content(resp.text, "name", "description"), f"{path} has no description"
        assert _meta_content(resp.text, "property", "og:description"), f"{path} has no og:description"


def test_legal_descriptions_are_snippet_sized(client):
    for path in ("/terms", "/privacy"):
        text = _meta_content(client.get(path).text, "name", "description") or ""
        assert 70 <= len(text) <= 200, f"{path} description is {len(text)} chars"
