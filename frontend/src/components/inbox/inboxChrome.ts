export function inboxStatusRailClass(status: string): string {
  if (status === "sent") return "bg-primary";
  if (status === "bounced") return "bg-orange-500";
  if (status === "complained") return "bg-yellow-500";
  return "bg-destructive";
}

export function inboxListRailClass(statuses: readonly string[]): string {
  if (statuses.length === 0) return "bg-border";
  if (statuses.includes("failed")) return "bg-destructive";
  if (statuses.includes("bounced")) return "bg-orange-500";
  if (statuses.includes("complained")) return "bg-yellow-500";
  return "bg-primary";
}
