import { toneRail, toneWash } from "@/lib/toneMap";
import {
  invoiceListTone as sharedInvoiceListTone,
  invoiceStatusTone as sharedInvoiceStatusTone,
} from "@/lib/invoiceTone";

export type WorkspaceTone =
  "primary" | "success" | "danger" | "warn" | "info" | "idle";

export function workspaceRailClass(tone: WorkspaceTone): string {
  return toneRail(tone);
}

export function workspaceWashClass(tone: WorkspaceTone): string | undefined {
  return toneWash(tone);
}

export function roleTone(role: string): WorkspaceTone {
  if (role === "owner") return "primary";
  if (role === "admin") return "success";
  if (role === "viewer") return "idle";
  return "info";
}

export function invoiceTone(status: string): WorkspaceTone {
  return sharedInvoiceStatusTone(status);
}

export function countTone(count: number | undefined): WorkspaceTone {
  return count && count > 0 ? "primary" : "idle";
}

export function invoiceListTone(statuses: readonly string[]): WorkspaceTone {
  return sharedInvoiceListTone(statuses);
}

export function formTone(input: {
  readonly error: boolean;
  readonly pending: boolean;
}): WorkspaceTone {
  if (input.error) return "danger";
  if (input.pending) return "info";
  return "primary";
}
