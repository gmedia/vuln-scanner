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


def test_scan_local_root_missing_dir_empty():
    assert scan_local_root("/var/www/host-protect-missing-dir-xyz") == []
