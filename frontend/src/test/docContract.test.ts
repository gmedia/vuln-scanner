import { describe, expect, it } from "vitest";

const DOCS = import.meta.glob(
  ["../../DESIGN.md", "../../AGENTS.md", "../../design/*.md"],
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
const DESIGN_LINK = /\((?:\.\/)?design\/([a-z0-9-]+\.md)\)/g;

type Doc = { readonly name: string; readonly text: string };

function name(path: string): string {
  return path.replace(/^\.\.\/\.\.\//, "").replace(/^\.\.\//, "");
}

const parsed: Doc[] = Object.entries(DOCS).map(([path, text]) => ({
  name: name(path),
  text,
}));

const byName = new Map(parsed.map((doc) => [doc.name, doc.text]));

describe("design doc contract", () => {
  it("loads the index and every surface file", () => {
    const names = parsed.map((d) => d.name).sort();
    expect(names).toContain("AGENTS.md");
    expect(names).toContain("DESIGN.md");
    expect(names.filter((n) => n.startsWith("design/")).length).toBe(13);
    expect(parsed.every((d) => d.text.length > 500)).toBe(true);
  });

  it("links every surface file from the index", () => {
    const index = byName.get("DESIGN.md") ?? "";
    const linked = new Set(
      [...index.matchAll(DESIGN_LINK)].map((m) => `design/${m[1]}`),
    );
    const onDisk = parsed
      .map((d) => d.name)
      .filter((n) => n.startsWith("design/"));
    const unlinked = onDisk.filter((n) => !linked.has(n));
    expect(
      unlinked,
      `Add these to the DESIGN.md surface map:\n${unlinked.join("\n")}`,
    ).toEqual([]);
  });

  it("does not link a surface file that is missing", () => {
    const index = byName.get("DESIGN.md") ?? "";
    const linked = [...index.matchAll(DESIGN_LINK)].map(
      (m) => `design/${m[1]}`,
    );
    const broken = linked.filter((n) => !byName.has(n));
    expect(
      [...new Set(broken)],
      `DESIGN.md links files that do not exist:\n${broken.join("\n")}`,
    ).toEqual([]);
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

  it("keeps the eight contract sections in every surface file", () => {
    const SECTIONS = [
      "Research Log",
      "Atmosphere & Identity",
      "Color",
      "Typography",
      "Spacing & Layout",
      "Motion",
      "Depth & Surface",
      "Accessibility",
    ];
    const broken: string[] = [];
    for (const doc of parsed) {
      if (!doc.name.startsWith("design/") || doc.name === "design/foundation.md") {
        continue;
      }
      for (const section of SECTIONS) {
        if (!doc.text.includes(section)) broken.push(`${doc.name}: ${section}`);
      }
    }
    expect(
      broken,
      `Surface files must keep the eight contract sections:\n${broken.join("\n")}`,
    ).toEqual([]);
  });
});
