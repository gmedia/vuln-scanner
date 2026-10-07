export type DashboardTone =
  "critical" | "high" | "failed" | "running" | "pending" | "completed" | "idle";

export function scanTone(input: {
  readonly status: string;
  readonly critical: number;
  readonly high: number;
}): DashboardTone {
  if (input.status === "failed") return "failed";
  if (input.status === "running") return "running";
  if (input.status === "pending") return "pending";
  if (input.status === "completed") {
    if (input.critical > 0) return "critical";
    if (input.high > 0) return "high";
    return "completed";
  }
  if (input.critical > 0) return "critical";
  if (input.high > 0) return "high";
  return "idle";
}

export function dashboardRailClass(tone: DashboardTone): string {
  if (tone === "critical" || tone === "failed") return "bg-destructive";
  if (tone === "high") return "bg-orange-500";
  if (tone === "running") return "bg-sky-500";
  if (tone === "pending") return "bg-amber-500";
  if (tone === "completed") return "bg-primary";
  return "bg-border";
}

export function dashboardWashClass(tone: DashboardTone): string | null {
  if (tone === "critical" || tone === "failed") return "bg-destructive/[0.04]";
  return null;
}

export function worstScanTone(
  rows: readonly {
    readonly status: string;
    readonly critical: number;
    readonly high: number;
  }[],
): DashboardTone {
  if (rows.length === 0) return "idle";
  let worst: DashboardTone = "completed";
  const rank: Record<DashboardTone, number> = {
    critical: 0,
    failed: 0,
    high: 1,
    running: 2,
    pending: 3,
    completed: 4,
    idle: 5,
  };
  for (const row of rows) {
    const tone = scanTone(row);
    if (rank[tone] < rank[worst]) worst = tone;
  }
  return worst;
}
