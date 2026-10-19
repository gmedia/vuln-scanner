import { toneRail, toneWash } from "@/lib/toneMap";

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
  return toneRail(tone);
}

export function dashboardWashClass(tone: DashboardTone): string | null {
  return toneWash(tone) ?? null;
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
