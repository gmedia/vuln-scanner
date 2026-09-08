from types import SimpleNamespace

from app.services.host_waf_render import is_lab_waf_site, render_nginx_modsec


def _site(*, name: str, root: str) -> SimpleNamespace:
    return SimpleNamespace(name=name, root_path=root)


def _policy(*, mode: str = "protect") -> SimpleNamespace:
    return SimpleNamespace(mode=mode, engine="nginx_modsec", paranoia=1)


def test_lab_fixture_snippet_has_probe_rule():
    site = _site(name="lab-host-waf-fixture", root="/var/www/host-waf-fixture")
    assert is_lab_waf_site(site) is True
    text = render_nginx_modsec(_policy(), site)
    assert "LAB fixture" in text
    assert "/sinexis-waf-lab" in text
    assert "mock.lab.probe" in text
    assert "do not paste onto sinexis.app" in text
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
    assert "wp-admin" not in text
    assert "listen" not in text.lower()
    assert "modsecurity_rules '" in text
    assert text.rstrip().endswith("v1.") or "';" in text
    assert "';" in text.split("modsecurity_rules", 1)[1]


def test_customer_snippet_omits_lab_probe():
    site = _site(name="web", root="/var/www/html")
    assert is_lab_waf_site(site) is False
    text = render_nginx_modsec(_policy(), site)
    assert "customer VPS" in text
    assert "/sinexis-waf-lab" not in text
    assert "mock.lab.probe" not in text
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
    assert "wp-admin" not in text
    assert "do not paste onto sinexis.app" in text


def test_erp_root_is_not_lab():
    site = _site(name="lab-host-waf-fixture", root="/var/www/sx-erpstg")
    assert is_lab_waf_site(site) is False
