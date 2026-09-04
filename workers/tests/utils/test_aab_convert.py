"""Tests for AAB → universal APK conversion helpers."""

import io
import os
import zipfile
from pathlib import Path
from unittest import mock

import pytest

from utils.aab_convert import (
    AabConversionError,
    _extract_universal_apk,
    convert_aab_to_universal_apk,
    extract_bundled_aapt2,
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


class TestExtractBundledAapt2:
    def test_extracts_linux_member(self, tmp_path):
        jar = tmp_path / "bundletool.jar"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("linux/aapt2", b"\x7fELFaapt2")
        jar.write_bytes(buf.getvalue())
        dest_dir = tmp_path / "work"
        dest_dir.mkdir()
        path = extract_bundled_aapt2(str(jar), str(dest_dir))
        assert path == str(dest_dir / "aapt2")
        assert Path(path).read_bytes().startswith(b"\x7fELF")
        assert os.access(path, os.X_OK)

    def test_missing_member_returns_none(self, tmp_path):
        jar = tmp_path / "bundletool.jar"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("README", b"x")
        jar.write_bytes(buf.getvalue())
        assert extract_bundled_aapt2(str(jar), str(tmp_path / "w")) is None


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

        def fake_popen(cmd, **kwargs):
            assert any(a.startswith("-Djava.io.tmpdir=") for a in cmd)
            assert any(a.startswith("--aapt2=") for a in cmd)
            output_arg = next(a for a in cmd if a.startswith("--output="))
            apks_path = output_arg.split("=", 1)[1]
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as zf:
                zf.writestr("universal.apk", b"FAKEAPK")

            Path(apks_path).write_bytes(buf.getvalue())
            proc = mock.MagicMock()
            proc.returncode = 0
            proc.pid = 4242
            proc.communicate.return_value = ("", "")
            return proc

        aapt2 = tmp_path / "aapt2"
        aapt2.write_text("#!/bin/sh\n")
        aapt2.chmod(0o755)
        monkeypatch.setenv("BUNDLETOOL_JAR", str(jar))
        monkeypatch.setenv("AAPT2_PATH", str(aapt2))
        with (
            mock.patch("utils.aab_convert.resolve_java_binary", return_value="/usr/bin/java"),
            mock.patch("utils.aab_convert.subprocess.Popen", side_effect=fake_popen),
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
        proc = mock.MagicMock()
        proc.returncode = 1
        proc.pid = 99
        proc.communicate.return_value = ("", "boom")
        with (
            mock.patch("utils.aab_convert.resolve_java_binary", return_value="/usr/bin/java"),
            mock.patch("utils.aab_convert.subprocess.Popen", return_value=proc),
            pytest.raises(AabConversionError, match="bundletool failed"),
        ):
            convert_aab_to_universal_apk(str(aab), output_dir=str(tmp_path / "w"))

    def test_bundletool_timeout_kills_process_group(self, tmp_path, monkeypatch):
        import subprocess as sp

        aab = tmp_path / "app.aab"
        aab.write_bytes(b"PK")
        jar = tmp_path / "bundletool.jar"
        jar.write_bytes(b"jar")
        monkeypatch.setenv("BUNDLETOOL_JAR", str(jar))
        proc = mock.MagicMock()
        proc.pid = 777
        proc.communicate.side_effect = sp.TimeoutExpired(cmd=["java"], timeout=1)
        with (
            mock.patch("utils.aab_convert.resolve_java_binary", return_value="/usr/bin/java"),
            mock.patch("utils.aab_convert.subprocess.Popen", return_value=proc),
            mock.patch("utils.aab_convert.os.killpg") as killpg,
            pytest.raises(AabConversionError, match="timed out"),
        ):
            convert_aab_to_universal_apk(str(aab), output_dir=str(tmp_path / "w"))
        killpg.assert_called_once()
        assert killpg.call_args.args[0] == 777

    def test_bundletool_enospc_stderr(self, tmp_path, monkeypatch):
        aab = tmp_path / "app.aab"
        aab.write_bytes(b"PK")
        jar = tmp_path / "bundletool.jar"
        jar.write_bytes(b"jar")
        monkeypatch.setenv("BUNDLETOOL_JAR", str(jar))
        proc = mock.MagicMock()
        proc.returncode = 1
        proc.pid = 11
        proc.communicate.return_value = ("", "java.io.IOException: No space left on device")
        with (
            mock.patch("utils.aab_convert.resolve_java_binary", return_value="/usr/bin/java"),
            mock.patch("utils.aab_convert.subprocess.Popen", return_value=proc),
            pytest.raises(AabConversionError, match="out of disk space"),
        ):
            convert_aab_to_universal_apk(str(aab), output_dir=str(tmp_path / "w"))
