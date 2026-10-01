import { describe, expect, it } from "vitest";
import css from "../index.css?raw";

function blocks(name: string): string[] {
  const re = new RegExp(`${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "g");
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    found.push(match[1]);
  }
  if (found.length === 0) {
    throw new Error(`missing CSS block ${name}`);
  }
  return found;
}

function block(name: string): string {
  return blocks(name)[0];
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
    for (const dark of blocks(".dark")) {
      if (dark.includes("--primary:")) {
        expect(token(dark, "--primary")).toBe("hsl(142 71% 45%)");
      }
    }
  });

  it("flushes sidebar with canvas in both themes", () => {
    const light = block(":root");
    expect(token(light, "--sidebar")).toBe(token(light, "--background"));
    expect(token(light, "--sidebar")).toBe("hsl(0 0% 98%)");
    for (const dark of blocks(".dark")) {
      if (dark.includes("--sidebar:")) {
        expect(token(dark, "--sidebar")).toBe(token(dark, "--background"));
        expect(token(dark, "--sidebar")).toBe("hsl(0 0% 4%)");
      }
    }
  });

  it("does not reintroduce a contrast sidebar strip after the main .dark block", () => {
    expect(css).not.toMatch(/--sidebar:\s*hsl\(0 0% 9%\)/);
    expect(blocks(".dark").filter((b) => b.includes("--sidebar:")).length).toBe(
      1,
    );
  });

  it("uses theme-v1 radius 0.75rem", () => {
    expect(token(block("@theme inline"), "--radius")).toBe("0.75rem");
  });

  it("keeps dark hairlines whisper-quiet vs canvas (Grok2API, not #741 loud grey)", () => {
    const dark = blocks(".dark").find((b) => b.includes("--border:"));
    expect(dark).toBeDefined();
    const source = dark ?? "";
    expect(token(source, "--card")).toBe("hsl(0 0% 8%)");
    expect(token(source, "--popover")).toBe("hsl(0 0% 8%)");
    expect(token(source, "--border")).toBe("hsl(0 0% 100% / 0.08)");
    expect(token(source, "--sidebar-border")).toBe("hsl(0 0% 100% / 0.06)");
    expect(token(source, "--input")).toBe("hsl(0 0% 12%)");
    expect(token(source, "--muted")).toBe("hsl(0 0% 12%)");
    expect(token(source, "--muted-foreground")).toBe("hsl(0 0% 55%)");
    expect(source).not.toMatch(/--border:\s*hsl\(0 0% 2[28]%\)/);
  });
});
