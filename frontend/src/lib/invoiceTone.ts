export type InvoiceTone = "success" | "warn" | "danger" | "idle";

export function invoiceStatusTone(status: string): InvoiceTone {
  if (status === "paid") return "success";
  if (status === "sent") return "warn";
  if (status === "void") return "danger";
  return "idle";
}

export function invoiceListTone(statuses: readonly string[]): InvoiceTone {
  if (statuses.length === 0) return "idle";
  if (statuses.includes("void")) return "danger";
  if (statuses.includes("sent")) return "warn";
  if (statuses.includes("paid")) return "success";
  return "idle";
}
