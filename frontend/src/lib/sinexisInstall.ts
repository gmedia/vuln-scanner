export const SINEXIS_INSTALL_RAW_URL =
  "https://raw.githubusercontent.com/gmedia/vuln-scanner/main/packaging/host-protect-helper/sinexis-install.sh";

export const SINEXIS_INSTALL_WGET = [
  `wget -O sinexis-install.sh '${SINEXIS_INSTALL_RAW_URL}'`,
  "head -n1 sinexis-install.sh",
  "chmod +x sinexis-install.sh",
].join("\n");

export function formatHelperPollAt(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const STALE_MS = 30 * 60 * 1000;

export function isHelperPollStale(
  iso: string | null,
  now = Date.now(),
): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return now - t > STALE_MS;
}
