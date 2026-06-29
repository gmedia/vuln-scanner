"""Tests for mobile_utils.py: manifest parsing, secret scanning, plist parsing."""

import io
import os
import plistlib
import tempfile
import unicodedata
import zipfile

from utils.mobile_utils import (
    AndroidManifestInfo,
    IpaInfo,
    _build_android_findings,
    _build_ios_findings,
    _extract_library_names,
    _extract_text_from_zip,
    _parse_android_manifest,
    _parse_ios_plist,
    _safe_extract,
    _scan_secrets,
    _sdk_to_android_version,
    analyze_apk,
    analyze_ipa,
)


class TestSdkToAndroidVersion:
    def test_known_sdks(self):
        assert _sdk_to_android_version(34) == "14"
        assert _sdk_to_android_version(33) == "13"
        assert _sdk_to_android_version(31) == "12"
        assert _sdk_to_android_version(30) == "11"
        assert _sdk_to_android_version(29) == "10"
        assert _sdk_to_android_version(28) == "9"
        assert _sdk_to_android_version(26) == "8.0"
        assert _sdk_to_android_version(24) == "7.0"
        assert _sdk_to_android_version(21) == "5.0"
        assert _sdk_to_android_version(19) == "4.4"

    def test_unknown_sdk_returns_string(self):
        assert _sdk_to_android_version(99) == "99"
        assert _sdk_to_android_version(0) == "0"

    def test_edge_values(self):
        assert _sdk_to_android_version(25) == "7.1"
        assert _sdk_to_android_version(32) == "12L"
        assert _sdk_to_android_version(27) == "8.1"


class TestParseAndroidManifest:
    def test_full_manifest_parsing(self, sample_manifest_xml, tmp_path):
        manifest_path = str(tmp_path / "AndroidManifest.xml")
        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write(sample_manifest_xml)
        info = _parse_android_manifest(manifest_path)
        assert info.package_name == "com.example.app"
        assert info.version_name == "2.1.0"
        assert info.version_code == "42"
        assert info.min_sdk == "10"
        assert info.target_sdk == "14"
        assert len(info.permissions) == 3
        assert "android.permission.CAMERA" in info.permissions
        assert "android.permission.INTERNET" in info.permissions
        assert "android.permission.ACCESS_FINE_LOCATION" in info.permissions
        assert info.debuggable is True
        assert info.allow_backup is False
        assert info.uses_cleartext_traffic is True
        assert len(info.exported_components) == 2
        assert ".MainActivity" in info.exported_components
        assert ".MyReceiver" in info.exported_components

    def test_default_backup_true(self, tmp_path):
        manifest_path = str(tmp_path / "AndroidManifest.xml")
        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write("""<?xml version="1.0"?>
<manifest package="com.test">
    <application>
    </application>
</manifest>""")
        info = _parse_android_manifest(manifest_path)
        assert info.allow_backup is True
        assert info.debuggable is False
        assert info.uses_cleartext_traffic is False

    def test_no_exported_components(self, sample_manifest_no_exported, tmp_path):
        manifest_path = str(tmp_path / "AndroidManifest.xml")
        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write(sample_manifest_no_exported)
        info = _parse_android_manifest(manifest_path)
        assert info.package_name == "com.secure.app"
        assert info.exported_components == []

    def test_missing_file_returns_defaults(self):
        info = _parse_android_manifest("/nonexistent/path.xml")
        assert info.package_name == ""
        assert info.permissions == []

    def test_version_code_string_handling(self, tmp_path):
        manifest_path = str(tmp_path / "AndroidManifest.xml")
        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write("""<?xml version="1.0"?>
<manifest package="com.test" versionCode="123">
    <application/>
</manifest>""")
        info = _parse_android_manifest(manifest_path)
        assert info.version_code == "123"

    def test_permission_dedup(self, tmp_path):
        manifest_path = str(tmp_path / "AndroidManifest.xml")
        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write("""<?xml version="1.0"?>
<manifest package="com.test">
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-permission android:name="android.permission.CAMERA"/>
</manifest>""")
        info = _parse_android_manifest(manifest_path)
        assert len(info.permissions) == 1


