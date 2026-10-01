export function stateBadgeVariant(state: string) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  if (state === "degraded") return "medium" as const;
  return "info" as const;
}

export function stateRailClass(state: string, enabled = true): string {
  if (!enabled) return "bg-border";
  if (state === "up") return "bg-primary";
  if (state === "down") return "bg-destructive";
  if (state === "degraded") return "bg-amber-500";
  return "bg-border";
}

export function stateWashClass(state: string, enabled = true): string | null {
  if (!enabled) return null;
  if (state === "up") return "bg-primary/5";
  if (state === "down") return "bg-destructive/[0.04]";
  return null;
}

export function stateValueClass(state: string, enabled = true): string {
  if (!enabled) return "text-muted-foreground";
  if (state === "up") return "text-primary";
  if (state === "down") return "text-destructive";
  if (state === "degraded") return "text-amber-500";
  return "text-foreground";
}
