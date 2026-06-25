import os
import plistlib
import re
import shutil
import tempfile
import unicodedata
import zipfile
from dataclasses import dataclass, field

from loguru import logger


@dataclass
class AndroidManifestInfo:
    """Parsed AndroidManifest.xml data: package, SDK, permissions, and security flags."""
    package_name: str = ""
    version_name: str = ""
    version_code: str = ""
    min_sdk: str = ""
    target_sdk: str = ""
    permissions: list[str] = field(default_factory=list)
    exported_components: list[str] = field(default_factory=list)
    debuggable: bool = False
    allow_backup: bool = True
    uses_cleartext_traffic: bool = False


@dataclass
class IpaInfo:
    """Parsed iOS Info.plist data: bundle, version, ATS settings, and URL schemes."""
    bundle_id: str = ""
    version: str = ""
    build: str = ""
    min_ios: str = ""
    platform: str = ""
    ats_exceptions: list[str] = field(default_factory=list)
    custom_url_schemes: list[str] = field(default_factory=list)
    app_transport_security: dict | None = None


SECRET_PATTERNS = [
    (r"(?i)(?:api|auth|secret|token|key|password|passwd|pwd)\s*[=:]\s*['\"](\S{8,})['\"]", "hardcoded_credential"),
    (r"(?i)-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----", "private_key"),
    (r"(?i)AKIA[0-9A-Z]{16}", "aws_access_key"),
    (r"(?i)(?:firebase|firebaseio)\.com", "firebase_url"),
    (r"(?i)mongodb(?:\+srv)?://[^\s'\"]+", "mongodb_uri"),
    (r"(?i)postgres(?:ql)?://[^\s'\"]+", "postgres_uri"),
    (r"(?i)mysql://[^\s'\"]+", "mysql_uri"),
    (r"(?i)redis://[^\s'\"]+", "redis_uri"),
    (r"(?i)ghp_[0-9a-zA-Z]{36}", "github_pat"),
    (r"(?i)glpat-[0-9a-zA-Z\-_]{20,}", "gitlab_pat"),
    (r"(?i)eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]*", "jwt_token"),
    (r"(?i)sk-(?:live|test)-[0-9a-zA-Z]{24,}", "stripe_key"),
    (r"['\"][^'\"]{8,64}['\"]", "potential_string_secret"),
]

DANGEROUS_PERMISSIONS = {
    "android.permission.CAMERA", "android.permission.RECORD_AUDIO",
    "android.permission.READ_CONTACTS", "android.permission.WRITE_CONTACTS",
    "android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.READ_SMS", "android.permission.SEND_SMS",
    "android.permission.READ_CALL_LOG", "android.permission.CALL_PHONE",
    "android.permission.READ_EXTERNAL_STORAGE", "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.READ_PHONE_STATE", "android.permission.ACCESS_BACKGROUND_LOCATION",
    "android.permission.BODY_SENSORS", "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO", "android.permission.READ_MEDIA_AUDIO",
    "android.permission.POST_NOTIFICATIONS", "android.permission.BLUETOOTH_CONNECT",
    "android.permission.BLUETOOTH_SCAN",
}


def _safe_extract(zf: zipfile.ZipFile, member: str, dest_dir: str) -> bool:
    """Extract a single zip member to dest_dir, validating that the resolved path stays within dest_dir.

    Returns True on success, False if the member was skipped due to path traversal risk.
    """
    # Normalize Unicode to prevent NFC/NFD bypass attacks (e.g. cafe\u0301 vs café)
    normalized_member = unicodedata.normalize('NFC', member)
    target_path = os.path.realpath(os.path.join(dest_dir, normalized_member))
    dest_real = os.path.realpath(dest_dir)
    if not target_path.startswith(dest_real + os.sep) and target_path != dest_real:
        logger.warning("Skipping zip member with unsafe path: {member}", member=member)
        return False

    try:
        info = zf.getinfo(member)
        if info.is_dir():
            os.makedirs(target_path, exist_ok=True)
            return True
    except KeyError:
        pass

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    # Use zf.open() + direct write to eliminate TOCTOU: we write directly to the
    # already-validated target_path instead of letting zf.extract() re-resolve.
    with zf.open(member) as src, open(target_path, 'wb') as dst:
        shutil.copyfileobj(src, dst)
    return True


