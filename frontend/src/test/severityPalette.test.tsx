import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import SeverityChart from "@/components/results/SeverityChart";
import scanChrome from "../components/scan/scanChrome.ts?raw";
import badgeVariants from "../components/ui/badgeVariants.ts?raw";
import severityChart from "../components/results/SeverityChart.tsx?raw";
import findingsTable from "../components/results/FindingsTable.tsx?raw";

// sRGB values resolved from the Tailwind v4 (oklch) palette the app ships, so
// these numbers match what the browser actually paints.
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

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

// 4.5:1 — the KPI value is 18px bold at its smallest, which is not large text.
const TEXT = {
  critical: { light: "#dd1313", dark: "#ef4343" },
  high: { light: "#9f2d00", dark: "#ff8904" },
  medium: { light: "#894b00", dark: "#fdc700" },
  low: { light: "#1447e6", dark: "#50a2ff" },
  info: { light: "#364153", dark: "#99a1af" },
} as const;

// The critical chip sits on its own 20% red tint, so it needs red-800, one
// step darker than the plain critical text.
const CHIP_TEXT = {
  ...TEXT,
  critical: { light: "#9f0712", dark: "#ff6467" },
} as const;

const CHIP_BG = {
  critical: "#e7000b",
  high: "#ff6900",
  medium: "#f0b100",
  low: "#2b7fff",
  info: "#6a7282",
} as const;

// Slices are graphics (3:1), so high/medium may sit a step lighter than text.
const CHART = {
  critical: { light: "#c10007", dark: "#ff6467" },
  high: { light: "#ca3500", dark: "#ff8904" },
  medium: { light: "#a65f00", dark: "#fdc700" },
  low: { light: "#1447e6", dark: "#50a2ff" },
  info: { light: "#364153", dark: "#99a1af" },
} as const;

const CHART_VAR = {
  critical: { light: "red-700", dark: "red-400" },
  high: { light: "orange-700", dark: "orange-400" },
  medium: { light: "yellow-700", dark: "yellow-400" },
  low: { light: "blue-700", dark: "blue-400" },
  info: { light: "gray-700", dark: "gray-400" },
} as const;

const DOT = {
  critical: "bg-red-700 dark:bg-red-400",
  high: "bg-orange-700 dark:bg-orange-400",
  medium: "bg-yellow-700 dark:bg-yellow-400",
  low: "bg-blue-700 dark:bg-blue-400",
  info: "bg-gray-700 dark:bg-gray-400",
} as const;

// Severity text renders on the card (KPI tiles, results panel) and on table
// rows that wash to at most muted/30 on hover — never on a full muted fill.
const SURFACE = {
  light: {
    card: "#ffffff",
    background: "#fafafa",
    "hover wash muted/30": tint("#f5f5f5", 0.3, "#ffffff"),
  },
  dark: {
    card: "#141414",
    background: "#0a0a0a",
    "hover wash muted/30": tint("#1f1f1f", 0.3, "#141414"),
  },
} as const;

describe("severity palette contrast", () => {
  it.each(SEVERITIES)(
    "%s severity text clears 4.5:1 on every surface in both themes",
    (severity) => {
      for (const theme of ["light", "dark"] as const) {
        const shade = TEXT[severity][theme];
        for (const [name, surface] of Object.entries(SURFACE[theme])) {
          expect(
            contrast(shade, surface),
            `${theme}: ${severity} ${shade} on ${name}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it.each(SEVERITIES)(
    "%s severity chip clears 4.5:1 on its own 20%% tint in both themes",
    (severity) => {
      for (const theme of ["light", "dark"] as const) {
        const shade = CHIP_TEXT[severity][theme];
        const chip = tint(CHIP_BG[severity], 0.2, SURFACE[theme].card);
        expect(
          contrast(shade, chip),
          `${theme}: ${severity} ${shade} on chip ${chip}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(SEVERITIES)(
    "%s chart slice clears 3:1 against the card in both themes",
    (severity) => {
      for (const theme of ["light", "dark"] as const) {
        expect(
          contrast(CHART[severity][theme], SURFACE[theme].card),
          `${theme}: ${severity} slice`,
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

describe("severity palette is wired into the components", () => {
  it("keeps paired light/dark text shades in scanChrome", () => {
    expect(scanChrome).toContain("text-orange-800 dark:text-orange-400");
    expect(scanChrome).toContain("text-yellow-800 dark:text-yellow-400");
    expect(scanChrome).toContain("text-blue-700 dark:text-blue-400");
    expect(scanChrome).not.toMatch(/(?<!dark:)text-(orange|yellow|blue)-400"/);
  });

  it("keeps paired light/dark text shades on every severity badge", () => {
    expect(badgeVariants).toContain("text-red-800 dark:text-red-400");
    expect(badgeVariants).toContain("text-orange-800 dark:text-orange-400");
    expect(badgeVariants).toContain("text-yellow-800 dark:text-yellow-400");
    expect(badgeVariants).toContain("text-blue-700 dark:text-blue-400");
    expect(badgeVariants).toContain("text-gray-700 dark:text-gray-400");
    expect(badgeVariants).not.toMatch(
      /(?<!dark:)text-(red|orange|yellow|blue|gray)-400"/,
    );
  });

  it("drives the chart slices from the theme-aware config, not a fixed hex map", () => {
    expect(severityChart).toContain("theme: { light:");
    expect(severityChart).not.toContain("PIE_COLORS");
    for (const severity of SEVERITIES) {
      expect(severityChart).toContain(
        `var(--color-${CHART_VAR[severity].light})`,
      );
      expect(severityChart).toContain(
        `var(--color-${CHART_VAR[severity].dark})`,
      );
    }
  });

  it("builds every slice fill from its theme variable", () => {
    expect(severityChart).toContain("fill: `var(--color-${key})`");
    expect(severityChart).toContain("fill={entry.fill}");
  });

  it("keeps paired light/dark shades on the CVSS score and bar", () => {
    for (const shade of ["red", "orange", "yellow", "blue"]) {
      expect(findingsTable).toContain(`text-${shade}-`);
      expect(findingsTable).toContain(`dark:text-${shade}-400`);
      expect(findingsTable).toContain(`dark:bg-${shade}-400`);
    }
  });
});

describe("severity chart resolves its palette per theme at render time", () => {
  const summary = {
    critical: 3,
    high: 2,
    medium: 5,
    low: 1,
    info: 4,
    total_findings: 15,
  };

  it("emits a light value and a .dark override for every slice", () => {
    const { container } = render(<SeverityChart summary={summary} />);
    const css = Array.from(container.querySelectorAll("style"))
      .map((node) => node.textContent ?? "")
      .join("\n");

    for (const severity of SEVERITIES) {
      expect(css, `${severity} light`).toContain(
        `--color-${severity}: var(--color-${CHART_VAR[severity].light})`,
      );
      expect(css, `${severity} dark`).toMatch(
        new RegExp(
          `\\.dark \\[data-chart=[^\\]]+\\]\\s*\\{[\\s\\S]*--color-${severity}: var\\(--color-${CHART_VAR[severity].dark}\\)`,
        ),
      );
    }
  });

  it("paints each legend dot with the matching light/dark utility", () => {
    render(<SeverityChart summary={summary} />);
    const legend = screen.getByTestId("severity-legend");

    for (const severity of SEVERITIES) {
      const [light, dark] = DOT[severity].split(" ");
      const dot = legend.querySelector(`.${CSS.escape(light)}`);
      expect(dot, `${severity} dot`).not.toBeNull();
      expect(dot?.className, `${severity} dark dot`).toContain(dark);
    }
  });
});
