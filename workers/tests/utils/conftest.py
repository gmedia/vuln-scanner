"""Shared fixtures for workers utils tests."""

import sys
sys.path.insert(0, "/home/ubuntu/vuln-scanner/workers")

import json
from unittest.mock import MagicMock, AsyncMock, patch

import pytest


# ---------------------------------------------------------------------------
# Sample nmap XML fixtures
# ---------------------------------------------------------------------------

NMAP_XML_OPEN_PORTS = """<?xml version="1.0"?>
<nmaprun scanner="nmap" version="7.95">
  <host starttime="1700000000" endtime="1700000100">
    <status state="up" reason="syn-ack" reason_ttl="0"/>
    <address addr="192.168.1.1" addrtype="ipv4"/>
    <address addr="aa:bb:cc:dd:ee:ff" addrtype="mac" vendor="Intel"/>
    <hostnames>
      <hostname name="router.local" type="PTR"/>
    </hostnames>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open" reason="syn-ack" reason_ttl="0"/>
        <service name="ssh" product="OpenSSH" version="8.9p1" extrainfo="protocol 2.0" method="probed" conf="10"/>
      </port>
      <port protocol="tcp" portid="80">
        <state state="open" reason="syn-ack" reason_ttl="0"/>
        <service name="http" product="nginx" version="1.24.0" method="probed" conf="10"/>
      </port>
      <port protocol="tcp" portid="443">
        <state state="open" reason="syn-ack" reason_ttl="0"/>
        <service name="https" product="nginx" version="1.24.0" extrainfo="TLS" method="probed" conf="10"/>
      </port>
    </ports>
    <os>
      <osmatch name="Linux 5.15" accuracy="95" line="12345"/>
      <osmatch name="Linux 5.10" accuracy="80" line="12346"/>
    </os>
  </host>
</nmaprun>"""

NMAP_XML_CLOSED_PORTS = """<?xml version="1.0"?>
<nmaprun scanner="nmap" version="7.95">
  <host starttime="1700000000" endtime="1700000100">
    <status state="up" reason="syn-ack" reason_ttl="0"/>
    <address addr="10.0.0.1" addrtype="ipv4"/>
    <hostnames/>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="closed" reason="reset" reason_ttl="0"/>
        <service name="ssh" method="probed" conf="10"/>
      </port>
      <port protocol="tcp" portid="80">
        <state state="filtered" reason="no-response"/>
        <service name="http" method="probed" conf="10"/>
      </port>
    </ports>
  </host>
</nmaprun>"""

NMAP_XML_NO_HOSTS = """<?xml version="1.0"?>
<nmaprun scanner="nmap" version="7.95">
</nmaprun>"""

NMAP_XML_INVALID = "not xml at all%%%"

NMAP_XML_NO_OS = """<?xml version="1.0"?>
<nmaprun scanner="nmap" version="7.95">
  <host starttime="1700000000" endtime="1700000100">
    <status state="up" reason="syn-ack" reason_ttl="0"/>
    <address addr="10.0.0.1" addrtype="ipv4"/>
    <hostnames/>
    <ports>
      <port protocol="tcp" portid="8080">
        <state state="open" reason="syn-ack"/>
        <service name="http-proxy" method="probed" conf="10"/>
      </port>
    </ports>
  </host>
</nmaprun>"""


@pytest.fixture
def sample_nmap_xml_open():
    return NMAP_XML_OPEN_PORTS


@pytest.fixture
def sample_nmap_xml_closed():
    return NMAP_XML_CLOSED_PORTS


@pytest.fixture
def sample_nmap_xml_no_hosts():
    return NMAP_XML_NO_HOSTS


@pytest.fixture
def sample_nmap_xml_invalid():
    return NMAP_XML_INVALID


@pytest.fixture
def sample_nmap_xml_no_os():
    return NMAP_XML_NO_OS


# ---------------------------------------------------------------------------
# CVE / OSV sample data fixtures
# ---------------------------------------------------------------------------