def analyze_apk(file_path: str) -> tuple[AndroidManifestInfo, list[dict], list[str]]:
    """Analyze an APK file: parse manifest, scan for secrets, and extract library names."""
    info = AndroidManifestInfo()
    extracts_dir = tempfile.mkdtemp(prefix="apk_")
    secret_findings: list[dict] = []
    classes_dex: list[str] = []
    lib_files: list[str] = []

    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            all_files = zf.namelist()
            classes_dex = [f for f in all_files if f.endswith(".dex")]
            lib_files = [f for f in all_files if ".so" in f]
            logger.info("APK extracted: {n} files, {dex} dex, {lib} libs",
                        n=len(all_files), dex=len(classes_dex), lib=len(lib_files))

            if "AndroidManifest.xml" in all_files and _safe_extract(zf, "AndroidManifest.xml", extracts_dir):
                manifest_path = os.path.join(extracts_dir, "AndroidManifest.xml")
                info = _parse_android_manifest(manifest_path)

            strings_content = _extract_text_from_zip(zf, all_files)
            secret_findings = _scan_secrets(strings_content)
            if secret_findings:
                logger.info("Found {n} potential secrets in APK", n=len(secret_findings))
    except Exception as e:
        logger.error("APK analysis failed for {path}: {error}", path=file_path, error=e)
    finally:
        shutil.rmtree(extracts_dir, ignore_errors=True)

    findings = _build_android_findings(info) + secret_findings
    libraries = _extract_library_names(classes_dex, lib_files)

    return info, findings, libraries


def analyze_ipa(file_path: str) -> tuple[IpaInfo, list[dict], list[str]]:
    """Analyze an IPA file: parse Info.plist, scan for secrets, and extract library names."""
    info = IpaInfo()
    extracts_dir = tempfile.mkdtemp(prefix="ipa_")

    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            all_files = zf.namelist()
            logger.info("IPA extracted: {n} files", n=len(all_files))

            plist_candidates = [f for f in all_files if f.endswith(".app/Info.plist") or "Info.plist" in f]
            for plist_path in plist_candidates:
                try:
                    if not _safe_extract(zf, plist_path, extracts_dir):
                        continue
                    extracted_path = os.path.join(extracts_dir, plist_path)
                    with open(extracted_path, "rb") as pf:
                        plist_data = plistlib.load(pf)
                    info = _parse_ios_plist(plist_data)
                    break
                except Exception as e:
                    logger.warning("Failed to parse plist {path}: {error}", path=plist_path, error=e)
                    continue

            lib_files = [f for f in all_files if ".framework" in f or ".dylib" in f]
    except Exception as e:
        logger.error("IPA analysis failed for {path}: {error}", path=file_path, error=e)
    finally:
        shutil.rmtree(extracts_dir, ignore_errors=True)

    findings = _build_ios_findings(info)
    libraries = _extract_library_names([], lib_files)
    secret_findings = _scan_secrets("")

    return info, findings + secret_findings, libraries


