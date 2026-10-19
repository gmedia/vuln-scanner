import { describe, expect, it } from "vitest";
import {
  quotaIndicatorClass,
  quotaRailClass,
  quotaState,
} from "@/lib/quota";

describe("quotaState", () => {
  it("is ok below 80%", () => {
    expect(quotaState(0, 10)).toEqual({ pct: 0, tone: "ok", atCap: false });
    expect(quotaState(7, 10)).toEqual({ pct: 70, tone: "ok", atCap: false });
    expect(quotaState(79, 100).tone).toBe("ok");
  });

  it("warns from 80% up to the cap", () => {
    expect(quotaState(8, 10)).toEqual({ pct: 80, tone: "warn", atCap: false });
    expect(quotaState(99, 100).tone).toBe("warn");
  });

  it("caps at 100% and stays capped when over", () => {
    expect(quotaState(10, 10)).toEqual({ pct: 100, tone: "cap", atCap: true });
    expect(quotaState(11, 10)).toEqual({ pct: 100, tone: "cap", atCap: true });
  });

  it("treats a non-positive limit as an empty ok quota", () => {
    expect(quotaState(0, 0)).toEqual({ pct: 0, tone: "ok", atCap: false });
    expect(quotaState(5, 0)).toEqual({ pct: 0, tone: "ok", atCap: false });
  });

  it("rounds the percentage", () => {
    expect(quotaState(1, 3).pct).toBe(33);
    expect(quotaState(2, 3).pct).toBe(67);
  });
});

describe("quota classes", () => {
  it("maps tones to the shared rail palette", () => {
    expect(quotaRailClass("ok")).toBe("bg-primary");
    expect(quotaRailClass("warn")).toBe("bg-amber-600");
    expect(quotaRailClass("cap")).toBe("bg-destructive");
  });

  it("only paints a progress indicator when warned or capped", () => {
    expect(quotaIndicatorClass("ok")).toBeUndefined();
    expect(quotaIndicatorClass("warn")).toBe("bg-amber-600");
    expect(quotaIndicatorClass("cap")).toBe("bg-destructive");
  });
});
