import { TONE_TEXT } from "@/lib/toneColors";
import { toneRail, toneWash } from "@/lib/toneMap";

export type AdminTone =
  "primary" | "success" | "danger" | "warn" | "info" | "alert" | "idle";

export function adminRailClass(tone: AdminTone): string {
  return toneRail(tone);
}

export function adminWashClass(tone: AdminTone): string | undefined {
  return toneWash(tone);
}

export type AdminKpiKind =
  "users" | "scans" | "findings" | "creditsIn" | "creditsUsed";

export function kpiTone(kind: AdminKpiKind): AdminTone {
  if (kind === "users") return "info";
  if (kind === "findings") return "alert";
  if (kind === "creditsUsed") return "warn";
  return "primary";
}

export function kpiValueClass(tone: AdminTone): string {
  if (tone === "info") return TONE_TEXT.sky;
  if (tone === "alert") return TONE_TEXT.orange;
  if (tone === "warn") return TONE_TEXT.amber;
  return "text-primary-text";
}

export function userTone(input: {
  readonly is_verified: boolean;
  readonly is_admin: boolean;
}): AdminTone {
  if (!input.is_verified) return "warn";
  if (input.is_admin) return "primary";
  return "idle";
}

export function mutationTone(input: {
  readonly error: boolean;
  readonly success: boolean;
  readonly pending: boolean;
}): AdminTone {
  if (input.error) return "danger";
  if (input.pending) return "info";
  if (input.success) return "success";
  return "primary";
}

export function marginTone(marginIdr: number): AdminTone {
  return marginIdr < 0 ? "danger" : "primary";
}

export function reportTone(
  unallocatedOverheadIdr: number | undefined,
): AdminTone {
  return (unallocatedOverheadIdr ?? 0) > 0 ? "warn" : "primary";
}

export function invoiceStatusTone(status: string): AdminTone {
  if (status === "paid") return "success";
  if (status === "sent") return "warn";
  if (status === "void") return "danger";
  return "idle";
}

export function invoiceListTone(statuses: readonly string[]): AdminTone {
  if (statuses.length === 0) return "idle";
  if (statuses.includes("void")) return "danger";
  if (statuses.includes("sent")) return "warn";
  if (statuses.includes("paid")) return "success";
  return "idle";
}

export function blogStatusTone(status: string): AdminTone {
  return status === "published" ? "primary" : "idle";
}

export function blogListTone(statuses: readonly string[]): AdminTone {
  if (statuses.length === 0) return "idle";
  if (statuses.includes("published")) return "primary";
  return "idle";
}

export function emailStatusTone(status: string): AdminTone {
  return status === "failed" ? "danger" : "primary";
}

export function emailListTone(statuses: readonly string[]): AdminTone {
  if (statuses.length === 0) return "idle";
  if (statuses.includes("failed")) return "danger";
  return "primary";
}
