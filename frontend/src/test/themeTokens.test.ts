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

function hslLuminance(value: string): number {
  const match = value.match(
    /hsl\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*\)/,
  );
  if (!match) {
    throw new Error(`unparsable hsl token: ${value}`);
  }
  const hue = Number(match[1]) / 360;
  const sat = Number(match[2]) / 100;
  const light = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const second = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
  const base = light - chroma / 2;
  const [r, g, b] =
    hue < 1 / 6
      ? [chroma, second, 0]
      : hue < 2 / 6
        ? [second, chroma, 0]
        : hue < 3 / 6
          ? [0, chroma, second]
          : hue < 4 / 6
            ? [0, second, chroma]
            : hue < 5 / 6
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const channel = (raw: number) => {
    const value2 = raw + base;
    return value2 <= 0.03928
      ? value2 / 12.92
      : ((value2 + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const l1 = hslLuminance(a);
  const l2 = hslLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

describe("P15 S1 theme tokens", () => {
  it("keeps the Sinexis primary green hue, with a darker lightness only in light theme", () => {
    const light = token(block(":root"), "--primary");
    expect(light).toBe("hsl(142 71% 28%)");
    for (const dark of blocks(".dark")) {
      if (dark.includes("--primary:")) {
        expect(token(dark, "--primary")).toBe("hsl(142 71% 45%)");
      }
    }
  });

  it("keeps primary legible as text and as a button background in both themes", () => {
    const light = block(":root");
    const dark = blocks(".dark").find((b) => b.includes("--primary:")) ?? "";
    const surfaces = ["--background", "--card", "--muted", "--secondary"];

    for (const [name, source] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      if (!source) continue;
      const primary = token(source, "--primary");
      const onPrimary = token(source, "--primary-foreground");
      for (const surface of surfaces) {
        expect(
          contrastRatio(primary, token(source, surface)),
          `${name}: ${primary} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrastRatio(primary, onPrimary),
        `${name}: ${onPrimary} on ${primary}`,
      ).toBeGreaterThanOrEqual(4.5);
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
