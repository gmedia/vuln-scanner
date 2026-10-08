import { describe, it, expect } from "vitest";
import {
  inboxListRailClass,
  inboxStatusRailClass,
} from "@/components/inbox/inboxChrome";

describe("inboxChrome rail helpers", () => {
  it("rails a single status", () => {
    expect(inboxStatusRailClass("sent")).toBe("bg-primary");
    expect(inboxStatusRailClass("bounced")).toBe("bg-orange-500");
    expect(inboxStatusRailClass("complained")).toBe("bg-yellow-500");
    expect(inboxStatusRailClass("failed")).toBe("bg-destructive");
    expect(inboxStatusRailClass("unknown")).toBe("bg-destructive");
  });

  it("rails the list by the worst status", () => {
    expect(inboxListRailClass([])).toBe("bg-border");
    expect(inboxListRailClass(["sent"])).toBe("bg-primary");
    expect(inboxListRailClass(["sent", "complained"])).toBe("bg-yellow-500");
    expect(inboxListRailClass(["complained", "bounced"])).toBe("bg-orange-500");
    expect(inboxListRailClass(["bounced", "failed"])).toBe("bg-destructive");
  });
});
