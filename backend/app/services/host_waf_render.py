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
    rule_1021 = (
        'SecRule REQUEST_URI "@rx (?i)/wp-content/debug\\\\.log" '
        "\"id:1021,phase:1,t:none,deny,status:403,msg:\\'sinexis.debug.log\\'\""
    )
    rule_1022 = (
        'SecRule REQUEST_URI "@rx (?i)/server-status" '
        "\"id:1022,phase:1,t:none,deny,status:403,msg:\\'sinexis.server.status\\'\""
    )
    rule_1023 = (
        'SecRule REQUEST_URI "@rx (?i)/vendor/phpunit" '
        "\"id:1023,phase:1,t:none,deny,status:403,msg:\\'sinexis.phpunit\\'\""
    )
    rule_1024 = (
        'SecRule REQUEST_URI "@rx (?i)/timthumb\\\\.php" '
        "\"id:1024,phase:1,t:none,deny,status:403,msg:\\'sinexis.timthumb\\'\""
    )
    rule_1025 = (
        'SecRule REQUEST_URI "@rx (?i)/actuator(/|$)" '
        "\"id:1025,phase:1,t:none,deny,status:403,msg:\\'sinexis.actuator\\'\""
    )
    rule_1026 = (
        'SecRule REQUEST_URI "@rx (?i)/telescope(/|$)" '
        "\"id:1026,phase:1,t:none,deny,status:403,msg:\\'sinexis.telescope\\'\""
    )
    rule_1027 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.DS_Store" '
        "\"id:1027,phase:1,t:none,deny,status:403,msg:\\'sinexis.dsstore\\'\""
    )
    rule_1028 = (
        'SecRule REQUEST_URI "@rx (?i)/wlwmanifest\\\\.xml" '
        "\"id:1028,phase:1,t:none,deny,status:403,msg:\\'sinexis.wlwmanifest\\'\""
    )
    rule_1029 = (
        'SecRule REQUEST_URI "@rx (?i)/wp-json/wp/v2/users" '
        "\"id:1029,phase:1,t:none,deny,status:403,msg:\\'sinexis.wpjson.users\\'\""
    )
    rule_1030 = (
        'SecRule REQUEST_URI "@rx (?i)/adminer\\\\.php" '
        "\"id:1030,phase:1,t:none,deny,status:403,msg:\\'sinexis.adminer\\'\""
    )
    rule_1031 = (
        'SecRule REQUEST_URI "@rx (?i)/elmah\\\\.axd" '
        "\"id:1031,phase:1,t:none,deny,status:403,msg:\\'sinexis.elmah\\'\""
    )
    rule_1032 = (
        'SecRule REQUEST_URI "@rx (?i)/manager/html" '
        "\"id:1032,phase:1,t:none,deny,status:403,msg:\\'sinexis.tomcat.manager\\'\""
    )
    rule_1033 = (
        'SecRule REQUEST_URI "@rx (?i)/solr/admin" '
        "\"id:1033,phase:1,t:none,deny,status:403,msg:\\'sinexis.solr.admin\\'\""
    )
    rule_1034 = (
        'SecRule REQUEST_URI "@rx (?i)/jenkins(/|$)" '
        "\"id:1034,phase:1,t:none,deny,status:403,msg:\\'sinexis.jenkins\\'\""
    )
    rule_1035 = (
        'SecRule REQUEST_URI "@rx (?i)/jmx-console" '
        "\"id:1035,phase:1,t:none,deny,status:403,msg:\\'sinexis.jmx.console\\'\""
    )
    rule_1036 = (
        'SecRule REQUEST_URI "@rx (?i)/trace\\\\.axd" '
        "\"id:1036,phase:1,t:none,deny,status:403,msg:\\'sinexis.trace.axd\\'\""
    )
    rule_1037 = (
        'SecRule REQUEST_URI "@rx (?i)/\\\\.svn/entries" '
        "\"id:1037,phase:1,t:none,deny,status:403,msg:\\'sinexis.svn.entries\\'\""
    )
    rule_1038 = (
        'SecRule REQUEST_URI "@rx (?i)/invoker/JMXInvokerServlet" '
        "\"id:1038,phase:1,t:none,deny,status:403,msg:\\'sinexis.jmx.invoker\\'\""
    )
    rule_1039 = (
        'SecRule REQUEST_URI "@rx (?i)/web\\\\.config" '
        "\"id:1039,phase:1,t:none,deny,status:403,msg:\\'sinexis.web.config\\'\""
    )
    rule_1040 = (
        'SecRule REQUEST_URI "@rx (?i)/server-info" '
        "\"id:1040,phase:1,t:none,deny,status:403,msg:\\'sinexis.server.info\\'\""
    )
    rule_1041 = (
        'SecRule REQUEST_URI "@rx (?i)/axis2/axis2-admin" '
        "\"id:1041,phase:1,t:none,deny,status:403,msg:\\'sinexis.axis2.admin\\'\""
    )
    rule_1042 = (
        'SecRule REQUEST_URI "@rx (?i)/console(/|$)" '
        "\"id:1042,phase:1,t:none,deny,status:403,msg:\\'sinexis.weblogic.console\\'\""
    )
    rule_1043 = (
        'SecRule REQUEST_URI "@rx (?i)/CFIDE/administrator" '
        "\"id:1043,phase:1,t:none,deny,status:403,msg:\\'sinexis.cfide.admin\\'\""
    )
    rule_1044 = (
        'SecRule REQUEST_URI "@rx (?i)/_profiler(/|$)" '
        "\"id:1044,phase:1,t:none,deny,status:403,msg:\\'sinexis.symfony.profiler\\'\""
    )
    rule_1045 = (
        'SecRule REQUEST_URI "@rx (?i)/crossdomain\\\\.xml" '
        "\"id:1045,phase:1,t:none,deny,status:403,msg:\\'sinexis.crossdomain\\'\""
    )
    rule_1046 = (
        'SecRule REQUEST_URI "@rx (?i)/clientaccesspolicy\\\\.xml" '
        "\"id:1046,phase:1,t:none,deny,status:403,msg:\\'sinexis.clientaccesspolicy\\'\""
    )
    rule_1047 = (
        'SecRule REQUEST_URI "@rx (?i)/debug/default/view" '
        "\"id:1047,phase:1,t:none,deny,status:403,msg:\\'sinexis.django.debug\\'\""
    )
    rule_1048 = (
        'SecRule REQUEST_URI "@rx (?i)/actuator/heapdump" '
        "\"id:1048,phase:1,t:none,deny,status:403,msg:\\'sinexis.actuator.heapdump\\'\""
    )
    rule_1049 = (
        'SecRule REQUEST_URI "@rx (?i)/elmah\\\\.axd" '
        "\"id:1049,phase:1,t:none,deny,status:403,msg:\\'sinexis.elmah\\'\""
    )
    rule_1050 = (
        'SecRule REQUEST_URI "@rx (?i)/trace\\\\.axd" '
        "\"id:1050,phase:1,t:none,deny,status:403,msg:\\'sinexis.trace.axd\\'\""
    )
    rule_1051 = (
        'SecRule REQUEST_URI "@rx (?i)/\\\\.hg/store" '
        "\"id:1051,phase:1,t:none,deny,status:403,msg:\\'sinexis.hg.store\\'\""
    )
    rule_1052 = (
        'SecRule REQUEST_URI "@rx (?i)/\\\\.bzr/branch" '
        "\"id:1052,phase:1,t:none,deny,status:403,msg:\\'sinexis.bzr.branch\\'\""
    )
    rule_1053 = (
        'SecRule REQUEST_URI "@rx (?i)/web\\.config\\.bak" '
        "\"id:1053,phase:1,t:none,deny,status:403,msg:\\'sinexis.webconfig.bak\\'\""
    )
    rule_1054 = (
        'SecRule REQUEST_URI "@rx (?i)/backup\\.zip" '
        "\"id:1054,phase:1,t:none,deny,status:403,msg:\\'sinexis.backup.zip\\'\""
    )
    rule_1055 = (
        'SecRule REQUEST_URI "@rx (?i)/wp-config\\.php\\.bak" '
        "\"id:1055,phase:1,t:none,deny,status:403,msg:\\'sinexis.wpconfig.bak\\'\""
    )
    rule_1056 = (
        'SecRule REQUEST_URI "@rx (?i)/pma(/|$)" "id:1056,phase:1,t:none,deny,status:403,msg:\\\'sinexis.pma\\\'"'
    )
    rule_1057 = (
        'SecRule REQUEST_URI "@rx (?i)/myadmin(/|$)" '
        "\"id:1057,phase:1,t:none,deny,status:403,msg:\\'sinexis.myadmin\\'\""
    )
    rule_1058 = (
        'SecRule REQUEST_URI "@rx (?i)/administrator(/|$)" '
        "\"id:1058,phase:1,t:none,deny,status:403,msg:\\'sinexis.joomla.admin\\'\""
    )
    rule_1059 = (
        'SecRule REQUEST_URI "@rx (?i)/user/login" '
        "\"id:1059,phase:1,t:none,deny,status:403,msg:\\'sinexis.drupal.login\\'\""
    )
    rule_1060 = (
        'SecRule REQUEST_URI "@rx (?i)/__debug__/" '
        "\"id:1060,phase:1,t:none,deny,status:403,msg:\\'sinexis.flask.debug\\'\""
    )
    rule_1061 = (
        'SecRule REQUEST_URI "@rx (?i)/rails/info/properties" '
        "\"id:1061,phase:1,t:none,deny,status:403,msg:\\'sinexis.rails.info\\'\""
    )
    rule_1062 = (
        'SecRule REQUEST_URI "@rx (?i)/_ignition" "id:1062,phase:1,t:none,deny,status:403,msg:\\\'sinexis.ignition\\\'"'
    )
    rule_1063 = (
        'SecRule REQUEST_URI "@rx (?i)/horizon(/|$)" '
        "\"id:1063,phase:1,t:none,deny,status:403,msg:\\'sinexis.horizon\\'\""
    )
    rule_1064 = (
        'SecRule REQUEST_URI "@rx (?i)/nova(/|$)" "id:1064,phase:1,t:none,deny,status:403,msg:\\\'sinexis.nova\\\'"'
    )
    rule_1065 = (
        'SecRule REQUEST_URI "@rx (?i)/jolokia" "id:1065,phase:1,t:none,deny,status:403,msg:\\\'sinexis.jolokia\\\'"'
    )
    rule_1066 = (
        'SecRule REQUEST_URI "@rx (?i)/hawtio" "id:1066,phase:1,t:none,deny,status:403,msg:\\\'sinexis.hawtio\\\'"'
    )
    rule_1067 = (
        'SecRule REQUEST_URI "@rx (?i)/web-console" '
        "\"id:1067,phase:1,t:none,deny,status:403,msg:\\'sinexis.web.console\\'\""
    )
    rule_1068 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.aws/credentials" '
        "\"id:1068,phase:1,t:none,deny,status:403,msg:\\'sinexis.aws.credentials\\'\""
    )
    rule_1069 = (
        'SecRule REQUEST_URI "@rx (?i)/id_rsa" "id:1069,phase:1,t:none,deny,status:403,msg:\\\'sinexis.id.rsa\\\'"'
    )
    rule_1070 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.ssh/" "id:1070,phase:1,t:none,deny,status:403,msg:\\\'sinexis.dotssh\\\'"'
    )
    rule_1071 = (
        'SecRule REQUEST_URI "@rx (?i)/aspnet_client/" '
        "\"id:1071,phase:1,t:none,deny,status:403,msg:\\'sinexis.aspnet.client\\'\""
    )
    rule_1072 = (
        'SecRule REQUEST_URI "@rx (?i)/php\\.ini" "id:1072,phase:1,t:none,deny,status:403,msg:\\\'sinexis.php.ini\\\'"'
    )
    rule_1073 = (
        'SecRule REQUEST_URI "@rx (?i)/config\\.php\\.bak" '
        "\"id:1073,phase:1,t:none,deny,status:403,msg:\\'sinexis.config.bak\\'\""
    )
    rule_1074 = (
        'SecRule REQUEST_URI "@rx (?i)/backup\\.tar\\.gz" '
        "\"id:1074,phase:1,t:none,deny,status:403,msg:\\'sinexis.backup.tgz\\'\""
    )
    rule_1075 = (
        'SecRule REQUEST_URI "@rx (?i)/sftp-config\\.json" '
        "\"id:1075,phase:1,t:none,deny,status:403,msg:\\'sinexis.sftp.config\\'\""
    )
    rule_1076 = (
        'SecRule REQUEST_URI "@rx (?i)/Thumbs\\.db" '
        "\"id:1076,phase:1,t:none,deny,status:403,msg:\\'sinexis.thumbs.db\\'\""
    )
    rule_1077 = (
        'SecRule REQUEST_URI "@rx (?i)/CVS/Root" "id:1077,phase:1,t:none,deny,status:403,msg:\\\'sinexis.cvs.root\\\'"'
    )
    rule_1078 = (
        'SecRule REQUEST_URI "@rx (?i)/WEB-INF/web\\.xml" '
        "\"id:1078,phase:1,t:none,deny,status:403,msg:\\'sinexis.webinf.webxml\\'\""
    )
    rule_1079 = (
        'SecRule REQUEST_URI "@rx (?i)/META-INF/context\\.xml" '
        "\"id:1079,phase:1,t:none,deny,status:403,msg:\\'sinexis.metainf.context\\'\""
    )
    rule_1080 = (
        'SecRule REQUEST_URI "@rx (?i)/struts2-rest-showcase" '
        "\"id:1080,phase:1,t:none,deny,status:403,msg:\\'sinexis.struts.showcase\\'\""
    )
    rule_1081 = (
        'SecRule REQUEST_URI "@rx (?i)/resin-admin" '
        "\"id:1081,phase:1,t:none,deny,status:403,msg:\\'sinexis.resin.admin\\'\""
    )
    rule_1082 = (
        'SecRule REQUEST_URI "@rx (?i)/_debugbar" "id:1082,phase:1,t:none,deny,status:403,msg:\\\'sinexis.debugbar\\\'"'
    )
    rule_1083 = (
        'SecRule REQUEST_URI "@rx (?i)/phpminiadmin" '
        "\"id:1083,phase:1,t:none,deny,status:403,msg:\\'sinexis.phpminiadmin\\'\""
    )
    rule_1084 = (
        'SecRule REQUEST_URI "@rx (?i)/sqlbuddy" "id:1084,phase:1,t:none,deny,status:403,msg:\\\'sinexis.sqlbuddy\\\'"'
    )
    rule_1085 = (
        'SecRule REQUEST_URI "@rx (?i)/docker-compose\\.yml" '
        "\"id:1085,phase:1,t:none,deny,status:403,msg:\\'sinexis.docker.compose\\'\""
    )
    rule_1086 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.dockerignore" '
        "\"id:1086,phase:1,t:none,deny,status:403,msg:\\'sinexis.dockerignore\\'\""
    )
    rule_1087 = (
        'SecRule REQUEST_URI "@rx (?i)/id_dsa" "id:1087,phase:1,t:none,deny,status:403,msg:\\\'sinexis.id.dsa\\\'"'
    )
    rule_1088 = (
        'SecRule REQUEST_URI "@rx (?i)/authorized_keys" '
        "\"id:1088,phase:1,t:none,deny,status:403,msg:\\'sinexis.authorized.keys\\'\""
    )
    rule_1089 = (
        'SecRule REQUEST_URI "@rx (?i)/wp-config\\.php\\.old" '
        "\"id:1089,phase:1,t:none,deny,status:403,msg:\\'sinexis.wpconfig.old\\'\""
    )
    rule_1090 = (
        'SecRule REQUEST_URI "@rx (?i)/settings\\.py" '
        "\"id:1090,phase:1,t:none,deny,status:403,msg:\\'sinexis.settings.py\\'\""
    )
    rule_1091 = (
        'SecRule REQUEST_URI "@rx (?i)/application\\.yml" '
        "\"id:1091,phase:1,t:none,deny,status:403,msg:\\'sinexis.application.yml\\'\""
    )
    rule_1092 = (
        'SecRule REQUEST_URI "@rx (?i)/localsettings\\.php" '
        "\"id:1092,phase:1,t:none,deny,status:403,msg:\\'sinexis.localsettings\\'\""
    )
    rule_1093 = (
        'SecRule REQUEST_URI "@rx (?i)/sites/default/settings\\.php" '
        "\"id:1093,phase:1,t:none,deny,status:403,msg:\\'sinexis.drupal.settings\\'\""
    )
    rule_1094 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.hgignore" '
        "\"id:1094,phase:1,t:none,deny,status:403,msg:\\'sinexis.hgignore\\'\""
    )
    rule_1095 = (
        'SecRule REQUEST_URI "@rx (?i)/glassfish" '
        "\"id:1095,phase:1,t:none,deny,status:403,msg:\\'sinexis.glassfish\\'\""
    )
    rule_1096 = (
        'SecRule REQUEST_URI "@rx (?i)/solr/select" '
        "\"id:1096,phase:1,t:none,deny,status:403,msg:\\'sinexis.solr.select\\'\""
    )
    rule_1097 = (
        'SecRule REQUEST_URI "@rx (?i)/host-manager/html" '
        "\"id:1097,phase:1,t:none,deny,status:403,msg:\\'sinexis.tomcat.hostmanager\\'\""
    )
    rule_1098 = (
        'SecRule REQUEST_URI "@rx (?i)/jmxrmi" "id:1098,phase:1,t:none,deny,status:403,msg:\\\'sinexis.jmxrmi\\\'"'
    )
    rule_1099 = (
        'SecRule REQUEST_URI "@rx (?i)/manager/status" '
        "\"id:1099,phase:1,t:none,deny,status:403,msg:\\'sinexis.tomcat.status\\'\""
    )
    rule_1100 = (
        'SecRule REQUEST_URI "@rx (?i)/nginx_status" '
        "\"id:1100,phase:1,t:none,deny,status:403,msg:\\'sinexis.nginx.status\\'\""
    )
    rule_1101 = (
        'SecRule REQUEST_URI "@rx (?i)/fckeditor" '
        "\"id:1101,phase:1,t:none,deny,status:403,msg:\\'sinexis.fckeditor\\'\""
    )
    rule_1102 = (
        'SecRule REQUEST_URI "@rx (?i)/ckfinder" "id:1102,phase:1,t:none,deny,status:403,msg:\\\'sinexis.ckfinder\\\'"'
    )
    rule_1103 = (
        'SecRule REQUEST_URI "@rx (?i)/tiny_mce(/|$|[?])" '
        "\"id:1103,phase:1,t:none,deny,status:403,msg:\\'sinexis.tinymce\\'\""
    )
    rule_1104 = (
        'SecRule REQUEST_URI "@rx (?i)/xmlrpc\\.php\\.bak" '
        "\"id:1104,phase:1,t:none,deny,status:403,msg:\\'sinexis.xmlrpc.bak\\'\""
    )
    rule_1105 = (
        'SecRule REQUEST_URI "@rx (?i)/config\\.json($|[?])" '
        "\"id:1105,phase:1,t:none,deny,status:403,msg:\\'sinexis.config.json\\'\""
    )
    rule_1106 = (
        'SecRule REQUEST_URI "@rx (?i)/secrets\\.yml" '
        "\"id:1106,phase:1,t:none,deny,status:403,msg:\\'sinexis.secrets.yml\\'\""
    )
    rule_1107 = (
        'SecRule REQUEST_URI "@rx (?i)/database\\.yml" '
        "\"id:1107,phase:1,t:none,deny,status:403,msg:\\'sinexis.database.yml\\'\""
    )
    rule_1108 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.npmrc" "id:1108,phase:1,t:none,deny,status:403,msg:\\\'sinexis.npmrc\\\'"'
    )
    rule_1109 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.yarnrc" "id:1109,phase:1,t:none,deny,status:403,msg:\\\'sinexis.yarnrc\\\'"'
    )
    rule_1110 = (
        'SecRule REQUEST_URI "@rx (?i)/package-lock\\.json" '
        "\"id:1110,phase:1,t:none,deny,status:403,msg:\\'sinexis.packagelock\\'\""
    )
    rule_1111 = (
        'SecRule REQUEST_URI "@rx (?i)/yarn\\.lock" '
        "\"id:1111,phase:1,t:none,deny,status:403,msg:\\'sinexis.yarn.lock\\'\""
    )
    rule_1112 = (
        'SecRule REQUEST_URI "@rx (?i)/Gemfile($|[/?])" '
        "\"id:1112,phase:1,t:none,deny,status:403,msg:\\'sinexis.gemfile\\'\""
    )
    rule_1113 = (
        'SecRule REQUEST_URI "@rx (?i)/Procfile" "id:1113,phase:1,t:none,deny,status:403,msg:\\\'sinexis.procfile\\\'"'
    )
    rule_1114 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.travis\\.yml" '
        "\"id:1114,phase:1,t:none,deny,status:403,msg:\\'sinexis.travis\\'\""
    )
    rule_1115 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.gitlab-ci\\.yml" '
        "\"id:1115,phase:1,t:none,deny,status:403,msg:\\'sinexis.gitlabci\\'\""
    )
    rule_1116 = (
        'SecRule REQUEST_URI "@rx (?i)/bitbucket-pipelines\\.yml" '
        "\"id:1116,phase:1,t:none,deny,status:403,msg:\\'sinexis.bitbucket.pipelines\\'\""
    )
    rule_1117 = (
        'SecRule REQUEST_URI "@rx (?i)/error_log($|[/?])" '
        "\"id:1117,phase:1,t:none,deny,status:403,msg:\\'sinexis.error.log\\'\""
    )
    rule_1118 = (
        'SecRule REQUEST_URI "@rx (?i)/php_error\\.log" '
        "\"id:1118,phase:1,t:none,deny,status:403,msg:\\'sinexis.php.errorlog\\'\""
    )
    rule_1119 = (
        'SecRule REQUEST_URI "@rx (?i)/storage/logs/laravel\\.log" '
        "\"id:1119,phase:1,t:none,deny,status:403,msg:\\'sinexis.laravel.log\\'\""
    )
    rule_1120 = (
        'SecRule REQUEST_URI "@rx (?i)/webmail(/|$)" '
        "\"id:1120,phase:1,t:none,deny,status:403,msg:\\'sinexis.webmail\\'\""
    )
    rule_1121 = (
        'SecRule REQUEST_URI "@rx (?i)/roundcube(/|$|[?])" '
        "\"id:1121,phase:1,t:none,deny,status:403,msg:\\'sinexis.roundcube\\'\""
    )
    rule_1122 = (
        'SecRule REQUEST_URI "@rx (?i)/squirrelmail(/|$|[?])" '
        "\"id:1122,phase:1,t:none,deny,status:403,msg:\\'sinexis.squirrelmail\\'\""
    )
    rule_1123 = (
        'SecRule REQUEST_URI "@rx (?i)/zabbix(/|$)" "id:1123,phase:1,t:none,deny,status:403,msg:\\\'sinexis.zabbix\\\'"'
    )
    rule_1124 = (
        'SecRule REQUEST_URI "@rx (?i)/nagios(/|$)" "id:1124,phase:1,t:none,deny,status:403,msg:\\\'sinexis.nagios\\\'"'
    )
    rule_1125 = (
        'SecRule REQUEST_URI "@rx (?i)/grafana(/|$)" '
        "\"id:1125,phase:1,t:none,deny,status:403,msg:\\'sinexis.grafana\\'\""
    )
    rule_1126 = (
        'SecRule REQUEST_URI "@rx (?i)/prometheus(/|$)" '
        "\"id:1126,phase:1,t:none,deny,status:403,msg:\\'sinexis.prometheus\\'\""
    )
    rule_1127 = (
        'SecRule REQUEST_URI "@rx (?i)/kibana(/|$)" "id:1127,phase:1,t:none,deny,status:403,msg:\\\'sinexis.kibana\\\'"'
    )
    rule_1128 = (
        'SecRule REQUEST_URI "@rx (?i)/_cat/indices" '
        "\"id:1128,phase:1,t:none,deny,status:403,msg:\\'sinexis.es.cat\\'\""
    )
    rule_1129 = (
        'SecRule REQUEST_URI "@rx (?i)/minio(/|$)" "id:1129,phase:1,t:none,deny,status:403,msg:\\\'sinexis.minio\\\'"'
    )
    rule_1130 = (
        'SecRule REQUEST_URI "@rx (?i)/portainer" '
        "\"id:1130,phase:1,t:none,deny,status:403,msg:\\'sinexis.portainer\\'\""
    )
    rule_1131 = (
        'SecRule REQUEST_URI "@rx (?i)/consul(/|$)" "id:1131,phase:1,t:none,deny,status:403,msg:\\\'sinexis.consul\\\'"'
    )
    rule_1132 = (
        'SecRule REQUEST_URI "@rx (?i)/vault/ui" "id:1132,phase:1,t:none,deny,status:403,msg:\\\'sinexis.vault.ui\\\'"'
    )
    rule_1133 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.kube/config" '
        "\"id:1133,phase:1,t:none,deny,status:403,msg:\\'sinexis.kube.config\\'\""
    )
    rule_1134 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.docker/config\\.json" '
        "\"id:1134,phase:1,t:none,deny,status:403,msg:\\'sinexis.docker.config\\'\""
    )
    rule_1135 = (
        'SecRule REQUEST_URI "@rx (?i)/wp-content/uploads/dump\\.sql" '
        "\"id:1135,phase:1,t:none,deny,status:403,msg:\\'sinexis.wp.dump\\'\""
    )
    rule_1136 = (
        'SecRule REQUEST_URI "@rx (?i)/backup\\.sql\\.gz" '
        "\"id:1136,phase:1,t:none,deny,status:403,msg:\\'sinexis.backup.sqlgz\\'\""
    )
    rule_1137 = (
        'SecRule REQUEST_URI "@rx (?i)/phpmyadmin/setup" '
        "\"id:1137,phase:1,t:none,deny,status:403,msg:\\'sinexis.pma.setup\\'\""
    )
    rule_1138 = (
        'SecRule REQUEST_URI "@rx (?i)/setup\\.php($|[?])" '
        "\"id:1138,phase:1,t:none,deny,status:403,msg:\\'sinexis.setup.php\\'\""
    )
    rule_1139 = (
        'SecRule REQUEST_URI "@rx (?i)/install\\.php($|[?])" '
        "\"id:1139,phase:1,t:none,deny,status:403,msg:\\'sinexis.install.php\\'\""
    )
    rule_1140 = (
        'SecRule REQUEST_URI "@rx (?i)/solr/update" '
        "\"id:1140,phase:1,t:none,deny,status:403,msg:\\'sinexis.solr.update\\'\""
    )
    rule_1141 = (
        'SecRule REQUEST_URI "@rx (?i)/\\.env\\.local" '
        "\"id:1141,phase:1,t:none,deny,status:403,msg:\\'sinexis.env.local\\'\""
    )
    rule_1142 = (
        'SecRule REQUEST_URI "@rx (?i)/web\\.config($|[/?])" '
        "\"id:1142,phase:1,t:none,deny,status:403,msg:\\'sinexis.web.config\\'\""
    )
    rule_1143 = (
        'SecRule REQUEST_URI "@rx (?i)/configuration\\.php($|[?])" '
        "\"id:1143,phase:1,t:none,deny,status:403,msg:\\'sinexis.joomla.config\\'\""
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
    {rule_1021}
    {rule_1022}
    {rule_1023}
    {rule_1024}
    {rule_1025}
    {rule_1026}
     {rule_1027}
     {rule_1028}
     {rule_1029}
     {rule_1030}
     {rule_1031}
     {rule_1032}
     {rule_1033}
     {rule_1034}
     {rule_1035}
     {rule_1036}
     {rule_1037}
     {rule_1038}
     {rule_1039}
     {rule_1040}
     {rule_1041}
     {rule_1042}
     {rule_1043}
     {rule_1044}
     {rule_1045}
     {rule_1046}
     {rule_1047}
     {rule_1048}
     {rule_1049}
      {rule_1050}
      {rule_1051}
      {rule_1052}
      {rule_1053}
      {rule_1054}
      {rule_1055}
      {rule_1056}
      {rule_1057}
      {rule_1058}
      {rule_1059}
      {rule_1060}
      {rule_1061}
      {rule_1062}
      {rule_1063}
      {rule_1064}
      {rule_1065}
      {rule_1066}
      {rule_1067}
      {rule_1068}
      {rule_1069}
      {rule_1070}
      {rule_1071}
      {rule_1072}
      {rule_1073}
      {rule_1074}
      {rule_1075}
      {rule_1076}
      {rule_1077}
      {rule_1078}
      {rule_1079}
      {rule_1080}
      {rule_1081}
      {rule_1082}
      {rule_1083}
      {rule_1084}
      {rule_1085}
      {rule_1086}
      {rule_1087}
      {rule_1088}
      {rule_1089}
      {rule_1090}
      {rule_1091}
      {rule_1092}
      {rule_1093}
      {rule_1094}
       {rule_1095}
       {rule_1096}
       {rule_1097}
       {rule_1098}
       {rule_1099}
       {rule_1100}
       {rule_1101}
       {rule_1102}
       {rule_1103}
       {rule_1104}
       {rule_1105}
       {rule_1106}
       {rule_1107}
       {rule_1108}
       {rule_1109}
       {rule_1110}
       {rule_1111}
       {rule_1112}
       {rule_1113}
       {rule_1114}
       {rule_1115}
       {rule_1116}
       {rule_1117}
       {rule_1118}
       {rule_1119}
       {rule_1120}
       {rule_1121}
       {rule_1122}
       {rule_1123}
       {rule_1124}
       {rule_1125}
       {rule_1126}
       {rule_1127}
       {rule_1128}
       {rule_1129}
       {rule_1130}
       {rule_1131}
       {rule_1132}
       {rule_1133}
       {rule_1134}
       {rule_1135}
       {rule_1136}
       {rule_1137}
       {rule_1138}
       {rule_1139}
        {rule_1140}
        {rule_1141}
        {rule_1142}
        {rule_1143}
        {extra}';
# Paranoia {paranoia}: keep starter rules only. Do not raise to 4 in v1.
"""


def render_coraza_include(policy: HostWafPolicy, site: HostSite) -> str:
    body = render_nginx_modsec(policy, site)
    return body.replace("ModSecurity (or Coraza spoa)", "Coraza (or nginx ModSecurity)")
