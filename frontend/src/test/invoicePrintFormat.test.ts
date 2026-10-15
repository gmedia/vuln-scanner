import { describe, it, expect } from "vitest";
import {
  formatIdr,
  formatPeriod,
  statusModifier,
} from "@/components/invoice/invoicePrintFormat";

describe("invoicePrintFormat", () => {
  it("formats IDR with an id-ID grouping separator", () => {
    expect(formatIdr(300000)).toBe("Rp 300.000");
    expect(formatIdr(2000000)).toBe("Rp 2.000.000");
  });

  it("formats a period ISO timestamp as YYYY-MM-DD", () => {
    expect(formatPeriod("2026-09-01T00:00:00Z")).toBe("2026-09-01");
    expect(formatPeriod("not-a-date")).toBe("not-a-date");
  });

  it("maps invoice status to a print chip modifier", () => {
    expect(statusModifier("paid")).toBe("inv-status--paid");
    expect(statusModifier("sent")).toBe("inv-status--sent");
    expect(statusModifier("void")).toBe("inv-status--void");
    expect(statusModifier("draft")).toBe("inv-status--draft");
    expect(statusModifier("mystery")).toBe("inv-status--draft");
  });
});
