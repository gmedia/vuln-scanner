import { describe, it, expect } from "vitest";
import {
  scannerResultRailClass,
  scannerResultWashClass,
  severityRailClass,
  worstSeverity,
} from "@/components/scan/scanChrome";

describe("scanChrome scanner helpers", () => {
  it("picks the worst severity from a summary", () => {
    expect(worstSeverity(null)).toBeNull();
    expect(
      worstSeverity({ critical: 0, high: 0, medium: 2, low: 0, info: 0 }),
    ).toBe("medium");
    expect(
      worstSeverity({ critical: 1, high: 3, medium: 0, low: 0, info: 0 }),
    ).toBe("critical");
  });

  it("maps each severity to a rail class", () => {
    expect(severityRailClass("critical")).toBe("bg-destructive");
    expect(severityRailClass("high")).toBe("bg-orange-500");
    expect(severityRailClass("medium")).toBe("bg-yellow-500");
    expect(severityRailClass("low")).toBe("bg-blue-500");
    expect(severityRailClass("info")).toBe("bg-border");
  });

  it("rails the results shell by worst severity", () => {
    expect(scannerResultRailClass({ critical: 1 })).toBe("bg-destructive");
    expect(scannerResultRailClass({ critical: 0, high: 1 })).toBe(
      "bg-orange-500",
    );
    expect(scannerResultRailClass({ medium: 1 })).toBe("bg-yellow-500");
    expect(scannerResultRailClass({ low: 1 })).toBe("bg-blue-500");
    expect(scannerResultRailClass({})).toBe("bg-primary");
  });

  it("washes the results shell only for critical or high", () => {
    expect(scannerResultWashClass({ critical: 1 })).toBe("bg-destructive/[0.04]");
    expect(scannerResultWashClass({ high: 2 })).toBe("bg-destructive/[0.04]");
    expect(scannerResultWashClass({ critical: 0, high: 0 })).toBeUndefined();
    expect(scannerResultWashClass({})).toBeUndefined();
  });
});
