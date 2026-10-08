export type AdminTone =
  "primary" | "success" | "danger" | "warn" | "info" | "alert" | "idle";

export function adminRailClass(tone: AdminTone): string {
  if (tone === "danger") return "bg-destructive";
  if (tone === "warn") return "bg-amber-500";
  if (tone === "alert") return "bg-orange-500";
  if (tone === "info") return "bg-sky-500";
  if (tone === "idle") return "bg-border";
  return "bg-primary";
}

export function adminWashClass(tone: AdminTone): string | undefined {
  if (tone === "danger") return "bg-destructive/[0.04]";
  if (tone === "warn") return "bg-amber-500/[0.04]";
  if (tone === "success") return "bg-primary/5";
  return undefined;
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
  if (tone === "info") return "text-sky-400";
  if (tone === "alert") return "text-orange-400";
  if (tone === "warn") return "text-amber-400";
  return "text-primary";
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
