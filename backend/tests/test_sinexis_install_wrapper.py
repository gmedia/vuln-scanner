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
    assert "Show setup status" in proc.stdout or "prints setup status" in proc.stdout.lower()


def test_wrapper_executable_bit() -> None:
    mode = WRAPPER.stat().st_mode
    assert mode & stat.S_IXUSR
