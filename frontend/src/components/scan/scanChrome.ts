export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

const SEVERITY_ORDER: readonly FindingSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export type SeveritySummary =
  | {
      readonly critical?: number;
      readonly high?: number;
      readonly medium?: number;
      readonly low?: number;
      readonly info?: number;
      readonly total_findings?: number;
    }
  | null
  | undefined;

export function worstSeverity(
  summary: SeveritySummary,
): FindingSeverity | null {
  if (!summary) return null;
  for (const key of SEVERITY_ORDER) {
    const raw = summary[key];
    if (typeof raw === "number" && raw > 0) return key;
  }
  return null;
}

export function severityRailClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-destructive";
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-yellow-500";
    case "low":
      return "bg-blue-500";
    default:
      return "bg-border";
  }
}

export function severityTextClass(severity: string | null): string {
  switch (severity) {
    case "critical":
      return "text-destructive";
    case "high":
      return "text-orange-400";
    case "medium":
      return "text-yellow-400";
    case "low":
      return "text-blue-400";
    default:
      return "text-foreground";
  }
}

export function statusRailClass(status: string): string {
  if (status === "failed") return "bg-destructive";
  if (status === "running") return "bg-sky-500";
  if (status === "pending") return "bg-amber-500";
  if (status === "completed") return "bg-primary";
  return "bg-border";
}

export function findingsRailClass(
  status: string,
  summary: SeveritySummary,
): string {
  if (status === "failed") return "bg-destructive";
  if (status === "running" || status === "pending") {
    return statusRailClass(status);
  }
  const worst = worstSeverity(summary);
  return worst ? severityRailClass(worst) : "bg-border";
}

export function severityWashClass(severity: string | null): string | null {
  return severity === "critical" ? "bg-destructive/[0.04]" : null;
}

export function findingsWashClass(
  status: string,
  summary: SeveritySummary,
): string | null {
  if (status === "failed") return "bg-destructive/[0.04]";
  return severityWashClass(worstSeverity(summary));
}

export function diffRailClass(diff: {
  readonly compared_to_job_id: string | null;
  readonly new_critical: number;
  readonly new_high: number;
  readonly resolved: number;
  readonly worsened: number;
}): string {
  if (diff.new_critical > 0) return "bg-destructive";
  if (diff.new_high > 0 || diff.worsened > 0) return "bg-orange-500";
  if (diff.resolved > 0) return "bg-primary";
  return "bg-border";
}
