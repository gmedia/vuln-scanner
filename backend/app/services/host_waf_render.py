"""Generate on-box WAF snippets from Host WAF policy.

SaaS does not SSH. Operators copy the snippet onto the **customer VPS**
(or a disposable lab vhost). Never emit listen IPs or request bodies.
"""

from __future__ import annotations

from app.models.host_protect import HostSite
from app.models.host_waf import HostWafPolicy

_ENGINE_MAP = {
    "off": "Off",
    "detect": "DetectionOnly",
    "protect": "On",
}


def render_nginx_modsec(policy: HostWafPolicy, site: HostSite) -> str:
    engine = _ENGINE_MAP.get(policy.mode, "Off")
    paranoia = max(1, min(4, int(policy.paranoia)))
    root = site.root_path.replace("\n", "").replace("\r", "")[:256]
    name = site.name.replace("\n", "").replace("\r", "")[:80]
    return f"""# Sinexis Host WAF generated snippet — do not paste onto sinexis.app edge nginx.
# Site: {name}
# Document root (ops): {root}
# Engine field: {policy.engine}  mode: {policy.mode}  paranoia: {paranoia}
# Mode protect → SecRuleEngine On (403 deny). detect → DetectionOnly (log). off → Off.
# Install: customer VPS or disposable lab vhost only. No SSH from SaaS.

# Requires nginx + ModSecurity (or Coraza spoa) on the **tenant** host.
# CRS overlay is ops-owned; this file is a tiny starter, not Imunify/CRS dump.

modsecurity on;
modsecurity_rules '
SecRuleEngine {engine}
SecRequestBodyAccess Off
SecResponseBodyAccess Off
SecRule REQUEST_URI "@beginsWith /xmlrpc.php" "id:1001,phase:1,t:none,deny,status:403,msg:\\'mock.xmlrpc\\'"
SecRule ARGS "@rx (?i)(union\\\\s+select|or\\\\s+1=1)" "id:1002,phase:2,t:none,deny,status:403,msg:\\'mock.sqli.1\\'"
SecRule REQUEST_URI "@rx \\\\.\\\\./" "id:1003,phase:1,t:none,deny,status:403,msg:\\'mock.rce.path\\'"
'
# Paranoia {paranoia}: keep starter rules only. Do not raise to 4 in v1.
"""


def render_coraza_include(policy: HostWafPolicy, site: HostSite) -> str:
    body = render_nginx_modsec(policy, site)
    return body.replace("ModSecurity (or Coraza spoa)", "Coraza (or nginx ModSecurity)")
