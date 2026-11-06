import { describe, expect, it } from "vitest";
import { guardSyncOutcome } from "@/components/guard/useGuardConsole";

describe("guardSyncOutcome", () => {
  it("treats a completed sync as ok", () => {
    expect(guardSyncOutcome({ ok: true, agents: 1, alerts: 0 })).toBe("ok");
  });

  it("treats a status response without an ok flag as ok", () => {
    expect(guardSyncOutcome({ enabled: true })).toBe("ok");
  });

  it("maps the not_enabled reason", () => {
    expect(guardSyncOutcome({ ok: false, reason: "not_enabled" })).toBe(
      "not_enabled",
    );
  });

  it("maps other ok:false responses to failed", () => {
    expect(guardSyncOutcome({ ok: false })).toBe("failed");
    expect(guardSyncOutcome({ ok: false, error: "manager unreachable" })).toBe(
      "failed",
    );
  });

  it("treats a missing payload as ok", () => {
    expect(guardSyncOutcome(undefined)).toBe("ok");
    expect(guardSyncOutcome(null)).toBe("ok");
  });
});
