import { describe, expect, it } from "vitest";

const SPECS = import.meta.glob("../../e2e/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const HUES =
  "red|orange|amber|yellow|blue|sky|emerald|green|gray|violet|rose|pink|purple|indigo|cyan|teal|lime|slate|zinc|neutral|stone|fuchsia";

// Selecting by any of these couples a spec to how a control is painted or
// ordered rather than what it is, so a restyle or a reorder breaks the suite.
const BANNED = [
  {
    kind: "a palette class",
    pattern: new RegExp(
      `\\.(?:text|bg|border|from|to|via)-(?:${HUES})-\\d{2,3}`,
    ),
  },
  { kind: "a lucide icon class", pattern: /svg\.lucide-/ },
  { kind: "a positional index", pattern: /\.nth\(/ },
];

describe("e2e specs select by stable hooks", () => {
  it("has specs to check", () => {
    expect(Object.keys(SPECS).length).toBeGreaterThan(0);
  });

  it.each(BANNED)("never selects by $kind", ({ pattern }) => {
    const offenders: string[] = [];
    for (const [path, contents] of Object.entries(SPECS)) {
      for (const [index, line] of contents.split("\n").entries()) {
        if (pattern.test(line)) {
          offenders.push(
            `${path.replace("../../", "")}:${index + 1}: ${line.trim()}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
