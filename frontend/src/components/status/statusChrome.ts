import { TONE_TEXT } from "@/lib/toneColors";
import { toneRail, toneWash } from "@/lib/toneMap";

export function overallValueClass(
  overall: string | null,
  published: boolean,
): string {
  if (!published) return "text-muted-foreground";
  if (overall === "major") return "text-destructive";
  if (overall === "partial") return TONE_TEXT.orange;
  if (overall === "degraded") return TONE_TEXT.amber;
  if (overall === "operational") return "text-primary-text";
  return "text-foreground";
}

export function overallLabelKey(overall: string | null): string {
  if (overall === "major") return "overallMajor";
  if (overall === "partial") return "overallPartial";
  if (overall === "degraded") return "overallDegraded";
  if (overall === "operational") return "overallOperational";
  return "overallUnknown";
}

export function overallRailClass(
  overall: string | null,
  published: boolean,
): string {
  if (!published) return toneRail("idle");
  if (overall === "major") return toneRail("critical");
  if (overall === "partial") return toneRail("high");
  if (overall === "degraded") return toneRail("warn");
  if (overall === "operational") return toneRail("primary");
  return toneRail("idle");
}

export function overallWashClass(
  overall: string | null,
  published: boolean,
): string | null {
  if (!published) return null;
  if (overall === "operational") return toneWash("completed") ?? null;
  if (overall === "major") return "bg-destructive/5";
  return null;
}

export function componentStateBadge(state: string | null) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  if (state === "degraded") return "medium" as const;
  return "info" as const;
}

export function componentRailClass(state: string | null): string {
  if (state === "up") return toneRail("primary");
  if (state === "down") return toneRail("critical");
  if (state === "degraded") return toneRail("warn");
  return toneRail("idle");
}

export function hostnameStatusVariant(status: string) {
  if (status === "active") return "completed" as const;
  if (status === "failed") return "failed" as const;
  if (status === "pending_txt") return "pending" as const;
  return "info" as const;
}

export function hostnameRailClass(status: string): string {
  if (status === "active") return toneRail("primary");
  if (status === "failed") return toneRail("critical");
  if (status === "pending_txt") return toneRail("warn");
  return toneRail("idle");
}

export function incidentRailClass(status: string): string {
  if (status === "resolved") return toneRail("primary");
  if (status === "investigating") return toneRail("warn");
  if (status === "identified") return toneRail("high");
  if (status === "monitoring") return toneRail("info");
  return toneRail("idle");
}

export function incidentsListRailClass(statuses: readonly string[]): string {
  if (statuses.length === 0) return toneRail("idle");
  if (statuses.some((s) => s === "investigating")) return toneRail("warn");
  if (statuses.some((s) => s === "identified")) return toneRail("high");
  if (statuses.some((s) => s === "monitoring")) return toneRail("info");
  return toneRail("primary");
}

export const HOSTNAME_STATUS_KEYS: Record<string, string> = {
  pending_txt: "statusPendingTxt",
  active: "statusActive",
  failed: "statusFailed",
  none: "statusNone",
};
