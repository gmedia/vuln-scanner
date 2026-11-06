"""The public HTML islands must ship the same brand fonts as the SPA."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

FONT_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "fonts"

FONT_FILES = (
    "sora-latin-ext-wght-normal.woff2",
    "sora-latin-wght-normal.woff2",
    "red-hat-mono-latin-ext-wght-normal.woff2",
    "red-hat-mono-latin-wght-normal.woff2",
)

SANS_STACK = '"Sora Variable","Sora",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif'
MONO_STACK = '"Red Hat Mono Variable","Red Hat Mono",ui-monospace,"SFMono-Regular",Menlo,monospace'

OLD_SANS = "font-family:ui-sans-serif,system-ui,-apple-system"


@pytest.mark.parametrize("name", FONT_FILES)
def test_island_font_files_are_published(name):
    path = FONT_DIR / name
    assert path.is_file(), f"missing published font: {path}"
    assert path.stat().st_size > 5000, f"{name} looks truncated: {path.stat().st_size} bytes"


def _style(resp) -> str:
    match = re.search(r"<style>(.*?)</style>", resp.text, re.DOTALL)
    assert match is not None, "island page rendered without an inline <style> block"
    return match.group(1)


@pytest.mark.parametrize("path", ["/blog", "/terms", "/privacy"])
def test_island_pages_use_spa_fonts(client, path):
    resp = client.get(path)
    assert resp.status_code == 200

    style = _style(resp)
    assert style.lstrip().startswith("@font-face"), "font declarations must precede :root"
    assert "@font-face" in style
    assert "/fonts/sora-latin-wght-normal.woff2" in style
    assert "/fonts/red-hat-mono-latin-wght-normal.woff2" in style

    assert SANS_STACK in resp.text
    assert MONO_STACK in resp.text
    assert OLD_SANS not in style, "OS-only sans stack survived; Sora must come first"
