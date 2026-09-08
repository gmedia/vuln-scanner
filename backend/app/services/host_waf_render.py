"""Generate on-box WAF snippets from Host WAF policy.

SaaS does not SSH. Operators copy the snippet onto the **customer VPS**
or the **Sinexis lab agent VM** (tc5-class fixture). Never emit listen IPs
or request bodies. Never target ERP / sx-erpstg.
"""

from __future__ import annotations

from app.models.host_protect import HostSite
from app.models.host_waf import HostWafPolicy

_ENGINE_MAP = {
    "off": "Off",
    "detect": "DetectionOnly",
    "protect": "On",
}

_LAB_ROOT_MARKERS = (
    "/var/www/host-waf-fixture",
    "/var/www/host-protect-fixture",
    "/srv/www/host-waf-fixture",
)


def is_lab_waf_site(site: HostSite) -> bool:
    root = (site.root_path or "").replace("\n", "").replace("\r", "")
    name = (site.name or "").lower()
    if "erp" in root.lower() or "sx-erpstg" in root.lower():
        return False
    if any(root.startswith(m) for m in _LAB_ROOT_MARKERS):
        return True
    return name.startswith("lab-host-waf")


def render_nginx_modsec(policy: HostWafPolicy, site: HostSite) -> str:
    engine = _ENGINE_MAP.get(policy.mode, "Off")
    paranoia = max(1, min(4, int(policy.paranoia)))
    root = site.root_path.replace("\n", "").replace("\r", "")[:256]
    name = site.name.replace("\n", "").replace("\r", "")[:80]
    lab = is_lab_waf_site(site)
    if lab:
        header = f"""# Sinexis Host WAF — LAB fixture snippet (Guard agent VM / tc5-class).
# do not paste onto sinexis.app edge nginx. Not for ERP / sx-erpstg.
# Site: {name}
# Document root (lab fixture): {root}
# Engine field: {policy.engine}  mode: {policy.mode}  paranoia: {paranoia}
# Mode protect → SecRuleEngine On (403 deny). detect → DetectionOnly (log). off → Off.
# Install: include on a disposable lab vhost on the Sinexis agent VM only.

# Requires nginx + ModSecurity (or Coraza spoa) on the lab VM.
# Extra rule /sinexis-waf-lab is lab-only (matches Simulate path). Not a customer probe.
"""
        extra = (
            'SecRule REQUEST_URI "@beginsWith /sinexis-waf-lab" '
            "\"id:1004,phase:1,t:none,deny,status:403,msg:\\'mock.lab.probe\\'\"\n"
        )
    else:
        header = f"""# Sinexis Host WAF generated snippet — customer VPS only.
# do not paste onto sinexis.app edge nginx. Do not install on ERP / sx-erpstg.
# Site: {name}
# Document root (ops): {root}
# Engine field: {policy.engine}  mode: {policy.mode}  paranoia: {paranoia}
# Mode protect → SecRuleEngine On (403 deny). detect → DetectionOnly (log). off → Off.
# Install: customer VPS nginx vhost. No SSH from SaaS. Not the Sinexis lab fixture.

# Requires nginx + ModSecurity (or Coraza spoa) on the **tenant** host.
# CRS overlay is ops-owned; this file is a tiny starter, not Imunify/CRS dump.
"""
        extra = ""
    rule_1005 = (
        'SecRule REQUEST_URI "@beginsWith /wp-login.php" '
        '"id:1005,phase:1,t:none,deny,status:403,'
        "msg:\\'sinexis.wplogin.payload\\',chain\""
    )
    rule_1006 = (
        'SecRule REQUEST_URI "@rx (?i)(eval\\\\s*\\\\(|base64_decode\\\\s*\\\\()" '
        "\"id:1006,phase:1,t:none,deny,status:403,msg:\\'sinexis.php.wrapper\\'\""
    )
    rule_1007 = (
        'SecRule REQUEST_URI "@beginsWith /wp-cron.php" '
        "\"id:1007,phase:1,t:none,deny,status:403,msg:\\'sinexis.wpcron\\'\""
    )
    rule_1008 = (
        'SecRule REQUEST_URI "@rx (?i)(php://|data://)" '
        "\"id:1008,phase:1,t:none,deny,status:403,msg:\\'sinexis.uri.wrapper\\'\""
    )
    rule_1009 = (
        'SecRule REQUEST_URI "@rx (?i)/\\\\.(env|git)(/|$)" '
        "\"id:1009,phase:1,t:none,deny,status:403,msg:\\'sinexis.dotfile\\'\""
    )
    rule_1010 = (
        'SecRule REQUEST_URI "@rx (?i)/phpinfo\\\\.php" '
        "\"id:1010,phase:1,t:none,deny,status:403,msg:\\'sinexis.phpinfo\\'\""
    )
    rule_1011 = (
        'SecRule REQUEST_URI "@rx (?i)/wp-config\\\\.php" '
        "\"id:1011,phase:1,t:none,deny,status:403,msg:\\'sinexis.wpconfig\\'\""
    )
    rule_1012 = (
        'SecRule REQUEST_URI "@rx (?i)/\\\\.htaccess" '
        "\"id:1012,phase:1,t:none,deny,status:403,msg:\\'sinexis.htaccess\\'\""
    )
    rule_1013 = (
        'SecRule REQUEST_URI "@rx (?i)/composer\\\\.json" '
        "\"id:1013,phase:1,t:none,deny,status:403,msg:\\'sinexis.composerjson\\'\""
    )
    rule_1014 = (
        'SecRule REQUEST_URI "@rx (?i)\\\\.(sql|sql\\\\.gz)$" '
        "\"id:1014,phase:1,t:none,deny,status:403,msg:\\'sinexis.sqldump\\'\""
    )
    rule_1015 = (
        'SecRule REQUEST_URI "@rx (?i)/uploads/.+\\\\.(php|phtml|phar)([/?]|$)" '
        "\"id:1015,phase:1,t:none,deny,status:403,msg:\\'sinexis.php.upload\\'\""
    )
    rule_1016 = (
        'SecRule REQUEST_METHOD "@rx (?i)^(PUT|DELETE|PATCH|TRACE|CONNECT)$" '
        "\"id:1016,phase:1,t:none,deny,status:403,msg:\\'sinexis.method.unusual\\'\""
    )
    rule_1017 = (
        'SecRule REQUEST_HEADERS:X-Forwarded-For "@rx (^|,\\\\s*)127\\\\.0\\\\.0\\\\.1" '
        "\"id:1017,phase:1,t:none,deny,status:403,msg:\\'sinexis.xff.loopback\\'\""
    )
    rule_1018 = (
        'SecRule REQUEST_URI "@rx (?i)/phpmyadmin" '
        "\"id:1018,phase:1,t:none,deny,status:403,msg:\\'sinexis.phpmyadmin\\'\""
    )
    rule_1019 = (
        'SecRule REQUEST_URI "@rx (?i)/cgi-bin/" "id:1019,phase:1,t:none,deny,status:403,msg:\\\'sinexis.cgibin\\\'"'
    )
    rule_1020 = (
        'SecRule REQUEST_HEADERS:User-Agent "@rx \\(\\)\\\\s*\\\\{" '
        "\"id:1020,phase:1,t:none,deny,status:403,msg:\\'sinexis.ua.shellshock\\'\""
    )
    args_chain = (
        'SecRule ARGS "@rx (?i)(union\\\\s+select|or\\\\s+1=1|eval\\\\s*\\\\(|base64_decode\\\\s*\\\\()" "t:none"'
    )
    return f"""{header}
modsecurity on;
modsecurity_rules '
SecRuleEngine {engine}
SecRequestBodyAccess Off
SecResponseBodyAccess Off
SecRule REQUEST_URI "@beginsWith /xmlrpc.php" "id:1001,phase:1,t:none,deny,status:403,msg:\\'sinexis.xmlrpc\\'"
SecRule ARGS "@rx (?i)(union\\\\s+select|or\\\\s+1=1)" "id:1002,phase:2,t:none,deny,status:403,msg:\\'sinexis.sqli\\'"
SecRule REQUEST_URI "@rx \\\\.\\\\./" "id:1003,phase:1,t:none,deny,status:403,msg:\\'sinexis.path.traversal\\'"
{rule_1005}
SecRule REQUEST_METHOD "@streq POST" "t:none,chain"
{args_chain}
{rule_1006}
{rule_1007}
{rule_1008}
    {rule_1009}
    {rule_1010}
    {rule_1011}
    {rule_1012}
    {rule_1013}
    {rule_1014}
    {rule_1015}
    {rule_1016}
    {rule_1017}
    {rule_1018}
    {rule_1019}
    {rule_1020}
    {extra}';
# Paranoia {paranoia}: keep starter rules only. Do not raise to 4 in v1.
"""


def render_coraza_include(policy: HostWafPolicy, site: HostSite) -> str:
    body = render_nginx_modsec(policy, site)
    return body.replace("ModSecurity (or Coraza spoa)", "Coraza (or nginx ModSecurity)")