def _parse_android_manifest(manifest_path: str) -> AndroidManifestInfo:
    info = AndroidManifestInfo()
    try:
        with open(manifest_path, "rb") as f:
            raw = f.read()
        text = raw.decode("utf-8", errors="replace")

        pkg_match = re.search(r'package=["\']([^"\']+)["\']', text)
        if pkg_match:
            info.package_name = pkg_match.group(1)

        ver_match = re.search(r'versionName=["\']([^"\']+)["\']', text)
        if ver_match:
            info.version_name = ver_match.group(1)

        vc_match = re.search(r'versionCode=["\'](\d+)["\']', text)
        if vc_match:
            info.version_code = vc_match.group(1)

        sdk_matches = re.findall(r'minSdkVersion=["\'](\d+)["\']', text)
        if sdk_matches:
            sdk_val = sdk_matches[0]
            info.min_sdk = _sdk_to_android_version(int(sdk_val))

        target_sdk = re.findall(r'targetSdkVersion=["\'](\d+)["\']', text)
        if target_sdk:
            info.target_sdk = _sdk_to_android_version(int(target_sdk[0]))

        perms = re.findall(r'android:name=["\'](android\.permission\.\w+)["\']', text)
        info.permissions = list(set(perms))

        exported = re.findall(
            r'<(?:activity|service|receiver|provider)[^>]*android:name=["\']([^"\']+)["\'][^>]*android:exported=["\']true["\']',
            text
        )
        info.exported_components = exported

        info.debuggable = 'android:debuggable="true"' in text
        info.allow_backup = 'android:allowBackup="false"' not in text
        info.uses_cleartext_traffic = 'android:usesCleartextTraffic="true"' in text

    except Exception as e:
        logger.warning("Failed to parse AndroidManifest at {path}: {error}", path=manifest_path, error=e)

    return info


def _sdk_to_android_version(sdk: int) -> str:
    versions = {
        34: "14", 33: "13", 32: "12L", 31: "12", 30: "11",
        29: "10", 28: "9", 27: "8.1", 26: "8.0", 25: "7.1",
        24: "7.0", 23: "6.0", 21: "5.0", 19: "4.4",
    }
    return versions.get(sdk, str(sdk))


def _parse_ios_plist(plist_data: dict) -> IpaInfo:
    info = IpaInfo()
    info.bundle_id = plist_data.get("CFBundleIdentifier", "")
    info.version = plist_data.get("CFBundleShortVersionString", "")
    info.build = plist_data.get("CFBundleVersion", "")
    info.min_ios = plist_data.get("MinimumOSVersion", "")
    info.platform = plist_data.get("DTPlatformName", "")

    info.app_transport_security = plist_data.get("NSAppTransportSecurity")
    if isinstance(info.app_transport_security, dict):
        domains = info.app_transport_security.get("NSExceptionDomains", {})
        info.ats_exceptions = list(domains.keys()) if isinstance(domains, dict) else []
        if info.app_transport_security.get("NSAllowsArbitraryLoads"):
            info.ats_exceptions.append("* (all domains)")

    url_types = plist_data.get("CFBundleURLTypes", [])
    for url_type in url_types:
        if isinstance(url_type, dict):
            for scheme in url_type.get("CFBundleURLSchemes", []):
                info.custom_url_schemes.append(scheme)

    return info


def _build_android_findings(info: AndroidManifestInfo) -> list[dict]:
    findings = []

    if info.package_name:
        findings.append({
            "severity": "info", "category": "android_manifest",
            "title": f"Package: {info.package_name}",
            "description": f"Version: {info.version_name} (code: {info.version_code})",
        })

    if info.min_sdk:
        findings.append({
            "severity": "info", "category": "android_sdk",
            "title": f"Min SDK: Android {info.min_sdk}",
            "description": f"Target SDK: Android {info.target_sdk}" if info.target_sdk else "",
        })

    for perm in info.permissions:
        if perm in DANGEROUS_PERMISSIONS:
            perm_name = perm.replace("android.permission.", "")
            findings.append({
                "severity": "medium",
                "category": "dangerous_permission",
                "title": f"Dangerous permission: {perm_name}",
                "description": f"App requests {perm}",
            })
        else:
            perm_name = perm.replace("android.permission.", "")
            findings.append({
                "severity": "info",
                "category": "android_permission",
                "title": f"Permission: {perm_name}",
                "description": f"Declared: {perm}",
            })

    if info.debuggable:
        findings.append({
            "severity": "high",
            "category": "android_debug",
            "title": "App is debuggable",
            "description": "android:debuggable=\"true\" set — should not be enabled in production builds",
        })

    if info.allow_backup:
        findings.append({
            "severity": "medium",
            "category": "android_backup",
            "title": "Android backup is enabled",
            "description": "android:allowBackup is not set to false — app data can be backed up via ADB",
        })

    if info.uses_cleartext_traffic:
        findings.append({
            "severity": "medium",
            "category": "android_cleartext",
            "title": "Cleartext traffic allowed",
            "description": "android:usesCleartextTraffic=\"true\" allows HTTP traffic",
        })

    for comp in info.exported_components:
        findings.append({
            "severity": "high",
            "category": "exported_component",
            "title": f"Exported component: {comp}",
            "description": "Exported Android component accessible from other apps",
        })

    return findings


