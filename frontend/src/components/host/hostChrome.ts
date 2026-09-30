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
