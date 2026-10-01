import { describe, expect, it } from "vitest";
import {
  indexerHealth,
  severityBadgeVariant,
  severityFromLevel,
  severityLabelKey,
  severityRailClass,
} from "@/lib/siemSeverity";

describe("severityFromLevel", () => {
  it("maps Wazuh rule_level bands to SIEM severity", () => {
    expect(severityFromLevel(12)).toBe("critical");
    expect(severityFromLevel(15)).toBe("critical");
    expect(severityFromLevel(7)).toBe("high");
    expect(severityFromLevel(11)).toBe("high");
    expect(severityFromLevel(4)).toBe("medium");
    expect(severityFromLevel(6)).toBe("medium");
    expect(severityFromLevel(0)).toBe("low");
    expect(severityFromLevel(3)).toBe("low");
  });
});

describe("severityRailClass", () => {
  it("returns the 2px rail token for each band", () => {
    expect(severityRailClass(12)).toBe("bg-destructive");
    expect(severityRailClass(7)).toBe("bg-orange-500");
    expect(severityRailClass(4)).toBe("bg-yellow-500");
    expect(severityRailClass(1)).toBe("bg-blue-500");
  });
});

describe("severityBadgeVariant", () => {
  it("returns kit Badge variants, not ad-hoc color classes", () => {
    expect(severityBadgeVariant(12)).toBe("critical");
    expect(severityBadgeVariant(10)).toBe("high");
    expect(severityBadgeVariant(5)).toBe("medium");
    expect(severityBadgeVariant(2)).toBe("low");
  });
});

describe("severityLabelKey", () => {
  it("points at existing i18n sev* keys", () => {
    expect(severityLabelKey(12)).toBe("sevCritical");
    expect(severityLabelKey(7)).toBe("sevHigh");
    expect(severityLabelKey(4)).toBe("sevMedium");
    expect(severityLabelKey(0)).toBe("sevLow");
  });
});

describe("indexerHealth", () => {
  it("prefers unreachable over degraded", () => {
    expect(
      indexerHealth({ indexer_reachable: false, degraded: true }),
    ).toBe("down");
  });

  it("marks reachable+degraded as degraded", () => {
    expect(
      indexerHealth({ indexer_reachable: true, degraded: true }),
    ).toBe("degraded");
  });

  it("marks reachable and healthy as live", () => {
    expect(
      indexerHealth({ indexer_reachable: true, degraded: false }),
    ).toBe("live");
  });
});
