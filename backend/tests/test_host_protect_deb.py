from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "scripts" / "build-host-protect-deb.sh"


@pytest.mark.skipif(shutil.which("dpkg-deb") is None, reason="dpkg-deb not on PATH")
def test_build_deb_contents(tmp_path: Path) -> None:
    env = os.environ.copy()
    env["HOST_PROTECT_DEB_OUT"] = str(tmp_path)
    env["HOST_PROTECT_DEB_VERSION"] = "0.1.0-test"
    out = subprocess.check_output(["bash", str(BUILD)], env=env, text=True).strip()
    deb = Path(out)
    assert deb.is_file()
    assert deb.name == "sinexis-host-protect_0.1.0-test_all.deb"
    info = subprocess.check_output(["dpkg-deb", "-I", str(deb)], text=True)
    assert "Package: sinexis-host-protect" in info
    assert "Depends: wazuh-agent, python3" in info
    assert "Architecture: all" in info
    names = subprocess.check_output(["dpkg-deb", "-c", str(deb)], text=True)
    assert "./usr/lib/sinexis/host-protect/sinexis_host_scan.py" in names
    assert "./usr/lib/sinexis/host-protect/rules/php_webshell.yar" in names
    assert "./usr/lib/systemd/system/sinexis-host-protect@.service" in names
    assert "./usr/lib/systemd/system/sinexis-host-protect@.timer" in names
    data = subprocess.check_output(["dpkg-deb", "--fsys-tarfile", str(deb)])
    with tarfile.open(fileobj=__import__("io").BytesIO(data), mode="r:") as tf:
        script = tf.extractfile("./usr/lib/sinexis/host-protect/sinexis_host_scan.py")
        assert script is not None
        body = script.read()
        assert b"run_quarantine" in body
        assert b"LOCK_EX" in body
        unit = tf.extractfile("./usr/lib/systemd/system/sinexis-host-protect@.service")
        assert unit is not None
        unit_body = unit.read()
        assert b"flock -n" not in unit_body
        assert b"StartLimitIntervalSec=0" in unit_body
        env_ex = tf.extractfile("./usr/share/doc/sinexis-host-protect/host-protect.env.example")
        assert env_ex is not None
        env_body = env_ex.read()
        assert b"SINEXIS_HOST_AGENT_TOKEN" in env_body
        assert b"secret" not in env_body.lower()
