from pathlib import Path


def test_sinexis_install_public(client):
    resp = client.get("/install/sinexis-install.sh")
    assert resp.status_code == 200
    body = resp.content
    assert body.startswith(b"#!/usr/bin/env bash")
    assert b"<!DOCTYPE html>" not in body[:200]
    assert "text/x-shellscript" in resp.headers.get("content-type", "")
    assert "sinexis-install.sh" in resp.headers.get("content-disposition", "")


def test_static_installer_matches_packaging():
    static = Path(__file__).resolve().parent.parent / "static" / "sinexis-install.sh"
    pkg = (
        Path(__file__).resolve().parents[2]
        / "packaging"
        / "host-protect-helper"
        / "sinexis-install.sh"
    )
    assert static.is_file()
    if pkg.is_file():
        assert static.read_bytes() == pkg.read_bytes()