SAMPLE_OSV_RESPONSE = {
    "vulns": [
        {
            "id": "GHSA-xxxx-xxxx-xxxx",
            "aliases": ["CVE-2024-1234"],
            "summary": "Example vulnerability in package",
            "details": "A vulnerability was discovered in package allowing RCE",
            "severity": [
                {"type": "CVSS_V3", "score": 8.5},
                {"type": "CVSS_V2", "score": 7.0},
            ],
            "database_specific": {"fixed_version": "2.0.1"},
            "references": [
                {"type": "FIX", "url": "https://github.com/example/commit/abc"},
                {"type": "ADVISORY", "url": "https://github.com/advisory/ghsa-xxxx"},
            ],
        },
        {
            "id": "CVE-2024-5678",
            "aliases": ["CVE-2024-5678"],
            "summary": "Another vulnerability",
            "severity": [
                {"type": "CVSS_V3", "score": 5.5},
            ],
            "references": [
                {"type": "ADVISORY", "url": "https://nvd.nist.gov/vuln/detail/CVE-2024-5678"},
            ],
        },
    ]
}

SAMPLE_OSV_RESPONSE_NO_CVSS = {
    "vulns": [
        {
            "id": "GHSA-aaaa-bbbb-cccc",
            "aliases": ["CVE-2024-9999"],
            "summary": "Vulnerability with no CVSS",
            "severity": [],
        },
    ]
}

SAMPLE_OSV_RESPONSE_ONLY_V2 = {
    "vulns": [
        {
            "id": "CVE-2024-1111",
            "aliases": ["CVE-2024-1111"],
            "summary": "Only V2 CVSS",
            "severity": [
                {"type": "CVSS_V2", "score": 6.2},
            ],
        },
    ]
}

SAMPLE_OSV_EMPTY = {"vulns": []}

SAMPLE_VULN_WITH_REMEDIATION = {
    "id": "CVE-2024-2222",
    "aliases": ["CVE-2024-2222"],
    "summary": "Vuln with fix commit",
    "severity": [{"type": "CVSS_V3", "score": 9.2}],
    "database_specific": {"fixed": "3.0.0"},
    "references": [
        {"type": "FIX", "url": "https://github.com/org/repo/commit/fix1"},
        {"type": "FIX", "url": "https://github.com/org/repo/commit/fix2"},
    ],
}

SAMPLE_VULN_NO_REMEDIATION = {
    "id": "CVE-2024-3333",
    "aliases": ["CVE-2024-3333"],
    "summary": "Vuln with no fix yet",
    "severity": [{"type": "CVSS_V3", "score": 7.0}],
    "database_specific": {},
    "references": [],
}

SAMPLE_VULN_ADVISORY_ONLY = {
    "id": "GHSA-cccc-dddd-eeee",
    "aliases": ["CVE-2024-4444"],
    "summary": "Vuln with advisory only",
    "severity": [{"type": "CVSS_V3", "score": 6.0}],
    "database_specific": {},
    "references": [
        {"type": "ADVISORY", "url": "https://nvd.nist.gov/vuln/detail/CVE-2024-4444"},
    ],
}


@pytest.fixture
def sample_osv_response():
    return SAMPLE_OSV_RESPONSE


@pytest.fixture
def sample_osv_response_no_cvss():
    return SAMPLE_OSV_RESPONSE_NO_CVSS


@pytest.fixture
def sample_osv_response_only_v2():
    return SAMPLE_OSV_RESPONSE_ONLY_V2


@pytest.fixture
def sample_osv_empty():
    return SAMPLE_OSV_EMPTY


@pytest.fixture
def sample_vuln_with_remediation():
    return SAMPLE_VULN_WITH_REMEDIATION


@pytest.fixture
def sample_vuln_no_remediation():
    return SAMPLE_VULN_NO_REMEDIATION


@pytest.fixture
def sample_vuln_advisory_only():
    return SAMPLE_VULN_ADVISORY_ONLY


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_redis():
    """Mock redis.Redis instance with get/setex/setup."""
    mock = MagicMock()
    mock.get.return_value = None  # cache miss by default
    return mock


@pytest.fixture
def mock_redis_hit():
    """Mock redis that returns cached vulns."""
    mock = MagicMock()
    mock.get.return_value = json.dumps(SAMPLE_OSV_RESPONSE["vulns"])
    return mock


