import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../index.css"),
  "utf8",
);

function block(name: string): string {
  const match = css.match(new RegExp(`${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) {
    throw new Error(`missing CSS block ${name}`);
  }
  return match[1];
}

function token(source: string, key: string): string {
  const match = source.match(new RegExp(`${key}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`missing token ${key}`);
  }
  return match[1].trim();
}

describe("P15 S1 theme tokens", () => {
  it("keeps Sinexis primary green", () => {
    expect(token(block(":root"), "--primary")).toBe("hsl(142 71% 45%)");
    expect(token(block(".dark"), "--primary")).toBe("hsl(142 71% 45%)");
  });

  it("flushes sidebar with canvas in both themes", () => {
    const light = block(":root");
    const dark = block(".dark");
    expect(token(light, "--sidebar")).toBe(token(light, "--background"));
    expect(token(dark, "--sidebar")).toBe(token(dark, "--background"));
    expect(token(light, "--sidebar")).toBe("hsl(0 0% 98%)");
    expect(token(dark, "--sidebar")).toBe("hsl(0 0% 4%)");
  });

  it("uses theme-v1 radius 0.75rem", () => {
    expect(token(block("@theme inline"), "--radius")).toBe("0.75rem");
  });
});
