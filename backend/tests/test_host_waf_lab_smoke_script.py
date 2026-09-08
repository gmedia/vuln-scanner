from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "host-waf-lab-smoke.sh"


def test_lab_script_safety_markers():
    text = SCRIPT.read_text(encoding="utf-8")
    assert SCRIPT.is_file()
    assert "Does not paste onto sinexis.app" in text
    assert "HOST_WAF_LAB_VHOST_SSH" in text
    assert "tc5" in text
    assert "sx-erpstg" in text
    assert "do not paste onto sinexis.app" in text
    assert "HOST_WAF_LAB_VHOST_SSH:-tc5" in text
    assert "--apply-vhost requires HOST_WAF_LAB_VHOST_SSH" in text
    assert "nginx/sinexis.app.conf" in text
    assert "refuses ERP" in text
    assert "tc5 OK" in text
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
    assert "must not match /wp-admin/" in text
    assert "POST /wp-login.php" in text