def _build_ios_findings(info: IpaInfo) -> list[dict]:
    findings = []

    if info.bundle_id:
        findings.append({
            "severity": "info", "category": "ios_info",
            "title": f"Bundle ID: {info.bundle_id}",
            "description": f"Version: {info.version} (build: {info.build}), Min iOS: {info.min_ios}",
        })

    if info.ats_exceptions:
        for ex in info.ats_exceptions:
            if ex == "* (all domains)":
                findings.append({
                    "severity": "high",
                    "category": "ios_ats",
                    "title": "ATS disabled for all domains",
                    "description": "NSAllowsArbitraryLoads set to true — all HTTPS enforcement disabled",
                })
            else:
                findings.append({
                    "severity": "medium",
                    "category": "ios_ats",
                    "title": f"ATS exception: {ex}",
                    "description": f"Insecure connection allowed to {ex}",
                })

    for scheme in info.custom_url_schemes:
        findings.append({
            "severity": "low",
            "category": "ios_url_scheme",
            "title": f"Custom URL scheme: {scheme}",
            "description": "Custom URL scheme can be hijacked by other apps",
        })

    return findings


def _scan_secrets(text_content: str) -> list[dict]:
    findings = []
    for pattern, secret_type in SECRET_PATTERNS:
        matches = re.findall(pattern, text_content)
        for match in matches[:5]:
            if isinstance(match, tuple):
                match = match[0]
            findings.append({
                "severity": "high",
                "category": "hardcoded_secret",
                "title": f"Potential {secret_type} detected",
                "description": f"Found: {match[:80]}..." if len(match) > 80 else f"Found: {match}",
            })
    return findings


def _extract_text_from_zip(zf: zipfile.ZipFile, file_list: list[str], *skip_extensions: str) -> str:
    chunks = []
    for name in file_list:
        ext = os.path.splitext(name)[1].lower()
        if ext in skip_extensions:
            continue
        try:
            with zf.open(name) as fh:
                raw = fh.read(1024 * 1024)
                try:
                    text = raw.decode("utf-8", errors="replace")
                except Exception as e:
                    logger.trace("Zip text decode fallback to latin-1 for {name}: {error}", name=name, error=e)
                    text = raw.decode("latin-1", errors="replace")
                chunks.append(text[:50000])
        except Exception as e:
            logger.trace("Skipping unreadable zip entry {name}: {error}", name=name, error=e)
            continue
    return "\n".join(chunks)


def _extract_library_names(dex_files: list[str], native_files: list[str]) -> list[str]:
    libs: list[str] = []

    for dex in dex_files:
        name = os.path.basename(dex).replace(".dex", "")
        if name and name not in ["classes"]:
            libs.append(name)

    for native in native_files:
        path_parts = native.split("/")
        for part in path_parts:
            if part.endswith(".so"):
                libs.append(part.replace(".so", ""))

    return libs
