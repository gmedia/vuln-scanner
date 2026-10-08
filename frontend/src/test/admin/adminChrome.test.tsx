import { describe, it, expect } from "vitest";
import {
  adminRailClass,
  adminWashClass,
  kpiTone,
  kpiValueClass,
  mutationTone,
  userTone,
} from "@/components/admin/adminChrome";

describe("adminChrome helpers", () => {
  it("maps tones to rail classes", () => {
    expect(adminRailClass("danger")).toBe("bg-destructive");
    expect(adminRailClass("warn")).toBe("bg-amber-500");
    expect(adminRailClass("alert")).toBe("bg-orange-500");
    expect(adminRailClass("info")).toBe("bg-sky-500");
    expect(adminRailClass("idle")).toBe("bg-border");
    expect(adminRailClass("primary")).toBe("bg-primary");
    expect(adminRailClass("success")).toBe("bg-primary");
  });

  it("maps tones to washes", () => {
    expect(adminWashClass("danger")).toBe("bg-destructive/[0.04]");
    expect(adminWashClass("warn")).toBe("bg-amber-500/[0.04]");
    expect(adminWashClass("success")).toBe("bg-primary/5");
    expect(adminWashClass("alert")).toBeUndefined();
    expect(adminWashClass("idle")).toBeUndefined();
  });

  it("maps KPI kinds to tones and value colors", () => {
    expect(kpiTone("users")).toBe("info");
    expect(kpiTone("scans")).toBe("primary");
    expect(kpiTone("findings")).toBe("alert");
    expect(kpiTone("creditsIn")).toBe("primary");
    expect(kpiTone("creditsUsed")).toBe("warn");
    expect(kpiValueClass("info")).toBe("text-sky-400");
    expect(kpiValueClass("alert")).toBe("text-orange-400");
    expect(kpiValueClass("warn")).toBe("text-amber-400");
    expect(kpiValueClass("primary")).toBe("text-primary");
  });

  it("derives the user row tone", () => {
    expect(userTone({ is_verified: false, is_admin: false })).toBe("warn");
    expect(userTone({ is_verified: false, is_admin: true })).toBe("warn");
    expect(userTone({ is_verified: true, is_admin: true })).toBe("primary");
    expect(userTone({ is_verified: true, is_admin: false })).toBe("idle");
  });

  it("derives the mutation tone with error > pending > success precedence", () => {
    expect(mutationTone({ error: false, success: false, pending: false })).toBe(
      "primary",
    );
    expect(mutationTone({ error: false, success: false, pending: true })).toBe(
      "info",
    );
    expect(mutationTone({ error: false, success: true, pending: false })).toBe(
      "success",
    );
    expect(mutationTone({ error: true, success: true, pending: true })).toBe(
      "danger",
    );
  });
});
