export function hitStatusVariant(
  status: string,
): "critical" | "high" | "completed" | "pending" | "running" | "default" {
  if (status === "open" || status === "restored") return "critical";
  if (status === "quarantined") return "completed";
  if (status === "pending_quarantine") return "pending";
  if (status === "pending_restore") return "running";
  return "default";
}

export function hitClassVariant(cls: string): "critical" | "default" {
  return cls === "webshell" || cls === "backdoor" ? "critical" : "default";
}

export function wafModeBadgeVariant(mode: string) {
  if (mode === "protect") return "success" as const;
  if (mode === "detect") return "running" as const;
  return "default" as const;
}

export type HostTone =
  "critical" | "running" | "failed" | "completed" | "pending" | "idle";

export function siteTone(input: {
  readonly enabled: boolean;
  readonly needsDecision: boolean;
  readonly waiting: boolean;
  readonly failed: boolean;
  readonly completed: boolean;
}): HostTone {
  if (!input.enabled) return "idle";
  if (input.needsDecision) return "critical";
  if (input.waiting) return "running";
  if (input.failed) return "failed";
  if (input.completed) return "completed";
  return "pending";
}

export function hostToneRailClass(tone: HostTone): string {
  if (tone === "critical" || tone === "failed") return "bg-destructive";
  if (tone === "running") return "bg-sky-500";
  if (tone === "completed") return "bg-primary";
  return "bg-border";
}

export function hostToneWashClass(tone: HostTone): string | null {
  if (tone === "critical" || tone === "failed") return "bg-destructive/[0.04]";
  if (tone === "completed") return "bg-primary/5";
  return null;
}

export function hostToneBadgeVariant(
  tone: HostTone,
): "critical" | "running" | "failed" | "completed" | "pending" | "default" {
  if (tone === "idle") return "default";
  return tone;
}

export function hitRailClass(cls: string): string {
  return cls === "webshell" || cls === "backdoor"
    ? "bg-destructive"
    : "bg-border";
}

export function wafActionRailClass(action: string): string {
  return action === "block" ? "bg-destructive" : "bg-border";
}

export function wafModeRailClass(mode: string): string {
  if (mode === "protect") return "bg-primary";
  if (mode === "detect") return "bg-sky-500";
  return "bg-border";
}
