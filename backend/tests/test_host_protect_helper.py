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


def test_poll_fetches_and_scans(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    (tmp_path / "ok.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    mock_post = MagicMock(return_value=200)
    monkeypatch.setattr(helper, "post_results", mock_post)
    monkeypatch.setattr(
        helper,
        "fetch_jobs",
        lambda *_a, **_k: (
            1,
            [{"kind": "scan", "scan_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "root_path": str(tmp_path)}],
        ),
    )
    rc = helper.run(
        [
            "poll",
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
    mock_post.assert_called()


def test_poll_missing_creds():
    rc = helper.run(["poll", "--agent-id", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"])
    assert rc == 4


def test_http_headers_include_user_agent():
    headers = helper._agent_headers("tok")
    assert headers["User-Agent"] == helper.USER_AGENT
    assert headers["X-Host-Agent-Token"] == "tok"
    json_headers = helper._agent_headers("tok", json_body=True)
    assert json_headers["Content-Type"] == "application/json"
    assert json_headers["User-Agent"] == helper.USER_AGENT


def test_yara_optional_without_binary(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper.shutil, "which", lambda _n: None)
    assert helper.yara_available() is False


def test_clam_skips_without_binary(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper.shutil, "which", lambda _n: None)
    assert helper.clam_binary() is None
    assert helper.scan_clam("/var/www/html") == []


def test_clam_parses_found(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    infected = tmp_path / "eicar.txt"
    infected.write_text("eicar", encoding="utf-8")
    monkeypatch.setattr(helper, "clam_binary", lambda: "/usr/bin/clamscan")

    class Fake:
        stdout = f"{infected}: Win.Test.EICAR_HDB-1 FOUND\n"

    monkeypatch.setattr(helper.subprocess, "run", lambda *_a, **_k: Fake())
    hits = helper.scan_clam(str(tmp_path))
    assert hits[0]["class"] == "malware"
    assert hits[0]["rule_id"].startswith("clam.")
    assert hits[0]["rel_path"] == "eicar.txt"


def test_quarantine_restore_jail(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path / "www"),))
    web = tmp_path / "www"
    uploads = web / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    src = uploads / "cache.php"
    src.write_text("evil", encoding="utf-8")
    qroot = tmp_path / "libq"
    rc = helper.run(
        [
            "quarantine",
            "--root",
            str(web),
            "--rel-path",
            "wp-content/uploads/cache.php",
            "--site-id",
            "site-a",
            "--dest-basename",
            "abcd1234_cache.php",
            "--quarantine-root",
            str(qroot),
        ]
    )
    assert rc == 0
    assert not src.exists()
    dest = qroot / "site-a" / "abcd1234_cache.php"
    assert dest.is_file()
    assert oct(dest.parent.stat().st_mode)[-3:] == "700"
    rc2 = helper.run(
        [
            "restore",
            "--root",
            str(web),
            "--rel-path",
            "wp-content/uploads/cache.php",
            "--site-id",
            "site-a",
            "--dest-basename",
            "abcd1234_cache.php",
            "--quarantine-root",
            str(qroot),
        ]
    )
    assert rc2 == 0
    assert src.is_file()
    assert not dest.exists()
    rc3 = helper.run(
        [
            "quarantine",
            "--root",
            str(web),
            "--rel-path",
            "wp-content/uploads/cache.php",
            "--site-id",
            "site-a",
            "--dest-basename",
            "abcd1234_cache.php",
            "--quarantine-root",
            str(qroot),
        ]
    )
    assert rc3 == 0
    rc4 = helper.run(
        [
            "quarantine",
            "--root",
            str(web),
            "--rel-path",
            "wp-content/uploads/cache.php",
            "--site-id",
            "site-a",
            "--dest-basename",
            "abcd1234_cache.php",
            "--quarantine-root",
            str(qroot),
        ]
    )
    assert rc4 == 0


def test_quarantine_src_and_dest_conflict(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path / "www"),))
    web = tmp_path / "www"
    uploads = web / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    src = uploads / "cache.php"
    src.write_text("new", encoding="utf-8")
    qroot = tmp_path / "libq"
    dest_dir = qroot / "site-a"
    dest_dir.mkdir(parents=True)
    (dest_dir / "abcd1234_cache.php").write_text("old", encoding="utf-8")
    rc = helper.run(
        [
            "quarantine",
            "--root",
            str(web),
            "--rel-path",
            "wp-content/uploads/cache.php",
            "--site-id",
            "site-a",
            "--dest-basename",
            "abcd1234_cache.php",
            "--quarantine-root",
            str(qroot),
        ]
    )
    assert rc == 6
    assert src.is_file()


def test_poll_runs_quarantine_and_acks(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SINEXIS_POLL_LOCK_DIR", str(tmp_path / "locks"))
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path / "www"),))
    web = tmp_path / "www"
    uploads = web / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    src = uploads / "cache.php"
    src.write_text("evil", encoding="utf-8")
    qroot = tmp_path / "libq"
    ack = MagicMock(return_value=200)
    monkeypatch.setattr(helper, "post_command_ack", ack)
    monkeypatch.setattr(
        helper,
        "fetch_jobs",
        lambda *_a, **_k: (
            1,
            [
                {
                    "kind": "quarantine",
                    "command_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    "root_path": str(web),
                    "rel_path": "wp-content/uploads/cache.php",
                    "dest_basename": "abcd1234_cache.php",
                    "site_id": "site-a",
                }
            ],
        ),
    )
    rc = helper.run(
        [
            "poll",
            "--agent-id",
            "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "--api-base",
            "https://example.invalid",
            "--token",
            "secret-token",
            "--quarantine-root",
            str(qroot),
        ]
    )
    assert rc == 0
    assert not src.exists()
    ack.assert_called_once()
    assert ack.call_args[0][3] == "cccccccc-cccc-cccc-cccc-cccccccccccc"
    assert ack.call_args[0][4] is True


def test_quarantine_outside_jail(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", ("/var/www",))
    rc = helper.run(
        [
            "quarantine",
            "--root",
            "/tmp/not-www",
            "--rel-path",
            "x.php",
            "--site-id",
            "s1",
            "--dest-basename",
            "aa_x.php",
            "--quarantine-root",
            str(tmp_path / "q"),
        ]
    )
    assert rc == 2


def test_quarantine_missing_file_no_move(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path / "www"),))
    web = tmp_path / "www"
    web.mkdir()
    rc = helper.run(
        [
            "quarantine",
            "--root",
            str(web),
            "--rel-path",
            "gone.php",
            "--site-id",
            "s1",
            "--dest-basename",
            "aa_gone.php",
            "--quarantine-root",
            str(tmp_path / "q"),
        ]
    )
    assert rc == 6
    assert not (tmp_path / "q" / "s1").exists() or not any((tmp_path / "q" / "s1").iterdir())
