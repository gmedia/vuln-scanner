import type { WorkspaceTone } from "@/components/workspace/workspaceChrome";

export type TopupBadgeVariant =
  | "success"
  | "pending"
  | "info"
  | "failed"
  | "default"
  | "medium";

/**
 * Single status -> badge-tone mapping for the customer top-up surfaces.
 * The history list and the order status page must read the same vocabulary.
 */
export function statusBadgeVariant(status: string): TopupBadgeVariant {
  if (status === "paid") return "success";
  if (status === "pending_payment") return "pending";
  if (status === "awaiting_verification") return "info";
  if (status === "rejected") return "failed";
  if (status === "refund_review") return "medium";
  return "default";
}

/** Status -> shell/notice tone used by the order status page. */
export function statusTone(status: string): WorkspaceTone {
  if (status === "paid") return "success";
  if (status === "rejected") return "danger";
  if (status === "refund_review") return "warn";
  if (status === "pending_payment") return "primary";
  if (status === "awaiting_verification") return "info";
  return "idle";
}

/** i18n key for a status value (`pending_payment` -> `statusPendingPayment`). */
export function statusLabelKey(status: string): string {
  const suffix = status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return `status${suffix}`;
}

export function methodLabel(
  t: (key: string) => string,
  method: string,
): string {
  if (method === "midtrans") return t("methodMidtransShort");
  if (method === "manual_transfer") return t("methodManualShort");
  return method;
}