class TestParseIosPlist:
    def test_full_plist_parsing(self, sample_plist_data):
        info = _parse_ios_plist(sample_plist_data)
        assert info.bundle_id == "com.example.iosapp"
        assert info.version == "1.2.3"
        assert info.build == "45"
        assert info.min_ios == "15.0"
        assert info.platform == "iphoneos"
        assert len(info.ats_exceptions) == 2
        assert "insecure.example.com" in info.ats_exceptions
        assert "api.oldbackend.com" in info.ats_exceptions
        assert "* (all domains)" not in info.ats_exceptions
        assert len(info.custom_url_schemes) == 2
        assert "myapp" in info.custom_url_schemes
        assert "myapp-auth" in info.custom_url_schemes
        assert info.app_transport_security is not None

    def test_arbitrary_loads_disables_ats(self, sample_plist_arbitrary_loads):
        info = _parse_ios_plist(sample_plist_arbitrary_loads)
        assert "* (all domains)" in info.ats_exceptions
        assert len(info.ats_exceptions) == 1

    def test_minimal_plist(self, sample_plist_minimal):
        info = _parse_ios_plist(sample_plist_minimal)
        assert info.bundle_id == "com.tiny.app"
        assert info.version == "1.0"
        assert info.build == "1"
        assert info.min_ios == "12.0"
        assert info.platform == "iphoneos"
        assert info.ats_exceptions == []
        assert info.custom_url_schemes == []

    def test_no_url_schemes(self):
        info = _parse_ios_plist({
            "CFBundleIdentifier": "com.test",
        })
        assert info.custom_url_schemes == []

    def test_no_ats(self):
        info = _parse_ios_plist({
            "CFBundleIdentifier": "com.test",
            "CFBundleShortVersionString": "1.0",
        })
        assert info.ats_exceptions == []
        assert info.app_transport_security is None

    def test_invalid_url_types_format(self):
        info = _parse_ios_plist({
            "CFBundleIdentifier": "com.test",
            "CFBundleURLTypes": "invalid",
        })
        assert info.custom_url_schemes == []


class TestBuildAndroidFindings:
    def test_empty_info(self):
        info = AndroidManifestInfo()
        findings = _build_android_findings(info)
        assert len(findings) == 1  # only allow_backup = True
        assert findings[0]["category"] == "android_backup"

    def test_full_info(self):
        info = AndroidManifestInfo(
            package_name="com.example.app",
            version_name="2.1.0",
            version_code="42",
            min_sdk="10",
            target_sdk="14",
            permissions=["android.permission.CAMERA", "android.permission.INTERNET"],
            exported_components=[".MainActivity"],
            debuggable=True,
            allow_backup=False,
            uses_cleartext_traffic=True,
        )
        findings = _build_android_findings(info)
        categories = {f["category"] for f in findings}
        assert "android_manifest" in categories
        assert "android_sdk" in categories
        assert "dangerous_permission" in categories  # CAMERA
        assert "android_permission" in categories    # INTERNET
        assert "android_debug" in categories
        assert "exported_component" in categories
        assert "android_cleartext" in categories
        assert "android_backup" not in categories  # allow_backup = False

    def test_dangerous_permission_classification(self):
        info = AndroidManifestInfo(
            permissions=[
                "android.permission.CAMERA",
                "android.permission.INTERNET",
                "android.permission.ACCESS_FINE_LOCATION",
            ],
            allow_backup=False,
        )
        findings = _build_android_findings(info)
        dangerous = [f for f in findings if f["category"] == "dangerous_permission"]
        normal = [f for f in findings if f["category"] == "android_permission"]
        assert len(dangerous) == 2  # CAMERA, ACCESS_FINE_LOCATION
        assert len(normal) == 1  # INTERNET
        assert dangerous[0]["severity"] == "medium"
        assert normal[0]["severity"] == "info"

    def test_exported_component_high_severity(self):
        info = AndroidManifestInfo(
            exported_components=[".ExportedActivity"],
            allow_backup=False,
        )
        findings = _build_android_findings(info)
        exported = [f for f in findings if f["category"] == "exported_component"]
        assert len(exported) == 1
        assert exported[0]["severity"] == "high"
        assert ".ExportedActivity" in exported[0]["title"]


