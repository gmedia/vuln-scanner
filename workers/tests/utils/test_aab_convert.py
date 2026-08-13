"""Tests for AAB → universal APK conversion helpers."""

import io
import zipfile
from pathlib import Path
from unittest import mock

import pytest

from utils.aab_convert import (
    AabConversionError,
    _extract_universal_apk,
    convert_aab_to_universal_apk,
    is_aab_path,
    resolve_aapt2_binary,
    resolve_bundletool_jar,
    resolve_java_binary,
)


class TestIsAabPath:
    def test_aab_extension(self):
        assert is_aab_path("/tmp/app.aab") is True
        assert is_aab_path("/tmp/App.AAB") is True

    def test_non_aab(self):
        assert is_aab_path("/tmp/app.apk") is False
        assert is_aab_path("/tmp/app.ipa") is False


class TestResolveBundletoolJar:
    def test_returns_none_when_missing(self, monkeypatch):
        monkeypatch.delenv("BUNDLETOOL_JAR", raising=False)
        with mock.patch("utils.aab_convert.os.path.isfile", return_value=False):
            assert resolve_bundletool_jar() is None

    def test_prefers_env(self, monkeypatch, tmp_path):
        jar = tmp_path / "bundletool.jar"
        jar.write_bytes(b"jar")
        monkeypatch.setenv("BUNDLETOOL_JAR", str(jar))
        assert resolve_bundletool_jar() == str(jar)


class TestResolveJavaBinary:
    def test_java_home(self, monkeypatch, tmp_path):
        java_bin = tmp_path / "bin" / "java"
        java_bin.parent.mkdir()
        java_bin.write_text("#!/bin/sh\n")
        java_bin.chmod(0o755)
        monkeypatch.setenv("JAVA_HOME", str(tmp_path))
        assert resolve_java_binary() == str(java_bin)

    def test_missing_raises(self, monkeypatch):
        monkeypatch.delenv("JAVA_HOME", raising=False)
        with (
            mock.patch("utils.aab_convert.shutil.which", return_value=None),
            pytest.raises(AabConversionError, match="Java runtime"),
        ):
            resolve_java_binary()


class TestExtractUniversalApk:
    def test_extracts_universal_member(self, tmp_path):
        apks = tmp_path / "out.apks"
        dest = tmp_path / "universal.apk"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("universal.apk", b"PK\x03\x04fake-apk")
        apks.write_bytes(buf.getvalue())
        _extract_universal_apk(str(apks), str(dest))
        assert dest.read_bytes() == b"PK\x03\x04fake-apk"

    def test_no_apk_raises(self, tmp_path):
        apks = tmp_path / "empty.apks"
        dest = tmp_path / "universal.apk"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("toc.pb", b"x")
        apks.write_bytes(buf.getvalue())
        with pytest.raises(AabConversionError, match="no APK"):
            _extract_universal_apk(str(apks), str(dest))


class TestResolveAapt2Binary:
    def test_prefers_env(self, monkeypatch, tmp_path):
        bin_path = tmp_path / "aapt2"
        bin_path.write_text("#!/bin/sh\n")
        bin_path.chmod(0o755)
        monkeypatch.setenv("AAPT2_PATH", str(bin_path))
        assert resolve_aapt2_binary() == str(bin_path)

    def test_missing_returns_none(self, monkeypatch):
        monkeypatch.delenv("AAPT2_PATH", raising=False)
        with (
            mock.patch("utils.aab_convert.os.path.isfile", return_value=False),
            mock.patch("utils.aab_convert.shutil.which", return_value=None),
        ):
            assert resolve_aapt2_binary() is None


class TestConvertAabToUniversalApk:
    def test_missing_file(self):
        with pytest.raises(AabConversionError, match="not found"):
            convert_aab_to_universal_apk("/nonexistent/app.aab")

    def test_missing_bundletool(self, tmp_path, monkeypatch):
        aab = tmp_path / "app.aab"
        aab.write_bytes(b"PK")
        monkeypatch.delenv("BUNDLETOOL_JAR", raising=False)
        with (
            mock.patch("utils.aab_convert.resolve_bundletool_jar", return_value=None),
            pytest.raises(AabConversionError, match="bundletool"),
        ):
            convert_aab_to_universal_apk(str(aab))

    def test_successful_convert(self, tmp_path, monkeypatch):
        aab = tmp_path / "app.aab"
        aab.write_bytes(b"PK")
        jar = tmp_path / "bundletool.jar"
        jar.write_bytes(b"jar")
        out_dir = tmp_path / "work"
        out_dir.mkdir()

        def fake_run(cmd, **kwargs):
            assert any(a.startswith("-Djava.io.tmpdir=") for a in cmd)
            assert any(a.startswith("--aapt2=") for a in cmd)
            output_arg = next(a for a in cmd if a.startswith("--output="))
            apks_path = output_arg.split("=", 1)[1]
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as zf:
                zf.writestr("universal.apk", b"FAKEAPK")

            Path(apks_path).write_bytes(buf.getvalue())
            result = mock.MagicMock()
            result.returncode = 0
            result.stderr = ""
            result.stdout = ""
            return result

        aapt2 = tmp_path / "aapt2"
        aapt2.write_text("#!/bin/sh\n")
        aapt2.chmod(0o755)
        monkeypatch.setenv("BUNDLETOOL_JAR", str(jar))
        monkeypatch.setenv("AAPT2_PATH", str(aapt2))
        with (
            mock.patch("utils.aab_convert.resolve_java_binary", return_value="/usr/bin/java"),
            mock.patch("utils.aab_convert.subprocess.run", side_effect=fake_run),
        ):
            apk_path = convert_aab_to_universal_apk(str(aab), output_dir=str(out_dir))
        assert apk_path.endswith("universal.apk")
        assert Path(apk_path).read_bytes() == b"FAKEAPK"

    def test_bundletool_nonzero_exit(self, tmp_path, monkeypatch):
        aab = tmp_path / "app.aab"
        aab.write_bytes(b"PK")
        jar = tmp_path / "bundletool.jar"
        jar.write_bytes(b"jar")
        monkeypatch.setenv("BUNDLETOOL_JAR", str(jar))
        result = mock.MagicMock()
        result.returncode = 1
        result.stderr = "boom"
        result.stdout = ""
        with (
            mock.patch("utils.aab_convert.resolve_java_binary", return_value="/usr/bin/java"),
            mock.patch("utils.aab_convert.subprocess.run", return_value=result),
            pytest.raises(AabConversionError, match="bundletool failed"),
        ):
            convert_aab_to_universal_apk(str(aab), output_dir=str(tmp_path / "w"))
