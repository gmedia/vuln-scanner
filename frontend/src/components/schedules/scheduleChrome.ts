export type ScheduleTone = "critical" | "enabled" | "disabled";

export function scheduleTone(s: {
  readonly enabled: boolean;
  readonly last_error: string | null;
}): ScheduleTone {
  if (s.last_error) return "critical";
  return s.enabled ? "enabled" : "disabled";
}

export function scheduleRailClass(tone: ScheduleTone): string {
  if (tone === "critical") return "bg-destructive";
  if (tone === "enabled") return "bg-primary";
  return "bg-border";
}

export function scheduleWashClass(tone: ScheduleTone): string | undefined {
  return tone === "critical" ? "bg-destructive/[0.04]" : undefined;
}

export function quotaRailClass(enabled: number, max: number): string {
  if (max > 0 && enabled >= max) return "bg-destructive";
  if (max > 0 && enabled / max >= 0.8) return "bg-amber-500";
  return "bg-primary";
}

export function quotaIndicatorClass(
  enabled: number,
  max: number,
): string | undefined {
  if (max > 0 && enabled >= max) return "bg-destructive";
  if (max > 0 && enabled / max >= 0.8) return "bg-amber-500";
  return undefined;
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