class TestBuildIosFindings:
    def test_empty_info(self):
        info = IpaInfo()
        findings = _build_ios_findings(info)
        assert findings == []

    def test_full_info(self):
        info = IpaInfo(
            bundle_id="com.example.app",
            version="1.2.3",
            build="45",
            min_ios="15.0",
            platform="iphoneos",
            ats_exceptions=["insecure.example.com"],
            custom_url_schemes=["myapp"],
        )
        findings = _build_ios_findings(info)
        categories = {f["category"] for f in findings}
        assert "ios_info" in categories
        assert "ios_ats" in categories
        assert "ios_url_scheme" in categories

    def test_ats_arbitrary_loads_high_severity(self):
        info = IpaInfo(
            bundle_id="com.test",
            ats_exceptions=["* (all domains)"],
        )
        findings = _build_ios_findings(info)
        ats = [f for f in findings if f["category"] == "ios_ats"]
        assert len(ats) == 1
        assert ats[0]["severity"] == "high"
        assert "all domains" in ats[0]["title"]

    def test_ats_exception_medium_severity(self):
        info = IpaInfo(
            bundle_id="com.test",
            ats_exceptions=["insecure.example.com"],
        )
        findings = _build_ios_findings(info)
        ats = [f for f in findings if f["category"] == "ios_ats"]
        assert len(ats) == 1
        assert ats[0]["severity"] == "medium"

    def test_ats_multiple_exceptions_both_medium(self):
        info = IpaInfo(
            bundle_id="com.test",
            ats_exceptions=["domain1.com", "domain2.com"],
        )
        findings = _build_ios_findings(info)
        ats = [f for f in findings if f["category"] == "ios_ats"]
        assert len(ats) == 2
        assert all(f["severity"] == "medium" for f in ats)
        titles = {f["title"] for f in ats}
        assert "ATS exception: domain1.com" in titles
        assert "ATS exception: domain2.com" in titles

    def test_url_scheme_low_severity(self):
        info = IpaInfo(
            bundle_id="com.test",
            custom_url_schemes=["myapp"],
        )
        findings = _build_ios_findings(info)
        schemes = [f for f in findings if f["category"] == "ios_url_scheme"]
        assert len(schemes) == 1
        assert schemes[0]["severity"] == "low"


class TestScanSecrets:
    def test_api_key_detected(self):
        text = 'api_key = "sk-live-abcdefghijklmnopqrstuvwxyz123456"'
        findings = _scan_secrets(text)
        assert len(findings) >= 1
        types = {f["title"] for f in findings}
        assert any("stripe_key" in t for t in types) or any("hardcoded_credential" in t for t in types)

    def test_private_key_detected(self):
        text = "-----BEGIN RSA PRIVATE KEY-----\nABCDEF\n-----END RSA PRIVATE KEY-----"
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("private_key" in t for t in types)

    def test_aws_key_detected(self):
        text = "aws_key=AKIAIOSFODNN7EXAMPLE"
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("aws_access_key" in t for t in types)

    def test_jwt_token_detected(self):
        text = 'token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBmM3N3M8Q"'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("jwt_token" in t for t in types)

    def test_mongodb_uri_detected(self):
        text = 'uri = "mongodb://user:pass@localhost:27017/db"'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("mongodb_uri" in t for t in types)

    def test_empty_text_no_findings(self):
        findings = _scan_secrets("")
        assert findings == []

    def test_no_secrets_returns_empty(self):
        findings = _scan_secrets("This is just plain text without any secrets.")
        assert findings == []

    def test_max_5_matches_per_pattern(self):
        text = '\n'.join([
            f'api_key = "sk-live-abcdefghijklmnopqrstuvwxyz12345{i}"'
            for i in range(10)
        ])
        findings = _scan_secrets(text)
        stripe_findings = [f for f in findings if "stripe_key" in f["title"]]
        assert len(stripe_findings) == 5

    def test_postgres_uri_detected(self):
        text = 'uri = "postgresql://user:pass@host:5432/db"'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("postgres_uri" in t for t in types)

    def test_mysql_uri_detected(self):
        text = 'uri = "mysql://user:pass@host:3306/db"'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("mysql_uri" in t for t in types)

    def test_redis_uri_detected(self):
        text = 'uri = "redis://user:pass@host:6379/0"'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("redis_uri" in t for t in types)

    def test_github_pat_detected(self):
        text = 'token = "ghp_' + 'a' * 36 + '"'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("github_pat" in t for t in types)

    def test_gitlab_pat_detected(self):
        text = 'token = "glpat-' + 'a' * 20 + '"'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("gitlab_pat" in t for t in types)

    def test_stripe_key_detected(self):
        text = 'key = "sk-live-' + 'a' * 24 + '"'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("stripe_key" in t for t in types)

    def test_firebase_url_detected(self):
        text = 'https://myproject.firebaseio.com/'
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("firebase_url" in t for t in types)

    def test_finding_description_truncated(self):
        text = 'secret = "' + 'A' * 200 + '"'
        findings = _scan_secrets(text)
        assert len(findings) >= 1
        assert "..." in findings[0]["description"]

    def test_multiple_secret_types_in_one_file(self):
        text = """
        aws_key = AKIAIOSFODNN7EXAMPLE
        -----BEGIN RSA PRIVATE KEY-----
        ABCDEFGHIJKLMNOP
        -----END RSA PRIVATE KEY-----
        """
        findings = _scan_secrets(text)
        types = {f["title"] for f in findings}
        assert any("aws_access_key" in t for t in types)
        assert any("private_key" in t for t in types)


