import { useQuery } from "@tanstack/react-query";
import { listSamples, type UptimeSample } from "@/api/uptime";

type SparklineProps = {
  readonly monitorId: string;
  readonly state: string;
};

export function Sparkline({ monitorId, state }: SparklineProps) {
  const samples = useQuery({
    queryKey: ["uptime-samples", monitorId],
    queryFn: () => listSamples(monitorId),
  });
  const points = (samples.data ?? []).slice(0, 24).reverse();
  if (points.length < 2) return null;
  const w = 96;
  const h = 24;
  const maxLat = Math.max(
    ...points.map((p: UptimeSample) => p.latency_ms ?? 1),
    1,
  );
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.latency_ms ?? 0) / maxLat) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const strokeClass =
    state === "up"
      ? "text-primary"
      : state === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <svg
      width={w}
      height={h}
      className={strokeClass}
      data-testid="uptime-sparkline"
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
