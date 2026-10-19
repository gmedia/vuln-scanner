import { describe, expect, it } from "vitest";
import { invoiceListTone, invoiceStatusTone } from "@/lib/invoiceTone";

describe("invoiceStatusTone", () => {
  it("maps each invoice status", () => {
    expect(invoiceStatusTone("paid")).toBe("success");
    expect(invoiceStatusTone("sent")).toBe("warn");
    expect(invoiceStatusTone("void")).toBe("danger");
    expect(invoiceStatusTone("draft")).toBe("idle");
    expect(invoiceStatusTone("unknown")).toBe("idle");
  });
});

describe("invoiceListTone", () => {
  it("is idle for an empty list", () => {
    expect(invoiceListTone([])).toBe("idle");
  });

  it("reports the worst status present", () => {
    expect(invoiceListTone(["paid"])).toBe("success");
    expect(invoiceListTone(["paid", "sent"])).toBe("warn");
    expect(invoiceListTone(["paid", "sent", "void"])).toBe("danger");
    expect(invoiceListTone(["draft", "paid"])).toBe("success");
    expect(invoiceListTone(["draft"])).toBe("idle");
  });
});