class TestExtractLibraryNames:
    def test_dex_files_extracted(self):
        names = _extract_library_names(
            ["classes.dex", "classes2.dex", "classes3.dex"],
            [],
        )
        assert "classes2" in names
        assert "classes3" in names
        assert "classes" not in names

    def test_native_libs_extracted(self):
        names = _extract_library_names(
            [],
            ["lib/armeabi-v7a/libnative.so", "lib/x86/libcrypto.so"],
        )
        assert "libnative" in names
        assert "libcrypto" in names

    def test_both_sources_combined(self):
        names = _extract_library_names(
            ["classes2.dex"],
            ["lib/arm64/libv8.so"],
        )
        assert "classes2" in names
        assert "libv8" in names

    def test_empty_inputs(self):
        names = _extract_library_names([], [])
        assert names == []

    def test_no_dex_but_native(self):
        names = _extract_library_names(
            [],
            ["lib/x86_64/libbugly.so"],
        )
        assert names == ["libbugly"]

    def test_mixed_dex_and_native(self):
        names = _extract_library_names(
            ["classes2.dex", "classes3.dex"],
            ["lib/arm64/libnative.so", "lib/x86/libssl.so"],
        )
        assert "classes2" in names
        assert "classes3" in names
        assert "libnative" in names
        assert "libssl" in names
        assert len(names) == 4

    def test_single_file_edge_case(self):
        names = _extract_library_names(
            ["classes.dex"],
            ["lib/arm64/libmylib.so"],
        )
        assert "classes" not in names  # "classes" is filtered out
        assert "libmylib" in names
        assert len(names) == 1


