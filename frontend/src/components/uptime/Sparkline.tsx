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
  if (points.length < 2) {
    return (
      <span
        data-testid="uptime-sparkline"
        className="text-xs text-muted-foreground"
      >
        —
      </span>
    );
  }
  const w = 96;
  const h = 28;
  const maxLat = Math.max(
    ...points.map((p: UptimeSample) => p.latency_ms ?? 1),
    1,
  );
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p.latency_ms ?? 0) / maxLat) * (h - 4) - 2;
    return { x, y };
  });
  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area =
    first && last
      ? `${line} L${last.x.toFixed(1)},${h} L${first.x.toFixed(1)},${h} Z`
      : line;
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
      <path d={area} fill="currentColor" fillOpacity="0.18" stroke="none" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
