export function overallRailClass(
  overall: string | null,
  published: boolean,
): string {
  if (!published) return "bg-muted-foreground/40";
  if (overall === "major") return "bg-destructive";
  if (overall === "partial") return "bg-orange-500";
  if (overall === "degraded") return "bg-amber-500";
  if (overall === "operational") return "bg-primary";
  return "bg-muted-foreground/40";
}

export function overallValueClass(
  overall: string | null,
  published: boolean,
): string {
  if (!published) return "text-muted-foreground";
  if (overall === "major") return "text-destructive";
  if (overall === "partial") return "text-orange-500";
  if (overall === "degraded") return "text-amber-500";
  if (overall === "operational") return "text-primary";
  return "text-foreground";
}

export function overallLabelKey(overall: string | null): string {
  if (overall === "major") return "overallMajor";
  if (overall === "partial") return "overallPartial";
  if (overall === "degraded") return "overallDegraded";
  if (overall === "operational") return "overallOperational";
  return "overallUnknown";
}

export function componentStateBadge(state: string | null) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  if (state === "degraded") return "medium" as const;
  return "info" as const;
}

export function hostnameStatusVariant(status: string) {
  if (status === "active") return "completed" as const;
  if (status === "failed") return "failed" as const;
  if (status === "pending_txt") return "pending" as const;
  return "info" as const;
}

export const HOSTNAME_STATUS_KEYS: Record<string, string> = {
  pending_txt: "statusPendingTxt",
  active: "statusActive",
  failed: "statusFailed",
  none: "statusNone",
};
