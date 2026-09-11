from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WRAPPER = ROOT / "packaging" / "host-protect-helper" / "sinexis-install.sh"
UUID = "781602eb-7337-4a1c-9875-9222e9880985"


def _run(args: list[str], env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    merged = os.environ.copy()
    if env:
        merged.update(env)
    return subprocess.run(
        ["bash", str(WRAPPER), *args],
        capture_output=True,
        text=True,
        env=merged,
        check=False,
    )


def test_wrapper_dry_run_ok(tmp_path: Path) -> None:
    tok = tmp_path / "tok"
    tok.write_text("lab-token-not-secret-shape\n", encoding="utf-8")
    os.chmod(tok, 0o600)
    proc = _run(
        [
            "--dry-run",
            "--skip-wazuh-check",
            "--agent-id",
            UUID,
            "--token-file",
            str(tok),
            "--api-base",
            "https://sinexis.app",
        ]
    )
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "lab-token-not-secret-shape" not in combined
    assert "dry-run: copy helper tree" in combined
    assert f"sinexis-host-protect@{UUID}.timer" in combined
    assert "token not printed" in combined


def test_wrapper_dry_run_wazuh_agent() -> None:
    proc = _run(
        [
            "--dry-run",
            "--install-wazuh-agent",
            "--manager-host",
            "example.invalid",
        ]
    )
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "dry-run: install wazuh-agent" in combined
    assert "example.invalid" in combined


def test_wrapper_help_mentions_menu() -> None:
    proc = _run(["--help"])
    assert proc.returncode == 0
    assert "Install wazuh-agent" in proc.stdout
    assert "Configure Host Protect helper" in proc.stdout
    assert "Write Host WAF nginx snippet" in proc.stdout
    assert "--write-waf-snippet" in proc.stdout
    assert "--apply-waf-vhost" in proc.stdout
    assert "curl|bash" in proc.stdout or "curl | bash" in proc.stdout


def test_wrapper_write_waf_snippet_dry_run() -> None:
    proc = _run(["--dry-run", "--write-waf-snippet"])
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "sinexis-waf.snippet.conf" in combined
    assert "no include" in combined
    assert "nginx reload" in combined


def test_wrapper_write_waf_snippet_file(tmp_path: Path) -> None:
    dest = tmp_path / "sinexis-waf.snippet.conf"
    proc = _run(
        [
            "--write-waf-snippet",
            "--waf-snippet-path",
            str(dest),
        ]
    )
    assert proc.returncode == 0, proc.stderr
    text = dest.read_text(encoding="utf-8")
    assert "Do not paste onto sinexis.app" in text
    assert "does not add an include" in text
    assert "modsecurity on;" in text
    assert "id:1005" in text
    assert "id:1006" in text
    assert "id:1007" in text
    assert "id:1008" in text
    assert "id:1009" in text
    assert "id:1010" in text
    assert "id:1011" in text
    assert "id:1012" in text
    assert "id:1013" in text
    assert "id:1014" in text
    assert "id:1015" in text
    assert "id:1016" in text
    assert "id:1017" in text
    assert "id:1018" in text
    assert "id:1019" in text
    assert "id:1020" in text
    assert "id:1021" in text
    assert "id:1022" in text
    assert "id:1023" in text
    assert "id:1024" in text
    assert "id:1025" in text
    assert "id:1026" in text
    assert "id:1027" in text
    assert "id:1028" in text
    assert "id:1029" in text
    assert "id:1030" in text
    assert "id:1031" in text
    assert "id:1032" in text
    assert "id:1033" in text
    assert "id:1034" in text
    assert "id:1035" in text
    assert "id:1036" in text
    assert "id:1037" in text
    assert "id:1038" in text
    assert "id:1039" in text
    assert "id:1040" in text
    assert "id:1041" in text
    assert "id:1042" in text
    assert "id:1043" in text
    assert "id:1044" in text
    assert "id:1045" in text
    assert "id:1046" in text
    assert "id:1047" in text
    assert "id:1048" in text
    assert "id:1049" in text
    assert "id:1050" in text
    assert "id:1051" in text
    assert "id:1095" in text
    assert "id:1096" in text
    for _rid in range(1097, 1144):
        assert f"id:{_rid}" in text
    assert "/solr/update" in text
    assert "/solr/#/" not in text
    assert "wp-admin" not in text
    assert text.count("modsecurity on;") == 1
    assert text.count("modsecurity_rules '") >= 2
    bodies: list[str] = []
    marker = "modsecurity_rules '"
    start = 0
    while True:
        i = text.find(marker, start)
        if i < 0:
            break
        i += len(marker)
        j = text.find("';", i)
        assert j > i
        bodies.append(text[i:j])
        start = j + 2
    assert len(bodies) >= 2
    for body in bodies:
        assert len(body) <= 3500
        assert "modsecurity on;" not in body
    chain_hits = [body for body in bodies if "id:1005" in body]
    assert len(chain_hits) == 1
    assert "SecRule REQUEST_METHOD" in chain_hits[0]
    assert "SecRule ARGS" in chain_hits[0]
    combined = proc.stdout + proc.stderr
    assert "No nginx reload" in combined


def test_wrapper_apply_waf_vhost_dry_run() -> None:
    proc = _run(
        [
            "--dry-run",
            "--apply-waf-vhost",
            "/etc/nginx/sites-enabled/customer.conf",
        ]
    )
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "include" in combined
    assert "customer.conf" in combined
    assert "reload" in combined


def test_wrapper_apply_waf_vhost_refuses_edge() -> None:
    proc = _run(["--dry-run", "--apply-waf-vhost", "/etc/nginx/sinexis.app.conf"])
    assert proc.returncode != 0
    assert "edge" in (proc.stdout + proc.stderr).lower()


def test_wrapper_apply_waf_vhost_requires_path() -> None:
    proc = _run(["--apply-waf-vhost"])
    assert proc.returncode != 0


def _insert_waf_python() -> str:
    text = WRAPPER.read_text(encoding="utf-8")
    marker = "insert_waf_include() {"
    start = text.index(marker)
    py_start = text.index("python3 - <<'PY'\n", start) + len("python3 - <<'PY'\n")
    py_end = text.index("\nPY\n", py_start)
    return text[py_start:py_end]


def test_insert_waf_include_all_server_blocks(tmp_path: Path) -> None:
    vhost = tmp_path / "erp.appmedia.id.conf"
    vhost.write_text(
        "server {\n"
        "    include /etc/nginx/sinexis-waf.snippet.conf;\n"
        "  listen 80;\n"
        "  server_name erp.appmedia.id;\n"
        "  return 308 https://erp.appmedia.id$request_uri;\n"
        "}\n"
        "map $http_upgrade $connection_upgrade {\n"
        "    default upgrade;\n"
        "    ''      close;\n"
        "}\n"
        "server {\n"
        "  listen 443 ssl http2;\n"
        "  server_name erp.appmedia.id;\n"
        "}\n",
        encoding="utf-8",
    )
    snippet = "/etc/nginx/sinexis-waf.snippet.conf"
    env = os.environ.copy()
    env["VHOST_PATH"] = str(vhost)
    env["SNIPPET_PATH"] = snippet
    proc = subprocess.run(
        ["python3", "-c", _insert_waf_python()],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == "inserted-1"
    body = vhost.read_text(encoding="utf-8")
    assert body.count(snippet) == 2
    needle = "include /etc/nginx/sinexis-waf.snippet.conf;"
    assert needle in body.split("listen 443", 1)[0]
    proc2 = subprocess.run(
        ["python3", "-c", _insert_waf_python()],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert proc2.stdout.strip() == "already-included"


def test_insert_waf_include_idempotent_single_server(tmp_path: Path) -> None:
    vhost = tmp_path / "site.conf"
    vhost.write_text("server {\n  listen 80;\n}\n", encoding="utf-8")
    env = os.environ.copy()
    env["VHOST_PATH"] = str(vhost)
    env["SNIPPET_PATH"] = "/etc/nginx/sinexis-waf.snippet.conf"
    proc = subprocess.run(
        ["python3", "-c", _insert_waf_python()],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == "inserted-1"
    assert vhost.read_text(encoding="utf-8").count("sinexis-waf.snippet.conf") == 1


def test_wrapper_rejects_http_api() -> None:
    proc = _run(
        [
            "--dry-run",
            "--agent-id",
            UUID,
            "--token-file",
            "/dev/null",
            "--api-base",
            "http://example.invalid",
        ]
    )
    assert proc.returncode != 0
    assert "https://" in proc.stderr


def test_wrapper_rejects_bad_uuid(tmp_path: Path) -> None:
    tok = tmp_path / "tok"
    tok.write_text("x", encoding="utf-8")
    proc = _run(["--dry-run", "--agent-id", "not-a-uuid", "--token-file", str(tok)])
    assert proc.returncode != 0
    assert "invalid --agent-id" in proc.stderr


def test_wrapper_status_prints_setup() -> None:
    proc = _run(["--status"])
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "Setup status" in combined
    assert "wazuh-agent:" in combined
    assert "Host Protect helper:" in combined
    assert "WAF snippet file:" in combined
    assert "WAF include in site vhost:" in combined
    assert "token" in combined.lower()
    assert "lab-token" not in combined


def test_wrapper_help_mentions_status_force() -> None:
    proc = _run(["--help"])
    assert proc.returncode == 0
    assert "--status" in proc.stdout
    assert "--force" in proc.stdout
    assert "--configure-waf-ingest" in proc.stdout
    assert "--poll-once" in proc.stdout
    assert "Show setup status" in proc.stdout or "prints setup status" in proc.stdout.lower()


def test_wrapper_poll_once_dry_run() -> None:
    proc = _run(["--dry-run", "--poll-once", "--agent-id", UUID])
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert f"sinexis-host-protect@{UUID}.service" in combined
    assert "no journal dump" in combined


def test_wrapper_configure_waf_ingest_dry_run() -> None:
    site = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    proc = _run(
        [
            "--dry-run",
            "--configure-waf-ingest",
            "--waf-site-id",
            site,
            "--agent-id",
            UUID,
        ]
    )
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "SINEXIS_WAF_SITE_ID" in combined
    assert "token not printed" in combined.lower() or "UUID not printed" in combined
    assert site not in combined or "not printed" in combined


def test_wrapper_status_mentions_waf_ingest() -> None:
    proc = _run(["--status"])
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "WAF ingest site UUID" in combined
    assert "WAF audit log" in combined
    assert "WAF audit log size" in combined or "WAF audit cursor" in combined


def test_wrapper_status_mentions_auto_detect_audit() -> None:
    proc = _run(["--status"])
    assert proc.returncode == 0, proc.stderr
    combined = proc.stdout + proc.stderr
    assert "auto-detects" in combined or "nginx" in combined.lower()


def test_wrapper_help_mentions_auto_audit() -> None:
    proc = _run(["--help"])
    assert proc.returncode == 0
    assert "auto:" in proc.stdout or "nginx path" in proc.stdout


def test_embedded_unit_allows_nginx_modsec_audit() -> None:
    text = WRAPPER.read_text(encoding="utf-8")
    marker = "SINEXIS_B64_SVC='"
    start = text.index(marker) + len(marker)
    end = text.index("'\nSINEXIS_B64_TMR=")
    blob = text[start:end].replace("\n", "")
    import base64

    unit = base64.b64decode(blob).decode("utf-8")
    assert "ReadOnlyPaths=" in unit
    assert "/var/log/nginx/modsec_audit_log" in unit
    disk = (ROOT / "packaging/host-protect-helper/systemd/sinexis-host-protect@.service").read_text(encoding="utf-8")
    assert "/var/log/nginx/modsec_audit_log" in disk


def test_wrapper_executable_bit() -> None:
    mode = WRAPPER.stat().st_mode
    assert mode & stat.S_IXUSR