@pytest.fixture
def mock_httpx_osv_success():
    """Mock httpx.AsyncClient that returns a successful OSV response."""
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = SAMPLE_OSV_RESPONSE
    mock_client.post.return_value = mock_response
    return mock_client


@pytest.fixture
def mock_httpx_osv_not_found():
    """Mock httpx.AsyncClient that returns 404."""
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_client.post.return_value = mock_response
    return mock_client


@pytest.fixture
def mock_httpx_osv_error():
    """Mock httpx.AsyncClient that raises an exception."""
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.post.side_effect = Exception("Connection error")
    return mock_client


# ---------------------------------------------------------------------------
# Android manifest fixture
# ---------------------------------------------------------------------------

SAMPLE_MANIFEST_XML = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.app"
    android:versionName="2.1.0"
    android:versionCode="42">
    <uses-sdk android:minSdkVersion="29" android:targetSdkVersion="34"/>
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <application
        android:allowBackup="false"
        android:debuggable="true"
        android:usesCleartextTraffic="true">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        <receiver android:name=".MyReceiver" android:exported="true"/>
        <service android:name=".MyService" android:exported="false"/>
    </application>
</manifest>"""

SAMPLE_MANIFEST_DEFAULT_BACKUP = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.otherapp"
    android:versionName="1.0.0"
    android:versionCode="1">
    <uses-sdk android:minSdkVersion="33" android:targetSdkVersion="33"/>
    <application>
        <activity android:name=".MainActivity"/>
    </application>
</manifest>"""

SAMPLE_MANIFEST_NO_EXPORTED = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.secure.app"
    android:versionName="3.0"
    android:versionCode="10">
    <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="31"/>
    <application android:allowBackup="false" android:debuggable="false">
    </application>
</manifest>"""


@pytest.fixture
def sample_manifest_path(tmp_path, sample_manifest_xml):
    path = tmp_path / "AndroidManifest.xml"
    path.write_text(sample_manifest_xml, encoding="utf-8")
    return str(path)


@pytest.fixture
def sample_manifest_xml():
    return SAMPLE_MANIFEST_XML


@pytest.fixture
def sample_manifest_default_backup():
    return SAMPLE_MANIFEST_DEFAULT_BACKUP


@pytest.fixture
def sample_manifest_no_exported():
    return SAMPLE_MANIFEST_NO_EXPORTED


# ---------------------------------------------------------------------------
# iOS plist fixture
# ---------------------------------------------------------------------------

SAMPLE_PLIST_DATA = {
    "CFBundleIdentifier": "com.example.iosapp",
    "CFBundleShortVersionString": "1.2.3",
    "CFBundleVersion": "45",
    "MinimumOSVersion": "15.0",
    "DTPlatformName": "iphoneos",
    "NSAppTransportSecurity": {
        "NSExceptionDomains": {
            "insecure.example.com": {},
            "api.oldbackend.com": {},
        },
        "NSAllowsArbitraryLoads": False,
    },
    "CFBundleURLTypes": [
        {
            "CFBundleURLSchemes": ["myapp", "myapp-auth"],
        },
    ],
}

SAMPLE_PLIST_ARBITRARY_LOADS = {
    "CFBundleIdentifier": "com.example.loose",
    "CFBundleShortVersionString": "2.0",
    "CFBundleVersion": "99",
    "MinimumOSVersion": "14.0",
    "DTPlatformName": "iphoneos",
    "NSAppTransportSecurity": {
        "NSAllowsArbitraryLoads": True,
    },
    "CFBundleURLTypes": [],
}

SAMPLE_PLIST_MINIMAL = {
    "CFBundleIdentifier": "com.tiny.app",
    "CFBundleShortVersionString": "1.0",
    "CFBundleVersion": "1",
    "MinimumOSVersion": "12.0",
    "DTPlatformName": "iphoneos",
}


@pytest.fixture
def sample_plist_data():
    return SAMPLE_PLIST_DATA


@pytest.fixture
def sample_plist_arbitrary_loads():
    return SAMPLE_PLIST_ARBITRARY_LOADS


@pytest.fixture
def sample_plist_minimal():
    return SAMPLE_PLIST_MINIMAL
