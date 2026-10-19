import { toneRail } from "@/lib/toneMap";

/**
 * SKU quota policy: warn at 80%, cap at 100%. Every seat counter in the app
 * (assets, host sites, uptime monitors, schedules) uses this one scale so the
 * amber/destructive moment happens at the same fill level.
 */
export type QuotaTone = "ok" | "warn" | "cap";

export type QuotaState = {
  readonly pct: number;
  readonly tone: QuotaTone;
  readonly atCap: boolean;
};

export function quotaState(used: number, limit: number): QuotaState {
  if (limit <= 0) return { pct: 0, tone: "ok", atCap: false };
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const atCap = used >= limit;
  if (atCap) return { pct, tone: "cap", atCap };
  if (pct >= 80) return { pct, tone: "warn", atCap };
  return { pct, tone: "ok", atCap };
}

export function quotaRailClass(tone: QuotaTone): string {
  if (tone === "cap") return toneRail("danger");
  if (tone === "warn") return toneRail("warn");
  return toneRail("primary");
}

export function quotaIndicatorClass(tone: QuotaTone): string | undefined {
  if (tone === "cap") return toneRail("danger");
  if (tone === "warn") return toneRail("warn");
  return undefined;
}
