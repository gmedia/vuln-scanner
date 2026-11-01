import { describe, expect, it } from "vitest";

// Page-nav tab strips are `TabsList variant="line"` under src/pages. They must
// stay on the shared chrome, wrap below `sm` instead of scrolling, and stay
// within the 5-tab budget. See docs/specs/design-invariants.md §1 invariant 28
// and frontend/design/navigation.md. Read as raw source so the check needs no
// filesystem access (same pattern as e2eSelectors.test.ts).
const PAGES = import.meta.glob("../pages/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const REQUIRED_CHROME = [
  "w-full",
  "flex-wrap",
  "sm:flex-nowrap",
  "justify-start",
] as const;

const BANNED_STRIP = [
  "min-w-max",
  "w-max",
  "overflow-x-auto",
  "overflow-x-scroll",
  "snap-x",
  "whitespace-normal",
] as const;

const MAX_TABS = 5;

type PageNavList = {
  readonly file: string;
  readonly tag: string;
  readonly triggers: number;
};

// Character walk, not regex: `=>` and string props contain `>`.
function openingTagEnd(source: string, start: number): number {
  let index = start;
  let braces = 0;
  let quote: string | null = null;
  while (index < source.length) {
    const char = source[index] as string;
    if (quote) {
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      index += 1;
      continue;
    }
    if (char === "{") braces += 1;
    else if (char === "}") braces -= 1;
    else if (char === ">" && braces === 0) return index;
    index += 1;
  }
  return -1;
}

function pageNavLists(): PageNavList[] {
  const lists: PageNavList[] = [];
  for (const [path, source] of Object.entries(PAGES)) {
    const rel = path.replace(/^\.\.\//, "");
    let cursor = 0;
    while (cursor < source.length) {
      const start = source.indexOf("<TabsList", cursor);
      if (start < 0) break;
      const end = openingTagEnd(source, start);
      if (end < 0) break;
      const tag = source.slice(start, end + 1);
      cursor = end + 1;
      if (!tag.includes('variant="line"')) continue;
      const close = source.indexOf("</TabsList>", end + 1);
      const body = close < 0 ? "" : source.slice(end + 1, close);
      const triggers = body.match(/<TabsTrigger\b/g)?.length ?? 0;
      lists.push({ file: rel, tag, triggers });
    }
  }
  return lists;
}

function snippet(list: PageNavList): string {
  return `${list.file}:${list.tag.replace(/\s+/g, " ").trim()}`;
}

const LISTS = pageNavLists();

describe("page-nav tabs", () => {
  it("keeps the shared chrome classes on every page-nav tab strip", () => {
    const bad = LISTS.filter((list) =>
      REQUIRED_CHROME.some((className) => !list.tag.includes(className)),
    ).map(snippet);
    expect(
      bad,
      `Page-nav TabsList must carry w-full flex-wrap justify-start sm:flex-nowrap:\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("bans overflow-strip utilities on page-nav tab strips", () => {
    const bad = LISTS.filter((list) =>
      BANNED_STRIP.some((utility) => list.tag.includes(utility)),
    ).map(snippet);
    expect(
      bad,
      `Page-nav tabs wrap; they never scroll or stretch the document:\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps page-nav tab strips at 1..5 triggers", () => {
    const bad = LISTS.filter(
      (list) => list.triggers < 1 || list.triggers > MAX_TABS,
    ).map(
      (list) =>
        `${snippet(list)} has ${list.triggers} triggers (max ${MAX_TABS})`,
    );
    expect(
      bad,
      `A 6th tab is a section, a header action, or its own route:\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("finds the expected page-nav tab strips (parser sanity)", () => {
    expect(
      LISTS.length,
      "Fewer page-nav tab strips than expected — the TabsList parser likely broke",
    ).toBeGreaterThanOrEqual(6);
  });
});
