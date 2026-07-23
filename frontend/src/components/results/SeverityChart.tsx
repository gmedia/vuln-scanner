import { PieChart, Pie, Cell, Label, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const PIE_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

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
  key: keyof typeof SEVERITY_LABELS | "total_findings",
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

  const data = (Object.keys(SEVERITY_LABELS) as Array<keyof typeof SEVERITY_LABELS>)
    .map((key) => ({
      name: SEVERITY_LABELS[key],
      value: severityValue(summary, key),
      color: PIE_COLORS[key],
    }))
    .filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
        <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground opacity-40" />
        <p className="font-mono text-sm text-muted-foreground">No findings to display</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={2}
            stroke="hsl(var(--card))"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
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
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span className="font-mono text-xs text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SeverityChart;
