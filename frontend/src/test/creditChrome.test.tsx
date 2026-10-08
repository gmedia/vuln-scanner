import { describe, it, expect } from "vitest";
import {
  creditListRailClass,
  creditTypeRailClass,
} from "@/components/credit/creditChrome";

describe("creditChrome rail helpers", () => {
  it("rails a single ledger type", () => {
    expect(creditTypeRailClass("credit")).toBe("bg-primary");
    expect(creditTypeRailClass("refund")).toBe("bg-blue-500");
    expect(creditTypeRailClass("deduct")).toBe("bg-destructive");
  });

  it("rails the ledger shell by the page net", () => {
    expect(creditListRailClass([], 0)).toBe("bg-border");
    expect(creditListRailClass(["credit"], 100)).toBe("bg-primary");
    expect(creditListRailClass(["deduct"], -100)).toBe("bg-destructive");
    expect(creditListRailClass(["credit", "deduct"], 0)).toBe("bg-primary");
  });
});
