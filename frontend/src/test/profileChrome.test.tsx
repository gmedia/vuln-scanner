import { describe, it, expect } from "vitest";
import {
  accessTone,
  creditsTone,
  formTone,
  profileRailClass,
  profileWashClass,
  verificationTone,
} from "@/components/profile/profileChrome";

describe("profileChrome helpers", () => {
  it("maps tones to rail classes", () => {
    expect(profileRailClass("danger")).toBe("bg-destructive");
    expect(profileRailClass("warn")).toBe("bg-amber-500");
    expect(profileRailClass("idle")).toBe("bg-border");
    expect(profileRailClass("primary")).toBe("bg-primary");
    expect(profileRailClass("success")).toBe("bg-primary");
  });

  it("maps tones to washes", () => {
    expect(profileWashClass("danger")).toBe("bg-destructive/[0.04]");
    expect(profileWashClass("warn")).toBe("bg-amber-500/[0.04]");
    expect(profileWashClass("success")).toBe("bg-primary/5");
    expect(profileWashClass("primary")).toBeUndefined();
    expect(profileWashClass("idle")).toBeUndefined();
  });

  it("derives verification / access / credits tones", () => {
    expect(verificationTone(true)).toBe("success");
    expect(verificationTone(false)).toBe("warn");
    expect(accessTone(true)).toBe("primary");
    expect(accessTone(false)).toBe("idle");
    expect(creditsTone(10)).toBe("primary");
    expect(creditsTone(0)).toBe("idle");
  });

  it("derives the form tone with success > cooldown > error precedence", () => {
    expect(
      formTone({ cooldown: 0, error: false, success: false }),
    ).toBe("primary");
    expect(formTone({ cooldown: 0, error: true, success: false })).toBe(
      "danger",
    );
    expect(formTone({ cooldown: 20, error: true, success: false })).toBe(
      "warn",
    );
    expect(formTone({ cooldown: 20, error: true, success: true })).toBe(
      "success",
    );
  });
});
