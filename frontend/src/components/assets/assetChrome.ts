import {
  fetchAssetPack,
  fetchAssetPackHtml,
} from "@/api/assets";

export type AssetTranslate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

export type AssetScanType = "ip" | "domain";

export type TypeFilter = "all" | "ip" | "domain";

export type QuotaTone = "ok" | "warn" | "cap";

export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

export function mapAssetError(message: string): string {
  if (/Asset limit/i.test(message)) return "limit";
  if (/already exists/i.test(message)) return "dup";
  if (/already has a schedule/i.test(message)) return "sched";
  return message;
}

export function parseScanType(value: string): AssetScanType {
  if (value === "ip" || value === "domain") return value;
  return "domain";
}

export function assetRailClass(scanType: string): string {
  switch (scanType) {
    case "domain":
      return "bg-sky-500";
    case "ip":
      return "bg-violet-500";
    default:
      return "bg-border";
  }
}

export function assetTypeChipClass(scanType: string): string {
  switch (scanType) {
    case "domain":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "ip":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

export function typeLabelKey(scanType: string): "typeIp" | "typeDomain" {
  return scanType === "ip" ? "typeIp" : "typeDomain";
}

export function quotaTone(pct: number, atCap: boolean): QuotaTone {
  if (atCap || pct >= 90) return "cap";
  if (pct >= 70) return "warn";
  return "ok";
}

export function quotaRailClass(tone: QuotaTone): string {
  switch (tone) {
    case "cap":
      return "bg-destructive";
    case "warn":
      return "bg-amber-500";
    case "ok":
      return "bg-primary";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function quotaIndicatorClass(tone: QuotaTone): string | undefined {
  switch (tone) {
    case "cap":
      return "bg-destructive";
    case "warn":
      return "bg-amber-500";
    case "ok":
      return undefined;
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export async function downloadPackJson(): Promise<void> {
  const pack = await fetchAssetPack();
  const blob = new Blob([JSON.stringify(pack, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "assets-pack.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPackHtml(): Promise<void> {
  const blob = await fetchAssetPackHtml();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "assets-pack.html";
  a.click();
  URL.revokeObjectURL(url);
}
