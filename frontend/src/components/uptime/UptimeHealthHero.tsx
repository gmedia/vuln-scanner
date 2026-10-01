import type { UptimeMonitor } from "@/api/uptime";
import { GuardPulse } from "@/components/guard/guardChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { ProtocolGlyph } from "@/components/uptime/UptimeChrome";
import {
  stateRailClass,
  stateValueClass,
  stateWashClass,
} from "@/components/uptime/uptimeChrome";
import { cn } from "@/lib/utils";

export function UptimeHealthHero({
  monitor,
  stateLabel,
  latencyLabel,
}: {
  readonly monitor: UptimeMonitor;
  readonly stateLabel: string;
  readonly latencyLabel: string;
}) {
  const wash = stateWashClass(monitor.state, monitor.enabled);
  const pulse = monitor.enabled && monitor.state === "up";
  return (
    <article className="relative overflow-hidden rounded-lg border border-border bg-card pl-4">
      <SiemRail className={stateRailClass(monitor.state, monitor.enabled)} />
      {wash ? (
        <span
          className={cn("pointer-events-none absolute inset-0", wash)}
          aria-hidden
        />
      ) : null}
      <div className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <ProtocolGlyph type={monitor.check_type} />
            {monitor.check_type}
          </p>
          <div className="flex min-w-0 flex-wrap items-center">
            <p
              className={cn(
                "text-lg font-semibold tracking-tight sm:text-xl",
                stateValueClass(monitor.state, monitor.enabled),
              )}
            >
              {stateLabel}
            </p>
            {pulse ? <GuardPulse /> : null}
          </div>
          <p className="truncate font-mono text-sm text-foreground">
            {monitor.target}
          </p>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
            {monitor.last_latency_ms != null ? (
              <span>
                {latencyLabel} {monitor.last_latency_ms}ms
              </span>
            ) : null}
            {monitor.uptime_24h != null ? (
              <span>{monitor.uptime_24h}% / 24h</span>
            ) : null}
            <span>{monitor.interval_seconds}s</span>
          </div>
        </div>
      </div>
    </article>
  );
}
