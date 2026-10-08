export type WorkspaceTone =
  "primary" | "success" | "danger" | "warn" | "info" | "idle";

export function workspaceRailClass(tone: WorkspaceTone): string {
  if (tone === "danger") return "bg-destructive";
  if (tone === "warn") return "bg-amber-500";
  if (tone === "info") return "bg-sky-500";
  if (tone === "idle") return "bg-border";
  return "bg-primary";
}

export function workspaceWashClass(tone: WorkspaceTone): string | undefined {
  if (tone === "danger") return "bg-destructive/[0.04]";
  if (tone === "warn") return "bg-amber-500/[0.04]";
  if (tone === "success") return "bg-primary/5";
  return undefined;
}

export function roleTone(role: string): WorkspaceTone {
  if (role === "owner") return "primary";
  if (role === "admin") return "success";
  if (role === "viewer") return "idle";
  return "info";
}

export function invoiceTone(status: string): WorkspaceTone {
  if (status === "paid") return "success";
  if (status === "sent") return "warn";
  if (status === "void") return "danger";
  return "idle";
}

export function countTone(count: number | undefined): WorkspaceTone {
  return count && count > 0 ? "primary" : "idle";
}

export function invoiceListTone(statuses: readonly string[]): WorkspaceTone {
  if (statuses.length === 0) return "idle";
  if (statuses.includes("void")) return "danger";
  if (statuses.includes("sent")) return "warn";
  if (statuses.includes("paid")) return "success";
  return "idle";
}

export function formTone(input: {
  readonly error: boolean;
  readonly pending: boolean;
}): WorkspaceTone {
  if (input.error) return "danger";
  if (input.pending) return "info";
  return "primary";
}
