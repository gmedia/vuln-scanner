export const SEVERITY = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
} as const;

export type SiemSeverity = (typeof SEVERITY)[keyof typeof SEVERITY];

export type IndexerHealth = "live" | "degraded" | "down";

export type SeverityLabelKey =
  | "sevCritical"
  | "sevHigh"
  | "sevMedium"
  | "sevLow";

const RAIL = {
  critical: "bg-destructive",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
} as const satisfies Record<SiemSeverity, string>;

const LABEL_KEY = {
  critical: "sevCritical",
  high: "sevHigh",
  medium: "sevMedium",
  low: "sevLow",
} as const satisfies Record<SiemSeverity, SeverityLabelKey>;

export function severityFromLevel(level: number): SiemSeverity {
  if (level >= 12) return SEVERITY.critical;
  if (level >= 7) return SEVERITY.high;
  if (level >= 4) return SEVERITY.medium;
  return SEVERITY.low;
}

export function severityRailClass(level: number): string {
  return RAIL[severityFromLevel(level)];
}

export function severityBadgeVariant(level: number): SiemSeverity {
  return severityFromLevel(level);
}

export function severityLabelKey(level: number): SeverityLabelKey {
  return LABEL_KEY[severityFromLevel(level)];
}

export function indexerHealth(status: {
  readonly indexer_reachable: boolean;
  readonly degraded: boolean;
}): IndexerHealth {
  if (!status.indexer_reachable) return "down";
  if (status.degraded) return "degraded";
  return "live";
}
