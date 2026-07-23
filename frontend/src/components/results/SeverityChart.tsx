import { PieChart, Pie, Cell, Label, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const PIE_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

const SEVERITY_KEYS = ["critical", "high", "medium", "low", "info"] as const;

const SEVERITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
} as const;

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
  const totalFindings = summary ? severityValue(summary, "total_findings") : 0;

  if (!summary || totalFindings === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
        <p className="font-mono text-sm text-muted-foreground">No findings to display</p>
      </div>
    );
  }

  const allSeverities = SEVERITY_KEYS.map((key) => ({
    key,
    name: SEVERITY_LABELS[key],
    value: severityValue(summary, key),
    color: PIE_COLORS[key],
  }));

  const pieData = allSeverities.filter((d) => d.value > 0);

  if (pieData.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
        <p className="font-mono text-sm text-muted-foreground">No findings to display</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)} data-testid="severity-chart-content">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={88}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={2}
            stroke="hsl(var(--card))"
          >
            {pieData.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
            <Label
              value={totalFindings}
              position="center"
              className="fill-foreground font-mono text-2xl font-bold"
            />
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "0.75rem",
            }}
            formatter={(value: unknown) => {
              const num = Number(value);
              return [`${num} finding${num !== 1 ? "s" : ""}`, ""];
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <ul
        className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2"
        data-testid="severity-legend"
        aria-label="Severity legend"
      >
        {allSeverities.map((item) => {
          const pct =
            totalFindings > 0 ? Math.round((item.value / totalFindings) * 100) : 0;
          return (
            <li
              key={item.key}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                <span className="truncate font-mono text-xs text-muted-foreground">
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
