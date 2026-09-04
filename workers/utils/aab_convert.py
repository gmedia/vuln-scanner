"""Convert Android App Bundle (.aab) to universal APK via Google bundletool."""

from __future__ import annotations

import contextlib
import errno
import os
import shutil
import signal
import subprocess
import tempfile
import zipfile
from pathlib import Path

from loguru import logger

DEFAULT_BUNDLETOOL_PATHS = (
    "/opt/bundletool/bundletool.jar",
    str(Path(__file__).resolve().parent.parent / "tools" / "bundletool.jar"),
)

DEFAULT_AAPT2_PATHS = (
    "/opt/bundletool/aapt2",
    "/usr/local/bin/aapt2",
)

BUNDLETOOL_TIMEOUT_SEC = int(os.environ.get("BUNDLETOOL_TIMEOUT_SEC", "300"))
BUNDLETOOL_JAVA_TMPDIR = os.environ.get("BUNDLETOOL_JAVA_TMPDIR", "/tmp/scans/bundletool-work")
STDERR_LIMIT = 2000
_DISK_FULL_MARKERS = ("no space left", "enospc", "not enough space")


class AabConversionError(Exception):
    pass


def is_aab_path(file_path: str) -> bool:
    return file_path.lower().endswith(".aab")


def resolve_bundletool_jar() -> str | None:
    candidates = (os.environ.get("BUNDLETOOL_JAR", ""), *DEFAULT_BUNDLETOOL_PATHS)
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    return None


def resolve_aapt2_binary() -> str | None:
    candidates = (os.environ.get("AAPT2_PATH", ""), *DEFAULT_AAPT2_PATHS)
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    found = shutil.which("aapt2")
    if found and os.access(found, os.X_OK):
        return found
    return None


def extract_bundled_aapt2(bundletool_jar: str, dest_dir: str) -> str | None:
    dest = os.path.join(dest_dir, "aapt2")
    if os.path.isfile(dest) and os.access(dest, os.X_OK):
        return dest
    try:
        with zipfile.ZipFile(bundletool_jar) as zf:
            names = [n for n in zf.namelist() if n == "linux/aapt2" or n.endswith("/linux/aapt2")]
            if not names:
                return None
            os.makedirs(dest_dir, exist_ok=True)
            with zf.open(names[0]) as src, open(dest, "wb") as out:
                shutil.copyfileobj(src, out)
        os.chmod(dest, 0o755)
    except (OSError, zipfile.BadZipFile):
        return None
    if os.path.isfile(dest) and os.access(dest, os.X_OK):
        return dest
    return None


def _is_disk_full_text(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in _DISK_FULL_MARKERS)


def _raise_disk_full(detail: str) -> None:
    raise AabConversionError(f"AAB conversion ran out of disk space in the bundletool work directory. {detail}")


def _ensure_java_tmpdir() -> str:
    try:
        os.makedirs(BUNDLETOOL_JAVA_TMPDIR, exist_ok=True)
    except OSError as exc:
        if exc.errno == errno.ENOSPC:
            _raise_disk_full(str(exc))
        raise
    return BUNDLETOOL_JAVA_TMPDIR


def resolve_java_binary() -> str:
    java_home = os.environ.get("JAVA_HOME", "")
    if java_home:
        candidate = os.path.join(java_home, "bin", "java")
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    found = shutil.which("java")
    if found:
        return found
    raise AabConversionError("Java runtime not found (install JRE or set JAVA_HOME)")


def convert_aab_to_universal_apk(aab_path: str, output_dir: str | None = None) -> str:
    """Run bundletool build-apks --mode=universal; return path to universal.apk."""
    if not os.path.isfile(aab_path):
        raise AabConversionError(f"AAB file not found: {aab_path}")

    jar = resolve_bundletool_jar()
    if not jar:
        raise AabConversionError("bundletool.jar not found. Set BUNDLETOOL_JAR or install under /opt/bundletool/")

    java = resolve_java_binary()
    java_tmp = _ensure_java_tmpdir()
    work = output_dir or tempfile.mkdtemp(prefix="aab_convert_", dir=java_tmp)
    os.makedirs(work, exist_ok=True)

    apks_path = os.path.join(work, "out.apks")
    apk_path = os.path.join(work, "universal.apk")

    cmd = [
        java,
        f"-Djava.io.tmpdir={java_tmp}",
        "-jar",
        jar,
        "build-apks",
        f"--bundle={aab_path}",
        f"--output={apks_path}",
        "--mode=universal",
    ]
    aapt2 = resolve_aapt2_binary() or extract_bundled_aapt2(jar, java_tmp)
    if aapt2:
        cmd.append(f"--aapt2={aapt2}")
        logger.info("bundletool using aapt2: {path}", path=aapt2)
    else:
        logger.warning("No aapt2 found; bundletool will extract into java.io.tmpdir")
    logger.info("Converting AAB to universal APK via bundletool")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
    except OSError as exc:
        if exc.errno == errno.ENOSPC:
            _raise_disk_full(str(exc))
        raise AabConversionError(f"Failed to run bundletool: {exc}") from exc

    try:
        stdout, stderr = proc.communicate(timeout=BUNDLETOOL_TIMEOUT_SEC)
    except subprocess.TimeoutExpired as exc:
        with contextlib.suppress(ProcessLookupError, PermissionError, OSError):
            os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=10)
        raise AabConversionError(f"bundletool timed out after {BUNDLETOOL_TIMEOUT_SEC}s") from exc

    result = subprocess.CompletedProcess(cmd, proc.returncode, stdout, stderr)

    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()[:STDERR_LIMIT]
        logger.error("bundletool stderr (exit {code}): {err}", code=result.returncode, err=err)
        if _is_disk_full_text(err):
            _raise_disk_full(err)
        raise AabConversionError(f"bundletool failed (exit {result.returncode}): {err}")

    if not os.path.isfile(apks_path):
        raise AabConversionError("bundletool did not produce .apks output")

    _extract_universal_apk(apks_path, apk_path)
    with contextlib.suppress(OSError):
        os.remove(apks_path)

    if not os.path.isfile(apk_path):
        raise AabConversionError("universal.apk missing after extraction")

    logger.info("AAB converted to universal APK: {path}", path=apk_path)
    return apk_path


def _extract_universal_apk(apks_path: str, dest_apk: str) -> None:
    with zipfile.ZipFile(apks_path, "r") as zf:
        candidates = [n for n in zf.namelist() if n == "universal.apk" or n.endswith("/universal.apk")]
        if not candidates:
            candidates = [n for n in zf.namelist() if n.endswith(".apk") and n.count("/") <= 1]
        if not candidates:
            raise AabConversionError(".apks archive contains no APK entries")

        member = candidates[0]
        dest_dir = os.path.dirname(os.path.realpath(dest_apk)) or "."
        target = os.path.realpath(os.path.join(dest_dir, os.path.basename(member)))
        dest_real = os.path.realpath(dest_dir)
        if not target.startswith(dest_real + os.sep) and target != dest_real:
            raise AabConversionError(f"Unsafe APK member path in .apks: {member}")

        try:
            with zf.open(member) as src, open(dest_apk, "wb") as dst:
                shutil.copyfileobj(src, dst)
        except OSError as exc:
            if getattr(exc, "errno", None) == errno.ENOSPC:
                _raise_disk_full(str(exc))
            raise
