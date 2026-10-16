import { describe, expect, it } from "vitest";
import { TONE_CHIP_TEXT, TONE_TEXT, type ToneHue } from "@/lib/toneColors";

// sRGB values resolved from the Tailwind v4 (oklch) palette the app ships.
const HUES: Record<
  ToneHue,
  { light: string; chip: string; dark: string; tint: string }
> = {
  red: { light: "#c10007", chip: "#9f0712", dark: "#ff6467", tint: "#e7000b" },
  orange: {
    light: "#9f2d00",
    chip: "#9f2d00",
    dark: "#ff8904",
    tint: "#ff6900",
  },
  amber: {
    light: "#973c00",
    chip: "#973c00",
    dark: "#ffb900",
    tint: "#fe9a00",
  },
  yellow: {
    light: "#894b00",
    chip: "#894b00",
    dark: "#fdc700",
    tint: "#f0b100",
  },
  blue: { light: "#1447e6", chip: "#1447e6", dark: "#50a2ff", tint: "#2b7fff" },
  sky: { light: "#0069a8", chip: "#0069a8", dark: "#00bcff", tint: "#00a6f4" },
  emerald: {
    light: "#006045",
    chip: "#006045",
    dark: "#00d492",
    tint: "#00bc7d",
  },
  green: {
    light: "#016630",
    chip: "#016630",
    dark: "#05df72",
    tint: "#00a63e",
  },
  gray: { light: "#364153", chip: "#364153", dark: "#99a1af", tint: "#6a7282" },
  violet: {
    light: "#7008e7",
    chip: "#7008e7",
    dark: "#a684ff",
    tint: "#8e51ff",
  },
};

const CARD = { light: "#ffffff", dark: "#141414" } as const;

function hexChannels(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(raw.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function hexLuminance(hex: string): number {
  const [r, g, b] = hexChannels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const l1 = hexLuminance(a);
  const l2 = hexLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function tint(hex: string, alpha: number, surface: string): string {
  const fg = hexChannels(hex);
  const bg = hexChannels(surface);
  return `#${fg
    .map((c, i) =>
      Math.round(c * alpha + bg[i] * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const HUES_LIST = Object.keys(HUES) as ToneHue[];

describe("tone palette contrast", () => {
  it.each(HUES_LIST)(
    "%s text clears 4.5:1 on the card in both themes",
    (hue) => {
      const spec = HUES[hue];
      for (const theme of ["light", "dark"] as const) {
        const shade = theme === "light" ? spec.light : spec.dark;
        expect(
          contrast(shade, CARD[theme]),
          `${theme}: ${hue} ${shade}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(HUES_LIST)(
    "%s chip text clears 4.5:1 on its own tint in both themes",
    (hue) => {
      const spec = HUES[hue];
      for (const theme of ["light", "dark"] as const) {
        const shade = theme === "light" ? spec.chip : spec.dark;
        for (const alpha of [0.15, 0.2]) {
          const surface = tint(spec.tint, alpha, CARD[theme]);
          expect(
            contrast(shade, surface),
            `${theme}: ${hue} ${shade} on ${alpha} tint ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );
});

describe("tone palette wiring", () => {
  it("pairs a light and a dark shade for every hue", () => {
    for (const hue of HUES_LIST) {
      expect(TONE_TEXT[hue], hue).toMatch(/\bdark:/);
      expect(TONE_CHIP_TEXT[hue], hue).toMatch(/\bdark:/);
    }
  });

  it("keeps the expected shade per hue", () => {
    expect(TONE_TEXT.red).toBe("text-red-700 dark:text-red-400");
    expect(TONE_TEXT.orange).toBe("text-orange-800 dark:text-orange-400");
    expect(TONE_TEXT.amber).toBe("text-amber-800 dark:text-amber-400");
    expect(TONE_TEXT.yellow).toBe("text-yellow-800 dark:text-yellow-400");
    expect(TONE_TEXT.blue).toBe("text-blue-700 dark:text-blue-400");
    expect(TONE_TEXT.sky).toBe("text-sky-700 dark:text-sky-400");
    expect(TONE_TEXT.emerald).toBe("text-emerald-800 dark:text-emerald-400");
    expect(TONE_TEXT.green).toBe("text-green-800 dark:text-green-400");
    expect(TONE_TEXT.gray).toBe("text-gray-700 dark:text-gray-400");
    expect(TONE_TEXT.violet).toBe("text-violet-700 dark:text-violet-400");
  });

  it("darkens only red for chip text", () => {
    expect(TONE_CHIP_TEXT.red).toBe("text-red-800 dark:text-red-400");
    for (const hue of HUES_LIST) {
      if (hue === "red") continue;
      expect(TONE_CHIP_TEXT[hue], hue).toBe(TONE_TEXT[hue]);
    }
  });
});

describe("no fixed palette text shade escapes the tone module", () => {
  const SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  const HUES =
    "red|orange|amber|yellow|blue|sky|emerald|green|gray|violet|rose|pink|purple|indigo|cyan|teal|lime|slate|zinc|neutral|stone|fuchsia";
  const FIXED_SHADE = new RegExp(`(?<!dark:)text-(?:${HUES})-\\d{2,3}`);

  it("only toneColors.ts names a fixed palette text shade", () => {
    const offenders: string[] = [];
    for (const [path, contents] of Object.entries(SOURCES)) {
      if (path.includes(".test.") || path.endsWith("lib/toneColors.ts"))
        continue;
      for (const [index, line] of contents.split("\n").entries()) {
        if (FIXED_SHADE.test(line)) {
          offenders.push(
            `${path.replace("../", "")}:${index + 1}: ${line.trim()}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("e2e specs do not select by palette class", () => {
  const SPECS = import.meta.glob("../../e2e/**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  const HUES =
    "red|orange|amber|yellow|blue|sky|emerald|green|gray|violet|rose|pink|purple|indigo|cyan|teal|lime|slate|zinc|neutral|stone|fuchsia";
  const PALETTE_CLASS = new RegExp(
    `\\.(?:text|bg|border|from|to|via)-(?:${HUES})-\\d{2,3}`,
  );

  it("selects by testid or role instead, so a tone change cannot break it", () => {
    expect(Object.keys(SPECS).length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const [path, contents] of Object.entries(SPECS)) {
      for (const [index, line] of contents.split("\n").entries()) {
        if (PALETTE_CLASS.test(line)) {
          offenders.push(
            `${path.replace("../../", "")}:${index + 1}: ${line.trim()}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("solid rails clear 3:1 on both canvases", () => {
  const SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  // Measured on the light canvas: these read 1.83-2.77:1, under the 3:1 a
  // non-text rail needs. Washes (`/15`, `/[0.04]`) are excluded on purpose.
  const UNDER_THRESHOLD =
    /(?<!dark:)bg-(?:amber|orange|sky)-500(?![0-9/])|(?<!dark:)bg-yellow-500(?![0-9/])/;

  it("never uses a rail shade that misses 3:1 in light", () => {
    const offenders: string[] = [];
    for (const [path, contents] of Object.entries(SOURCES)) {
      if (path.includes(".test.") || path.endsWith("lib/toneColors.ts"))
        continue;
      for (const [index, line] of contents.split("\n").entries()) {
        if (UNDER_THRESHOLD.test(line)) {
          offenders.push(
            `${path.replace("../", "")}:${index + 1}: ${line.trim()}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
