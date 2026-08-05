"""Tests for binary Android XML (AXML) decoder and manifest integration."""

from pathlib import Path

from utils.axml import axml_to_xml, is_binary_axml
from utils.mobile_utils import _parse_android_manifest, analyze_apk

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "sample_manifest.axml"


class TestIsBinaryAxml:
    def test_valid_magic(self):
        raw = FIXTURE.read_bytes()
        assert is_binary_axml(raw) is True

    def test_text_xml_not_binary(self):
        assert is_binary_axml(b'<?xml version="1.0"?>') is False

    def test_too_short(self):
        assert is_binary_axml(b"\x03\x00") is False

    def test_wrong_magic(self):
        assert is_binary_axml(b"\x00\x00\x00\x00\x10\x00\x00\x00") is False


class TestAxmlToXml:
    def test_decodes_sample_fixture(self):
        raw = FIXTURE.read_bytes()
        xml = axml_to_xml(raw)
        assert 'package="com.example.app"' in xml
        assert 'versionName="2.1.0"' in xml
        assert 'versionCode="42"' in xml
        assert "android:minSdkVersion" in xml
        assert "android:targetSdkVersion" in xml
        assert "android.permission.CAMERA" in xml
        assert 'android:debuggable="true"' in xml
        assert 'android:allowBackup="false"' in xml
        assert 'android:usesCleartextTraffic="true"' in xml
        assert 'android:name=".MainActivity"' in xml
        assert 'android:exported="true"' in xml

    def test_rejects_non_binary(self):
        import pytest

        with pytest.raises(ValueError, match="Not a binary AXML"):
            axml_to_xml(b'<?xml version="1.0"?><manifest/>')


class TestParseBinaryManifest:
    def test_parse_binary_axml_file(self, tmp_path):
        dest = tmp_path / "AndroidManifest.xml"
        dest.write_bytes(FIXTURE.read_bytes())
        info = _parse_android_manifest(str(dest))
        assert info.package_name == "com.example.app"
        assert info.version_name == "2.1.0"
        assert info.version_code == "42"
        assert info.min_sdk == "10"
        assert info.target_sdk == "14"
        assert "android.permission.CAMERA" in info.permissions
        assert info.debuggable is True
        assert info.allow_backup is False
        assert info.uses_cleartext_traffic is True
        assert ".MainActivity" in info.exported_components

    def test_text_manifest_still_works(self, sample_manifest_xml, tmp_path):
        dest = tmp_path / "AndroidManifest.xml"
        dest.write_text(sample_manifest_xml, encoding="utf-8")
        info = _parse_android_manifest(str(dest))
        assert info.package_name == "com.example.app"
        assert info.debuggable is True

    def test_analyze_apk_with_binary_manifest(self, tmp_path):
        import io
        import zipfile

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("AndroidManifest.xml", FIXTURE.read_bytes())
        apk_path = tmp_path / "binary.apk"
        apk_path.write_bytes(buf.getvalue())
        info, findings, _libraries = analyze_apk(str(apk_path))
        assert info.package_name == "com.example.app"
        assert any(f.get("category") == "android_debug" for f in findings)
