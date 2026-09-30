export function stateBadgeVariant(state: string) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  if (state === "degraded") return "medium" as const;
  return "info" as const;
}

export function stateRailClass(state: string): string {
  if (state === "up") return "bg-primary";
  if (state === "down") return "bg-destructive";
  if (state === "degraded") return "bg-amber-500";
  return "bg-muted-foreground/40";
}
