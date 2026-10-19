import { describe, expect, it } from "vitest";

// Raw color literals are only allowed for third-party brand marks and data
// palettes. See docs/specs/design-invariants.md §2.
const COLOR_ALLOWLIST: ReadonlySet<string> = new Set([
  "theme/theme.ts",
  "lib/tagColors.ts",
  "components/auth/GoogleSignInButton.tsx",
  "components/ui/chart.tsx",
  "pages/admin/AdminDashboard.tsx",
]);

const WINDOW_DIALOG = /window\.(?:confirm|alert|prompt)\s*\(/;
const RAW_HEX = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/;
const NUMERIC_HSL = /hsl[a]?\(\s*\d/;
const ARBITRARY_HEX_CLASS =
  /(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/;
const NATIVE_SELECT = /<select[\s>]/;
const LOCAL_TILE =
  /(?:function|const)\s+(?:KpiTile|StatTile|StatCard|KpiCard)\b/;
const LOCAL_EMPTY =
  /(?:function|const)\s+(?:EmptyIsland|EmptyState|EmptyPanel)\b/;

const TILE_ALLOWLIST: ReadonlySet<string> = new Set([
  "components/patterns/StatTile.tsx",
]);
const EMPTY_ALLOWLIST: ReadonlySet<string> = new Set([
  "components/patterns/EmptyState.tsx",
]);

const SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const FILES = Object.entries(SOURCES).filter(
  ([path]) => !path.includes("/test/") && !/\.(test|spec)\.(ts|tsx)$/.test(path),
);

type Violation = {
  readonly file: string;
  readonly line: number;
  readonly text: string;
};

function rel(path: string): string {
  return path.replace(/^\.\.\//, "");
}

function scan(pattern: RegExp, allow?: ReadonlySet<string>): Violation[] {
  const found: Violation[] = [];
  for (const [path, source] of FILES) {
    const file = rel(path);
    if (allow?.has(file)) continue;
    for (const [index, text] of source.split("\n").entries()) {
      if (pattern.test(text)) {
        found.push({ file, line: index + 1, text: text.trim() });
      }
    }
  }
  return found;
}

function report(violations: readonly Violation[]): string {
  return violations.map((v) => `${v.file}:${v.line} ${v.text}`).join("\n");
}

describe("design invariants", () => {
  it("bans blocking window dialogs", () => {
    const bad = scan(WINDOW_DIALOG);
    expect(
      bad,
      `Use a controlled AlertDialog (or sonner toast):\n${report(bad)}`,
    ).toEqual([]);
  });

  it("bans native <select>", () => {
    const bad = scan(NATIVE_SELECT);
    expect(
      bad,
      `Use Select from components/ui/Select:\n${report(bad)}`,
    ).toEqual([]);
  });

  it("bans raw color literals outside the allowlist", () => {
    const bad = [
      ...scan(RAW_HEX, COLOR_ALLOWLIST),
      ...scan(NUMERIC_HSL, COLOR_ALLOWLIST),
      ...scan(ARBITRARY_HEX_CLASS),
    ];
    expect(
      bad,
      `Use index.css tokens or lib/toneColors.ts instead:\n${report(bad)}`,
    ).toEqual([]);
  });

  it("bans local KPI tile implementations", () => {
    const bad = scan(LOCAL_TILE, TILE_ALLOWLIST);
    expect(
      bad,
      `Use StatTile from components/patterns/StatTile:\n${report(bad)}`,
    ).toEqual([]);
  });

  it("bans local empty-state implementations", () => {
    const bad = scan(LOCAL_EMPTY, EMPTY_ALLOWLIST);
    expect(
      bad,
      `Use EmptyState from components/patterns/EmptyState:\n${report(bad)}`,
    ).toEqual([]);
  });
});
