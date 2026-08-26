def test_terms_html_public(client):
    resp = client.get("/terms")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "")
    assert "Syarat dan Ketentuan" in resp.text
    assert 'rel="canonical"' in resp.text
    assert "https://sinexis.app/terms" in resp.text
    assert 'href="/privacy"' in resp.text
    assert "sinexis.theme" in resp.text
    assert "bukan nasihat hukum" in resp.text
    assert 'aria-current="page"' in resp.text


def test_privacy_html_public(client):
    resp = client.get("/privacy")
    assert resp.status_code == 200
    assert "Kebijakan Privasi" in resp.text
    assert "https://sinexis.app/privacy" in resp.text
    assert "hash kata sandi" in resp.text
    assert 'href="/terms"' in resp.text
