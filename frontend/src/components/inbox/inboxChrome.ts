import { toneRail } from "@/lib/toneMap";

export function inboxStatusRailClass(status: string): string {
  if (status === "sent") return toneRail("primary");
  if (status === "bounced") return toneRail("high");
  if (status === "complained") return toneRail("medium");
  return toneRail("danger");
}

export function inboxListRailClass(statuses: readonly string[]): string {
  if (statuses.length === 0) return toneRail("idle");
  if (statuses.includes("failed")) return toneRail("danger");
  if (statuses.includes("bounced")) return toneRail("high");
  if (statuses.includes("complained")) return toneRail("medium");
  return toneRail("primary");
}
