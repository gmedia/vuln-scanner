import { toneRail, toneWash } from "@/lib/toneMap";
import {
  quotaIndicatorClass as sharedQuotaIndicatorClass,
  quotaRailClass as sharedQuotaRailClass,
  quotaState,
} from "@/lib/quota";

export type ScheduleTone = "critical" | "enabled" | "disabled";

export function scheduleTone(s: {
  readonly enabled: boolean;
  readonly last_error: string | null;
}): ScheduleTone {
  if (s.last_error) return "critical";
  return s.enabled ? "enabled" : "disabled";
}

export function scheduleRailClass(tone: ScheduleTone): string {
  return toneRail(tone);
}

export function scheduleWashClass(tone: ScheduleTone): string | undefined {
  return toneWash(tone);
}

export function quotaRailClass(enabled: number, max: number): string {
  return sharedQuotaRailClass(quotaState(enabled, max).tone);
}

export function quotaIndicatorClass(
  enabled: number,
  max: number,
): string | undefined {
  return sharedQuotaIndicatorClass(quotaState(enabled, max).tone);
}

export function listTone(
  rows: readonly {
    readonly enabled: boolean;
    readonly last_error: string | null;
  }[],
): ScheduleTone {
  if (rows.length === 0) return "disabled";
  if (rows.some((r) => r.last_error)) return "critical";
  if (rows.some((r) => r.enabled)) return "enabled";
  return "disabled";
}
