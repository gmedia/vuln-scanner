#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_SRC="$ROOT/packaging/host-protect-helper"
VERSION="${HOST_PROTECT_DEB_VERSION:-0.1.3}"
OUT_DIR="${HOST_PROTECT_DEB_OUT:-$ROOT/dist}"
STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$STAGE/DEBIAN" \
  "$STAGE/usr/lib/sinexis/host-protect/rules" \
  "$STAGE/usr/lib/systemd/system" \
  "$STAGE/usr/share/doc/sinexis-host-protect"

install -m 755 "$PKG_SRC/sinexis_host_scan.py" "$STAGE/usr/lib/sinexis/host-protect/sinexis_host_scan.py"
install -m 644 "$PKG_SRC/rules/php_webshell.yar" "$STAGE/usr/lib/sinexis/host-protect/rules/php_webshell.yar"
install -m 644 "$PKG_SRC/systemd/sinexis-host-protect@.service" "$STAGE/usr/lib/systemd/system/sinexis-host-protect@.service"
install -m 644 "$PKG_SRC/systemd/sinexis-host-protect@.timer" "$STAGE/usr/lib/systemd/system/sinexis-host-protect@.timer"
install -m 644 "$PKG_SRC/host-protect.env.example" "$STAGE/usr/share/doc/sinexis-host-protect/host-protect.env.example"
install -m 644 "$PKG_SRC/README.md" "$STAGE/usr/share/doc/sinexis-host-protect/README.md"

{
  echo "Package: sinexis-host-protect"
  echo "Version: $VERSION"
  echo "Section: admin"
  echo "Priority: optional"
  echo "Architecture: all"
  echo "Maintainer: Sinexis <ops@sinexis.app>"
  echo "Depends: wazuh-agent, python3"
  echo "Recommends: clamav"
  echo "Description: Sinexis Host Protect on-box helper (YARA/needles, optional Clam)"
  echo " Add-on for an enrolled wazuh-agent VM. Walks allowlisted web roots and"
  echo " POSTs JSON findings to the Sinexis Host Protect ingest API."
  echo " Not a second enroll daemon."
} >"$STAGE/DEBIAN/control"

install -m 755 "$PKG_SRC/debian/postinst" "$STAGE/DEBIAN/postinst"
install -m 755 "$PKG_SRC/debian/prerm" "$STAGE/DEBIAN/prerm"

mkdir -p "$OUT_DIR"
DEB="$OUT_DIR/sinexis-host-protect_${VERSION}_all.deb"
dpkg-deb --root-owner-group --build "$STAGE" "$DEB" >/dev/null
echo "$DEB"
