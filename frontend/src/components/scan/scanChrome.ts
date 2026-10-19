import { TONE_TEXT } from "@/lib/toneColors";
import { toneRail, toneWash } from "@/lib/toneMap";

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
      return toneRail("critical");
    case "high":
      return toneRail("high");
    case "medium":
      return toneRail("medium");
    case "low":
      return toneRail("low");
    default:
      return toneRail("idle");
  }
}

export function severityTextClass(severity: string | null): string {
  switch (severity) {
    case "critical":
      return "text-destructive";
    case "high":
      return TONE_TEXT.orange;
    case "medium":
      return TONE_TEXT.yellow;
    case "low":
      return TONE_TEXT.blue;
    default:
      return "text-foreground";
  }
}

export function statusRailClass(status: string): string {
  if (status === "failed") return toneRail("failed");
  if (status === "running") return toneRail("running");
  if (status === "pending") return toneRail("pending");
  if (status === "completed") return toneRail("completed");
  return toneRail("idle");
}

export function findingsRailClass(
  status: string,
  summary: SeveritySummary,
): string {
  if (status === "failed") return toneRail("failed");
  if (status === "running" || status === "pending") {
    return statusRailClass(status);
  }
  const worst = worstSeverity(summary);
  return worst ? severityRailClass(worst) : toneRail("idle");
}

export function severityWashClass(severity: string | null): string | null {
  return severity === "critical" ? toneWash("critical") ?? null : null;
}

export function findingsWashClass(
  status: string,
  summary: SeveritySummary,
): string | null {
  if (status === "failed") return toneWash("failed") ?? null;
  return severityWashClass(worstSeverity(summary));
}

export function diffRailClass(diff: {
  readonly compared_to_job_id: string | null;
  readonly new_critical: number;
  readonly new_high: number;
  readonly resolved: number;
  readonly worsened: number;
}): string {
  if (diff.new_critical > 0) return toneRail("critical");
  if (diff.new_high > 0 || diff.worsened > 0) return toneRail("high");
  if (diff.resolved > 0) return toneRail("completed");
  return toneRail("idle");
}

export function scannerResultRailClass(summary: {
  readonly critical?: number;
  readonly high?: number;
  readonly medium?: number;
  readonly low?: number;
}): string {
  if ((summary.critical ?? 0) > 0) return toneRail("critical");
  if ((summary.high ?? 0) > 0) return toneRail("high");
  if ((summary.medium ?? 0) > 0) return toneRail("medium");
  if ((summary.low ?? 0) > 0) return toneRail("low");
  return toneRail("primary");
}

export function scannerResultWashClass(summary: {
  readonly critical?: number;
  readonly high?: number;
}): string | undefined {
  return (summary.critical ?? 0) > 0 || (summary.high ?? 0) > 0
    ? toneWash("critical")
    : undefined;
}
