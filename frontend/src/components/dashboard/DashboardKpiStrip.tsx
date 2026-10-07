import { GuardPulse } from "@/components/guard/guardChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

export type DashboardKpiStripProps = {
  readonly openRisk: number;
  readonly weekCritical: number;
  readonly weekHigh: number;
  readonly weekMedium: number;
  readonly enabledSchedules: number;
  readonly scheduleLimit: number;
  readonly loading: boolean;
  readonly labels: {
    readonly openRisk: string;
    readonly weekChm: string;
    readonly schedules: string;
  };
};

function StatTile({
  label,
  value,
  isLoading,
  railClass,
  valueClassName,
  pulse = false,
  className,
}: {
  readonly label: string;
  readonly value: number | string;
  readonly isLoading: boolean;
  readonly railClass: string;
  readonly valueClassName: string;
  readonly pulse?: boolean;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4",
        className,
      )}
    >
      <SiemRail className={railClass} />
      <div className="pl-2">
        {isLoading ? (
          <>
            <Skeleton className="mb-1 h-7 w-14" />
            <Skeleton className="h-3 w-12" />
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl",
                valueClassName,
              )}
            >
              {value}
            </span>
            <span className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
              {pulse ? <GuardPulse /> : null}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function DashboardKpiStrip({
  openRisk,
  weekCritical,
  weekHigh,
  weekMedium,
  enabledSchedules,
  scheduleLimit,
  loading,
  labels,
}: DashboardKpiStripProps) {
  const riskTone = openRisk > 0 ? "bg-destructive" : "bg-primary";
  const weekTone =
    weekCritical > 0
      ? "bg-destructive"
      : weekHigh > 0
        ? "bg-orange-500"
        : weekMedium > 0
          ? "bg-amber-500"
          : "bg-border";
  const schedulesFull = scheduleLimit > 0 && enabledSchedules >= scheduleLimit;
  const schedulesTone =
    enabledSchedules === 0
      ? "bg-border"
      : schedulesFull
        ? "bg-destructive"
        : "bg-primary";

  return (
    <div
      data-testid="dashboard-kpi-strip"
      className="grid grid-cols-2 gap-3 lg:grid-cols-3"
    >
      <StatTile
        label={labels.openRisk}
        value={openRisk}
        isLoading={loading}
        railClass={riskTone}
        valueClassName={openRisk > 0 ? "text-red-400" : "text-foreground"}
        pulse={openRisk > 0}
        className="col-span-2 lg:col-span-1"
      />
      <StatTile
        label={labels.weekChm}
        value={`${weekCritical}/${weekHigh}/${weekMedium}`}
        isLoading={loading}
        railClass={weekTone}
        valueClassName="text-orange-400"
      />
      <StatTile
        label={labels.schedules}
        value={`${enabledSchedules} / ${scheduleLimit}`}
        isLoading={false}
        railClass={schedulesTone}
        valueClassName={
          schedulesFull ? "text-destructive" : "text-foreground"
        }
      />
    </div>
  );
}
