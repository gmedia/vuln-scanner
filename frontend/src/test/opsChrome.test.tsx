import { describe, it, expect } from "vitest";
import {
  componentRailClass,
  hostnameRailClass,
  incidentRailClass,
  incidentsListRailClass,
  overallRailClass,
} from "@/components/status/statusChrome";
import { outagesRailClass, stateRailClass } from "@/components/uptime/uptimeChrome";

describe("statusChrome rail helpers", () => {
  it("rails overall state and visibility", () => {
    expect(overallRailClass("operational", true)).toBe("bg-primary");
    expect(overallRailClass("degraded", true)).toBe("bg-amber-500");
    expect(overallRailClass("partial", true)).toBe("bg-orange-500");
    expect(overallRailClass("major", true)).toBe("bg-destructive");
    expect(overallRailClass("operational", false)).toBe("bg-border");
  });

  it("rails component and hostname state", () => {
    expect(componentRailClass("up")).toBe("bg-primary");
    expect(componentRailClass("down")).toBe("bg-destructive");
    expect(componentRailClass("degraded")).toBe("bg-amber-500");
    expect(componentRailClass("unknown")).toBe("bg-border");
    expect(hostnameRailClass("active")).toBe("bg-primary");
    expect(hostnameRailClass("failed")).toBe("bg-destructive");
    expect(hostnameRailClass("pending_txt")).toBe("bg-amber-500");
    expect(hostnameRailClass("none")).toBe("bg-border");
  });

  it("rails a single incident", () => {
    expect(incidentRailClass("resolved")).toBe("bg-primary");
    expect(incidentRailClass("investigating")).toBe("bg-amber-500");
    expect(incidentRailClass("identified")).toBe("bg-orange-500");
    expect(incidentRailClass("monitoring")).toBe("bg-sky-500");
    expect(incidentRailClass("unknown")).toBe("bg-border");
  });

  it("rails an incident list by the worst open status", () => {
    expect(incidentsListRailClass([])).toBe("bg-border");
    expect(incidentsListRailClass(["resolved"])).toBe("bg-primary");
    expect(incidentsListRailClass(["resolved", "monitoring"])).toBe(
      "bg-sky-500",
    );
    expect(incidentsListRailClass(["monitoring", "identified"])).toBe(
      "bg-orange-500",
    );
    expect(incidentsListRailClass(["identified", "investigating"])).toBe(
      "bg-amber-500",
    );
  });
});

describe("uptimeChrome rail helpers", () => {
  it("rails monitor state and enabled flag", () => {
    expect(stateRailClass("up")).toBe("bg-primary");
    expect(stateRailClass("down")).toBe("bg-destructive");
    expect(stateRailClass("degraded")).toBe("bg-amber-500");
    expect(stateRailClass("down", false)).toBe("bg-border");
  });

  it("rails the outages shell by count", () => {
    expect(outagesRailClass(0)).toBe("bg-border");
    expect(outagesRailClass(3)).toBe("bg-destructive");
  });
});
