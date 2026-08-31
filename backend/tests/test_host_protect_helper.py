from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

HELPER_DIR = Path(__file__).resolve().parents[2] / "packaging" / "host-protect-helper"
sys.path.insert(0, str(HELPER_DIR))

import sinexis_host_scan as helper  # noqa: E402


def test_outside_jail_nonzero_no_post(monkeypatch: pytest.MonkeyPatch):
    posted: list[object] = []

    def boom(*_a, **_k):
        posted.append(1)
        raise AssertionError("must not POST")

    monkeypatch.setattr(helper, "post_results", boom)
    rc = helper.run(
        [
            "--root",
            "/tmp/not-allowlisted",
            "--scan-id",
            "00000000-0000-0000-0000-000000000001",
            "--agent-id",
            "00000000-0000-0000-0000-000000000002",
            "--api-base",
            "https://example.invalid",
            "--token",
            "tok",
        ]
    )
    assert rc == 2
    assert posted == []


def test_needles_hit_dry_run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "cache.php").write_text("<?php eval($_POST['x']); ?>", encoding="utf-8")
    out = tmp_path / "out.json"
    rc = helper.run(
        [
            "--root",
            str(tmp_path),
            "--scan-id",
            "11111111-1111-1111-1111-111111111111",
            "--agent-id",
            "22222222-2222-2222-2222-222222222222",
            "--rules-dir",
            str(HELPER_DIR / "rules"),
            "--dry-run",
            "--json-out",
            str(out),
        ]
    )
    assert rc == 0
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["engine"] in ("needles", "yara")
    assert any(
        f["rel_path"].endswith("cache.php") and f["rule_id"] == "sinexis.php.eval_post" for f in payload["findings"]
    )
    assert all("class" in f and "sha256" in f for f in payload["findings"])


def test_missing_dir_nonzero(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", ("/var/www",))
    rc = helper.run(
        [
            "--root",
            "/var/www/host-protect-missing-s10-xyz",
            "--scan-id",
            "00000000-0000-0000-0000-000000000001",
            "--agent-id",
            "00000000-0000-0000-0000-000000000002",
            "--dry-run",
        ]
    )
    assert rc == 3


def test_post_called_on_success(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    (tmp_path / "ok.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    mock_post = MagicMock(return_value=200)
    monkeypatch.setattr(helper, "post_results", mock_post)
    rc = helper.run(
        [
            "--root",
            str(tmp_path),
            "--scan-id",
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "--agent-id",
            "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "--api-base",
            "https://example.invalid",
            "--token",
            "secret-token",
            "--rules-dir",
            str(HELPER_DIR / "rules"),
        ]
    )
    assert rc == 0
    mock_post.assert_called_once()
    args = mock_post.call_args[0]
    assert args[0] == "https://example.invalid"
    assert args[1] == "secret-token"
    payload = args[2]
    assert payload["engine"] in ("needles", "yara")
    assert payload["scan_id"] == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def test_yara_optional_without_binary(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper.shutil, "which", lambda _n: None)
    assert helper.yara_available() is False
