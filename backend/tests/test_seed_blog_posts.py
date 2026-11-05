"""Tests for the blog seed importer (pure helpers + source files)."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

from app.models.blog import BLOG_PILLARS
from scripts import seed_blog_posts
from scripts.seed_blog_posts import (
    BLOG_DIR,
    PILLAR_BY_SLUG,
    build_excerpt,
    first_paragraph,
    load_posts,
    split_title,
)

SAMPLE = """# Judul Contoh

Paragraf pertama yang menjelaskan masalahnya.

## Subjudul

Paragraf kedua **tebal** dan [tautan](https://example.com).
"""


def test_split_title_extracts_heading_and_strips_it() -> None:
    title, body = split_title(SAMPLE)

    assert title == "Judul Contoh"
    assert not body.startswith("#")
    assert body.startswith("Paragraf pertama")


def test_split_title_without_heading_returns_empty_title() -> None:
    title, body = split_title("Tanpa judul sama sekali.\n")

    assert title == ""
    assert body == "Tanpa judul sama sekali."


def test_first_paragraph_skips_headings_and_stops_at_blank_line() -> None:
    _, body = split_title(SAMPLE)

    assert first_paragraph(body) == "Paragraf pertama yang menjelaskan masalahnya."


def test_first_paragraph_skips_leading_list() -> None:
    body = "- satu\n- dua\n\nKalimat prosa sesudahnya.\n"

    assert first_paragraph(body) == "Kalimat prosa sesudahnya."


def test_first_paragraph_ignores_fenced_code() -> None:
    body = "```\nkode\n```\n\nProsa setelah blok kode.\n"

    assert first_paragraph(body) == "Prosa setelah blok kode."


def test_build_excerpt_strips_markdown_and_unwraps_links() -> None:
    _, body = split_title(SAMPLE)

    excerpt = build_excerpt(body)

    assert excerpt == "Paragraf pertama yang menjelaskan masalahnya."


def test_build_excerpt_handles_bold_and_link_in_first_paragraph() -> None:
    body = "Lihat **[dokumen](https://example.com/a)** ini untuk detail `kode`.\n"

    assert build_excerpt(body) == "Lihat dokumen ini untuk detail kode."


def test_build_excerpt_truncates_with_ellipsis() -> None:
    body = ("kata " * 200).strip()

    excerpt = build_excerpt(body)

    assert len(excerpt) <= 280
    assert excerpt.endswith("…")


def test_pillar_map_matches_model_constants() -> None:
    assert set(PILLAR_BY_SLUG.values()) <= set(BLOG_PILLARS)


def test_every_seed_file_has_a_pillar_and_parses() -> None:
    if not BLOG_DIR.is_dir():  # pragma: no cover - repo always has the files
        pytest.skip("blog source directory not present")

    posts = load_posts(BLOG_DIR)
    slugs = {p.slug for p in posts}
    md_files = {p.stem for p in Path(BLOG_DIR).glob("*.md") if p.name.lower() != "readme.md"}

    assert slugs == md_files
    assert slugs == set(PILLAR_BY_SLUG)
    for post in posts:
        assert post.title
        assert post.excerpt
        assert post.pillar in BLOG_PILLARS
        assert post.body_md.strip()


def test_load_posts_rejects_unknown_slug(tmp_path: Path) -> None:
    (tmp_path / "slug-tak-dikenal.md").write_text("# Judul\n\nIsi.\n", encoding="utf-8")

    with pytest.raises(SystemExit):
        load_posts(tmp_path)


def test_load_posts_rejects_markdown_image(tmp_path: Path) -> None:
    (tmp_path / "scan-ip-server.md").write_text(
        "# Judul\n\nIsi.\n\n![gambar](https://example.com/a.png)\n", encoding="utf-8"
    )

    with pytest.raises(SystemExit):
        load_posts(tmp_path)


def test_load_posts_rejects_missing_title(tmp_path: Path) -> None:
    (tmp_path / "scan-ip-server.md").write_text("Tanpa heading.\n", encoding="utf-8")

    with pytest.raises(SystemExit):
        load_posts(tmp_path)


def test_blog_seed_dir_env_overrides_the_repo_default(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("BLOG_SEED_DIR", str(tmp_path))

    reloaded = importlib.reload(seed_blog_posts)
    try:
        assert tmp_path == reloaded.BLOG_DIR
    finally:
        monkeypatch.delenv("BLOG_SEED_DIR")
        importlib.reload(seed_blog_posts)


def test_missing_directory_names_the_container_cause(tmp_path: Path) -> None:
    missing = tmp_path / "tidak-ada"

    with pytest.raises(SystemExit) as exc:
        load_posts(missing)

    message = str(exc.value)
    assert str(missing) in message
    assert "--dir" in message
    assert "BLOG_SEED_DIR" in message
