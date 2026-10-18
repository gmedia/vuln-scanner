import { PieChart, Pie, Cell, Label } from "recharts";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// Slices and dots both resolve to the same Tailwind palette entry. The legend
// needs utilities because it renders outside <ChartContainer>, so the chart's
// --color-* CSS vars are not in scope there.
const SEVERITY_THEME = {
  critical: {
    light: "var(--color-red-700)",
    dark: "var(--color-red-400)",
    dot: "bg-red-700 dark:bg-red-400",
  },
  high: {
    light: "var(--color-orange-700)",
    dark: "var(--color-orange-400)",
    dot: "bg-orange-700 dark:bg-orange-400",
  },
  medium: {
    light: "var(--color-yellow-700)",
    dark: "var(--color-yellow-400)",
    dot: "bg-yellow-700 dark:bg-yellow-400",
  },
  low: {
    light: "var(--color-blue-700)",
    dark: "var(--color-blue-400)",
    dot: "bg-blue-700 dark:bg-blue-400",
  },
  info: {
    light: "var(--color-gray-700)",
    dark: "var(--color-gray-400)",
    dot: "bg-gray-700 dark:bg-gray-400",
  },
} as const;

const SEVERITY_KEYS = ["critical", "high", "medium", "low", "info"] as const;

const SEVERITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
} as const;

const chartConfig = {
  critical: {
    label: "Critical",
    theme: {
      light: SEVERITY_THEME.critical.light,
      dark: SEVERITY_THEME.critical.dark,
    },
  },
  high: {
    label: "High",
    theme: { light: SEVERITY_THEME.high.light, dark: SEVERITY_THEME.high.dark },
  },
  medium: {
    label: "Medium",
    theme: {
      light: SEVERITY_THEME.medium.light,
      dark: SEVERITY_THEME.medium.dark,
    },
  },
  low: {
    label: "Low",
    theme: { light: SEVERITY_THEME.low.light, dark: SEVERITY_THEME.low.dark },
  },
  info: {
    label: "Info",
    theme: { light: SEVERITY_THEME.info.light, dark: SEVERITY_THEME.info.dark },
  },
} satisfies ChartConfig;

interface SeverityChartProps {
  summary: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    info?: number;
    total_findings?: number;
  } | null;
  className?: string;
}

function severityValue(
  summary: NonNullable<SeverityChartProps["summary"]>,
  key: (typeof SEVERITY_KEYS)[number] | "total_findings",
): number {
  const raw = summary[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function SeverityChart({ summary, className }: SeverityChartProps) {
  const { t } = useTranslation("scan");
  const totalFindings = summary ? severityValue(summary, "total_findings") : 0;

  if (!summary || totalFindings === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-12 text-center",
          className,
        )}
      >
        <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">{t("noFindingsChart")}</p>
      </div>
    );
  }

  const allSeverities = SEVERITY_KEYS.map((key) => ({
    key,
    name: SEVERITY_LABELS[key],
    value: severityValue(summary, key),
    fill: `var(--color-${key})`,
    dot: SEVERITY_THEME[key].dot,
  }));

  const pieData = allSeverities.filter((d) => d.value > 0);

  if (pieData.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-12 text-center",
          className,
        )}
      >
        <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">{t("noFindingsChart")}</p>
      </div>
    );
  }

  return (
    <div
      className={cn("w-full", className)}
      data-testid="severity-chart-content"
    >
      <ChartContainer
        config={chartConfig}
        className="mx-auto aspect-square h-[220px] w-full"
        initialDimension={{ width: 220, height: 220 }}
      >
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value) => {
                  const num = Number(value);
                  return `${num} finding${num !== 1 ? "s" : ""}`;
                }}
              />
            }
          />
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
            strokeWidth={2}
            stroke="hsl(var(--card))"
          >
            {pieData.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
            <Label
              value={totalFindings}
              position="center"
              className="fill-foreground font-mono text-2xl font-bold"
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <ul
        className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2"
        data-testid="severity-legend"
          aria-label={t("severityLegend")}
      >
        {allSeverities.map((item) => {
          const pct =
            totalFindings > 0
              ? Math.round((item.value / totalFindings) * 100)
              : 0;
          return (
            <li
              key={item.key}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", item.dot)}
                  aria-hidden
                />
                <span className="truncate text-xs text-muted-foreground">
                  {item.name}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                {item.value}
                <span className="ml-1 text-muted-foreground">({pct}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SeverityChart;
