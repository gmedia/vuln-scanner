"""The edge decides `X-Robots-Tag`, not the app.

nginx knows the request `Host`, so its `map` is the only place that can tell a
platform host (`index, follow`) from a customer host (`noindex`). The app does
not know the host, so a header it emits is a second, contradictory source of
truth: on a customer host `/blog` answered with both `index, follow` and
`noindex, nofollow, nosnippet, noarchive` before this guard existed.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "backend" / "app"
NGINX = ROOT / "nginx" / "sinexis.app.conf"


def test_no_backend_module_sets_x_robots_tag():
    offenders = sorted(
        str(path.relative_to(ROOT))
        for path in APP.rglob("*.py")
        if "x-robots-tag" in path.read_text(encoding="utf-8").lower()
    )
    assert offenders == [], f"X-Robots-Tag must come from nginx only; found in {offenders}"


def test_edge_emits_exactly_one_robots_header_with_always():
    conf = NGINX.read_text(encoding="utf-8")
    directives = re.findall(r"^\s*add_header\s+X-Robots-Tag\s+.*$", conf, re.M | re.I)
    assert len(directives) == 1, f"expected one site-wide X-Robots-Tag, found {directives}"
    assert directives[0].rstrip().endswith("always;"), (
        "must use `always`: a bare add_header is skipped on 404/405, which are "
        "exactly the customer-host responses that need noindex"
    )


def test_customer_hosts_default_to_noindex():
    conf = NGINX.read_text(encoding="utf-8")
    block = re.search(r"map \$host \$robots_for_host \{(.*?)\}", conf, re.S)
    assert block, "map $host $robots_for_host is missing"
    body = block.group(1)
    assert re.search(r'default\s+"noindex', body), "unknown hosts must default to noindex"
    assert re.search(r'sinexis\.app\s+"index, follow"', body)


def test_html_islands_do_not_answer_with_their_own_robots_header(client):
    for path in ("/terms", "/privacy", "/blog"):
        resp = client.get(path)
        assert resp.status_code == 200, path
        assert "x-robots-tag" not in resp.headers, (
            f"{path} answered with its own X-Robots-Tag; the edge must be the only source"
        )
