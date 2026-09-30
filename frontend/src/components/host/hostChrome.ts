export function siteRailClass(opts: {
  readonly needsDecision: boolean;
  readonly waiting: boolean;
  readonly failed: boolean;
  readonly helperStale: boolean;
  readonly completed: boolean;
}): string {
  if (opts.needsDecision) return "bg-destructive";
  if (opts.waiting) return "bg-blue-500";
  if (opts.failed || opts.helperStale) return "bg-destructive";
  if (opts.completed) return "bg-primary";
  return "bg-muted-foreground/40";
}

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

export function hitRailClass(status: string, cls: string): string {
  if (cls === "webshell" || cls === "backdoor") return "bg-destructive";
  if (status === "open" || status === "restored") return "bg-destructive";
  if (status === "quarantined") return "bg-primary";
  if (status === "pending_quarantine" || status === "pending_restore") {
    return "bg-amber-500";
  }
  return "bg-muted-foreground/40";
}

export function wafModeRailClass(mode: string): string {
  if (mode === "protect") return "bg-primary";
  if (mode === "detect") return "bg-blue-500";
  return "bg-muted-foreground/40";
}

export function wafModeBadgeVariant(mode: string) {
  if (mode === "protect") return "success" as const;
  if (mode === "detect") return "running" as const;
  return "default" as const;
}
