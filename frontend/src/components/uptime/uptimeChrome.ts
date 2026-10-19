import { TONE_TEXT } from "@/lib/toneColors";
import { toneRail, toneWash } from "@/lib/toneMap";

export function stateBadgeVariant(state: string) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  if (state === "degraded") return "medium" as const;
  return "info" as const;
}

export function stateRailClass(state: string, enabled = true): string {
  if (!enabled) return toneRail("disabled");
  if (state === "up") return toneRail("primary");
  if (state === "down") return toneRail("critical");
  if (state === "degraded") return toneRail("warn");
  return toneRail("idle");
}

export function stateWashClass(state: string, enabled = true): string | null {
  if (!enabled) return null;
  if (state === "up") return toneWash("completed") ?? null;
  if (state === "down") return toneWash("critical") ?? null;
  return null;
}

export function stateValueClass(state: string, enabled = true): string {
  if (!enabled) return "text-muted-foreground";
  if (state === "up") return "text-primary-text";
  if (state === "down") return "text-destructive";
  if (state === "degraded") return TONE_TEXT.amber;
  return "text-foreground";
}

export function outagesRailClass(count: number): string {
  return count > 0 ? toneRail("critical") : toneRail("idle");
}
