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

const ACCESSIBLE_NAME = /\s(?:id|aria-label|aria-labelledby)=/;

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

// Character walk, not regex: `=>` and string props contain `>`.
function jsxTagBlocks(
  source: string,
  name: string,
): Array<{ readonly line: number; readonly block: string }> {
  const blocks: Array<{ line: number; block: string }> = [];
  const opener = new RegExp(`<${name}(?=[\\s/>])`, "g");
  for (const match of source.matchAll(opener)) {
    const start = match.index ?? 0;
    let index = start + match[0].length;
    let braces = 0;
    let quote: string | null = null;
    while (index < source.length) {
      const char = source[index] as string;
      if (quote) {
        if (char === "\\") index += 2;
        else {
          if (char === quote) quote = null;
          index += 1;
        }
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        index += 1;
        continue;
      }
      if (char === "{") braces += 1;
      else if (char === "}") braces -= 1;
      else if (char === ">" && braces === 0) break;
      index += 1;
    }
    const block = source.slice(start, index + 1);
    blocks.push({
      line: source.slice(0, start).split("\n").length,
      block,
    });
  }
  return blocks;
}

function scanControls(): { total: number; unlabeled: Violation[] } {
  const unlabeled: Violation[] = [];
  let total = 0;
  for (const [path, source] of FILES) {
    const file = rel(path);
    if (file.startsWith("components/ui/")) continue;
    for (const tag of ["Input", "Textarea", "SelectTrigger"]) {
      for (const { line, block } of jsxTagBlocks(source, tag)) {
        total += 1;
        if (!ACCESSIBLE_NAME.test(block)) {
          unlabeled.push({
            file,
            line,
            text: block.split("\n")[0]?.trim() ?? tag,
          });
        }
      }
    }
  }
  return { total, unlabeled };
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

  it("requires an accessible name on every form control", () => {
    const { total, unlabeled } = scanControls();
    expect(total).toBeGreaterThan(50);
    expect(
      unlabeled,
      `Add id + Label htmlFor, or aria-label:\n${report(unlabeled)}`,
    ).toEqual([]);
  });
});
