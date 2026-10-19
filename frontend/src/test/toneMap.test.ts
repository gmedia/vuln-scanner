import { describe, expect, it } from "vitest";
import { toneRail, toneText, toneWash, type Tone } from "@/lib/toneMap";

const RAILS: Array<[Tone, string]> = [
  ["primary", "bg-primary"],
  ["success", "bg-primary"],
  ["enabled", "bg-primary"],
  ["completed", "bg-primary"],
  ["danger", "bg-destructive"],
  ["critical", "bg-destructive"],
  ["failed", "bg-destructive"],
  ["warn", "bg-amber-600"],
  ["pending", "bg-amber-600"],
  ["alert", "bg-orange-600"],
  ["high", "bg-orange-600"],
  ["info", "bg-sky-600"],
  ["running", "bg-sky-600"],
  ["medium", "bg-yellow-700"],
  ["low", "bg-blue-500"],
  ["idle", "bg-border"],
  ["disabled", "bg-border"],
];

describe("toneMap", () => {
  it.each(RAILS)("maps %s to its rail", (tone, expected) => {
    expect(toneRail(tone)).toBe(expected);
  });

  it("only washes critical states and success", () => {
    expect(toneWash("danger")).toBe("bg-destructive/[0.04]");
    expect(toneWash("critical")).toBe("bg-destructive/[0.04]");
    expect(toneWash("failed")).toBe("bg-destructive/[0.04]");
    expect(toneWash("warn")).toBe("bg-amber-500/[0.04]");
    expect(toneWash("success")).toBe("bg-primary/5");
    expect(toneWash("completed")).toBe("bg-primary/5");
    expect(toneWash("primary")).toBeUndefined();
    expect(toneWash("idle")).toBeUndefined();
  });

  it("gives every tone a readable value colour", () => {
    for (const [tone] of RAILS) {
      expect(toneText(tone)).toMatch(/^text-/);
    }
    expect(toneText("danger")).toBe("text-destructive");
    expect(toneText("primary")).toBe("text-primary-text");
    expect(toneText("idle")).toBe("text-muted-foreground");
  });
});

const CHROME_SOURCES = import.meta.glob(
  [
    "../components/admin/adminChrome.ts",
    "../components/auth/authChrome.ts",
    "../components/credit/creditChrome.ts",
    "../components/dashboard/dashboardChrome.ts",
    "../components/host/hostChrome.ts",
    "../components/inbox/inboxChrome.ts",
    "../components/profile/profileChrome.ts",
    "../components/scan/scanChrome.ts",
    "../components/schedules/scheduleChrome.ts",
    "../components/status/statusChrome.ts",
    "../components/uptime/uptimeChrome.ts",
    "../components/workspace/workspaceChrome.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const RAW_RAIL =
  /["']bg-(?:destructive|primary|border|amber-600|orange-600|sky-600|yellow-700|blue-500)["']/;

describe("chrome modules", () => {
  it("loads every status chrome module", () => {
    expect(Object.keys(CHROME_SOURCES)).toHaveLength(12);
  });

  it("routes rail and wash colours through toneMap", () => {
    const offenders: string[] = [];
    for (const [path, source] of Object.entries(CHROME_SOURCES)) {
      for (const [index, line] of source.split("\n").entries()) {
        if (RAW_RAIL.test(line)) {
          offenders.push(`${path.replace("../", "")}:${index + 1}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
