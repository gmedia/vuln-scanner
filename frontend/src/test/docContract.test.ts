import { describe, expect, it } from "vitest";

const DOCS = import.meta.glob(
  ["../../DESIGN.md", "../../AGENTS.md"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const SRC = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SOURCE_FILES = new Set(
  Object.keys(SRC).map((path) => path.replace(/^\.\.\//, "")),
);

const RETIRED = ["SiemEmptyIsland"];

const LOCAL_PATH = /`((?:components|pages|lib|hooks|theme)\/[^`]+?\.tsx?)`/g;

type Doc = { readonly name: string; readonly text: string };

const parsed: Doc[] = Object.entries(DOCS).map(([path, text]) => ({
  name: path.replace(/^\.\.\/\.\.\//, "").replace(/^\.\.\//, ""),
  text,
}));

describe("design doc contract", () => {
  it("loads the design docs", () => {
    expect(parsed.map((d) => d.name).sort()).toEqual(["AGENTS.md", "DESIGN.md"]);
    expect(parsed.every((d) => d.text.length > 1000)).toBe(true);
  });

  it("references only source files that exist", () => {
    const missing: string[] = [];
    let checked = 0;
    for (const doc of parsed) {
      for (const match of doc.text.matchAll(LOCAL_PATH)) {
        const path = match[1] as string;
        checked += 1;
        if (!SOURCE_FILES.has(path)) missing.push(`${doc.name}: ${path}`);
      }
    }
    expect(checked).toBeGreaterThan(5);
    expect(
      [...new Set(missing)],
      `Docs point at deleted files. Fix the path or the prose:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("does not name retired primitives", () => {
    const found: string[] = [];
    for (const doc of parsed) {
      for (const name of RETIRED) {
        if (doc.text.includes(name)) found.push(`${doc.name}: ${name}`);
      }
    }
    expect(
      found,
      `These primitives were removed. Document their successor instead:\n${found.join("\n")}`,
    ).toEqual([]);
  });
});
