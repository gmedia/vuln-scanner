import { toneRail, toneWash } from "@/lib/toneMap";
import type { SubscriptionStatus } from "@/api/subscription";

export type SubscriptionTone =
  | "primary"
  | "success"
  | "danger"
  | "warn"
  | "info"
  | "idle";

export function subscriptionRailClass(tone: SubscriptionTone): string {
  return toneRail(tone);
}

export function subscriptionWashClass(
  tone: SubscriptionTone,
): string | undefined {
  return toneWash(tone);
}

export function planTone(status: SubscriptionStatus): SubscriptionTone {
  if (status === "active") return "primary";
  if (status === "grace") return "warn";
  if (status === "pending_payment") return "warn";
  if (status === "draft") return "info";
  if (status === "expired") return "danger";
  if (status === "enterprise") return "info";
  return "idle";
}

export function planBadgeVariant(
  status: SubscriptionStatus,
): "success" | "pending" | "info" | "failed" | "default" {
  if (status === "active") return "success";
  if (status === "grace") return "pending";
  if (status === "pending_payment") return "pending";
  if (status === "draft") return "info";
  if (status === "expired") return "failed";
  if (status === "enterprise") return "info";
  return "default";
}

export function requestTone(
  status: "pending" | "approved" | "rejected" | "canceled",
): SubscriptionTone {
  if (status === "approved") return "primary";
  if (status === "pending") return "warn";
  if (status === "rejected") return "danger";
  return "idle";
}