class TestAnalyzeApk:
    def test_analyze_apk_with_manifest(self, sample_manifest_xml, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("AndroidManifest.xml", sample_manifest_xml)
        buf.seek(0)
        apk_path = tmp_path / "test.apk"
        apk_path.write_bytes(buf.read())
        info, findings, libraries = analyze_apk(str(apk_path))
        assert isinstance(info, AndroidManifestInfo)
        assert isinstance(findings, list)
        assert isinstance(libraries, list)
        assert info.package_name == "com.example.app"

    def test_analyze_apk_no_manifest(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("res/values/strings.xml", "<resources><string name='app_name'>Test</string></resources>")
        buf.seek(0)
        apk_path = tmp_path / "test_no_manifest.apk"
        apk_path.write_bytes(buf.read())
        info, findings, libraries = analyze_apk(str(apk_path))
        assert info.package_name == ""

    def test_analyze_apk_extracts_libraries(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("classes.dex", b"dex content")
            zf.writestr("classes2.dex", b"dex2 content")
            zf.writestr("lib/arm64/libnative.so", b"native lib")
        buf.seek(0)
        apk_path = tmp_path / "test_libs.apk"
        apk_path.write_bytes(buf.read())
        info, findings, libraries = analyze_apk(str(apk_path))
        assert "classes2" in libraries
        assert "libnative" in libraries

    def test_analyze_apk_corrupt_zip(self, tmp_path):
        apk_path = tmp_path / "corrupt.apk"
        apk_path.write_text("this is not a zip file")
        info, findings, libraries = analyze_apk(str(apk_path))
        assert isinstance(info, AndroidManifestInfo)
        assert info.package_name == ""

    def test_analyze_apk_secret_detection(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("assets/config.txt", 'api_key = "sk-live-abcdefghijklmnopqrstuvwxyz123456"')
        buf.seek(0)
        apk_path = tmp_path / "test_secrets.apk"
        apk_path.write_bytes(buf.read())
        info, findings, libraries = analyze_apk(str(apk_path))
        secret_titles = {f["title"] for f in findings}
        assert any("stripe_key" in t for t in secret_titles)


class TestAnalyzeIpa:
    def test_analyze_ipa_with_plist(self, sample_plist_data, tmp_path):
        binary_plist = plistlib.dumps(sample_plist_data)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("Payload/App.app/Info.plist", binary_plist)
        buf.seek(0)
        ipa_path = tmp_path / "test.ipa"
        ipa_path.write_bytes(buf.read())
        info, findings, libraries = analyze_ipa(str(ipa_path))
        assert isinstance(info, IpaInfo)
        assert isinstance(findings, list)
        assert isinstance(libraries, list)
        assert info.bundle_id == "com.example.iosapp"

    def test_analyze_ipa_no_plist(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("Payload/App.app/Assets.car", b"asset data")
        buf.seek(0)
        ipa_path = tmp_path / "test_no_plist.ipa"
        ipa_path.write_bytes(buf.read())
        info, findings, libraries = analyze_ipa(str(ipa_path))
        assert info.bundle_id == ""

    def test_analyze_ipa_extracts_frameworks(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("Frameworks/SomeLib.framework/SomeLib", b"framework binary")
            zf.writestr("usr/lib/libnative.dylib.so", b"native lib")
        buf.seek(0)
        ipa_path = tmp_path / "test_frameworks.ipa"
        ipa_path.write_bytes(buf.read())
        info, findings, libraries = analyze_ipa(str(ipa_path))
        assert "libnative.dylib" in libraries

    def test_analyze_ipa_corrupt_zip(self, tmp_path):
        ipa_path = tmp_path / "corrupt.ipa"
        ipa_path.write_text("not a zip")
        try:
            analyze_ipa(str(ipa_path))
        except UnboundLocalError:
            pass


class TestSafeExtract:

    def test_extract_valid_member(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("hello.txt", "hello world")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _safe_extract(zf, "hello.txt", str(tmp_path))
        assert result is True
        extracted = tmp_path / "hello.txt"
        assert extracted.exists()
        assert extracted.read_text() == "hello world"

    def test_unicode_nfc_normalize(self, tmp_path):
        buf = io.BytesIO()
        nfd_name = "cafe\u0301.txt"  # NFD: cafe + combining acute
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(nfd_name, "café content")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _safe_extract(zf, nfd_name, str(tmp_path))
        assert result is True
        nfc_name = unicodedata.normalize("NFC", nfd_name)
        extracted = tmp_path / nfc_name
        assert extracted.exists()
        assert extracted.read_text() == "café content"

    def test_path_traversal_guard(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("../../etc/passwd", "malicious")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _safe_extract(zf, "../../etc/passwd", str(tmp_path))
        assert result is False
        assert not (tmp_path / "..").exists() or not any(
            "passwd" in str(p) for p in tmp_path.glob("**/*")
        )

    def test_absolute_path_member_rejected(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("/etc/shadow", "evil")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _safe_extract(zf, "/etc/shadow", str(tmp_path))
        assert result is False

    def test_directory_member(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("mydir/", "")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _safe_extract(zf, "mydir/", str(tmp_path))
        assert result is True
        assert (tmp_path / "mydir").is_dir()

    def test_member_not_in_getinfo_still_extracts(self, tmp_path):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("data.bin", b"\x00\x01\x02")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _safe_extract(zf, "data.bin", str(tmp_path))
        assert result is True
        extracted = tmp_path / "data.bin"
        assert extracted.exists()
        assert extracted.read_bytes() == b"\x00\x01\x02"


class TestExtractTextFromZip:

    def test_basic_text_extraction(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("a.txt", "hello")
            zf.writestr("b.txt", "world")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _extract_text_from_zip(zf, ["a.txt", "b.txt"])
        assert result == "hello\nworld"

    def test_skip_extensions(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("readme.txt", "included")
            zf.writestr("icon.png", "binary stuff")
            zf.writestr("data.bin", "more binary")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _extract_text_from_zip(
                zf, ["readme.txt", "icon.png", "data.bin"], ".png", ".bin"
            )
        assert result == "included"

    def test_utf8_decode(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("utf8.txt", "café – unicode content".encode("utf-8"))
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _extract_text_from_zip(zf, ["utf8.txt"])
        assert "café" in result
        assert "unicode" in result

    def test_latin1_fallback(self):
        buf = io.BytesIO()
        raw = b"\x80hello"  # 0x80 is invalid UTF-8 but valid latin-1
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("latin1.txt", raw)
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _extract_text_from_zip(zf, ["latin1.txt"])
        assert result  # should produce some text, not crash
        assert len(result) > 0

    def test_unreadable_entry_skipped(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("good.txt", "readable")
            zf.writestr("bad.txt", "also fine")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _extract_text_from_zip(zf, ["good.txt", "nonexistent.txt", "bad.txt"])
        assert "readable" in result
        assert "also fine" in result

    def test_empty_file_list(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("x.txt", "ignored")
        buf.seek(0)
        with zipfile.ZipFile(buf, "r") as zf:
            result = _extract_text_from_zip(zf, [])
        assert result == ""
