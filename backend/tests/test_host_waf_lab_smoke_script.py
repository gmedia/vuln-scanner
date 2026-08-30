from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "host-waf-lab-smoke.sh"


def test_lab_script_safety_markers():
    text = SCRIPT.read_text(encoding="utf-8")
    assert SCRIPT.is_file()
    assert "Does not SSH to tc5" in text
    assert "HOST_WAF_LAB_VHOST_SSH" in text
    assert "tc5" in text
    assert "sx-erpstg" in text
    assert "do not paste onto sinexis.app" in text
    assert "GUARD_LAB_AGENT_SSH:-tc5" not in text
    assert "--apply-vhost requires HOST_WAF_LAB_VHOST_SSH" in text
    assert "nginx/sinexis.app.conf" in text
