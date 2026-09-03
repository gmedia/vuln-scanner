import { describe, expect, it } from "vitest";
import {
  SINEXIS_INSTALL_RAW_URL,
  SINEXIS_INSTALL_WGET,
  formatHelperPollAt,
  isHelperPollStale,
} from "@/lib/sinexisInstall";

describe("sinexisInstall", () => {
  it("points wget at GitHub raw, not a clone", () => {
    expect(SINEXIS_INSTALL_RAW_URL).toMatch(/sinexis-install\.sh$/);
    expect(SINEXIS_INSTALL_WGET).toContain("wget -O sinexis-install.sh");
    expect(SINEXIS_INSTALL_WGET).not.toMatch(/git clone/i);
    expect(SINEXIS_INSTALL_WGET).toContain("head -n1");
  });

  it("treats missing or old helper polls as stale", () => {
    const now = Date.parse("2026-09-03T12:00:00Z");
    expect(isHelperPollStale(null, now)).toBe(true);
    expect(isHelperPollStale("not-a-date", now)).toBe(true);
    expect(isHelperPollStale("2026-09-03T11:00:00Z", now)).toBe(true);
    expect(isHelperPollStale("2026-09-03T11:45:00Z", now)).toBe(false);
  });

  it("formats helper poll timestamps", () => {
    expect(formatHelperPollAt(null)).toBeNull();
    expect(formatHelperPollAt("2026-09-03T12:00:00Z")).toMatch(/2026/);
  });
});
