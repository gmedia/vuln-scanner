import { GuardPulse } from "@/components/guard/guardChrome";
import { StatGrid, StatTile } from "@/components/patterns/StatTile";
import { Skeleton } from "@/components/ui/Skeleton";
import { TONE_TEXT } from "@/lib/toneColors";

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

const TILE_SKELETON = (
  <>
    <Skeleton className="mb-1 h-7 w-14" />
    <Skeleton className="h-3 w-12" />
  </>
);

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
        ? "bg-orange-600"
        : weekMedium > 0
          ? "bg-amber-600"
          : "bg-border";
  const schedulesFull = scheduleLimit > 0 && enabledSchedules >= scheduleLimit;
  const schedulesTone =
    enabledSchedules === 0
      ? "bg-border"
      : schedulesFull
        ? "bg-destructive"
        : "bg-primary";

  return (
    <StatGrid
      testid="dashboard-kpi-strip"
      className="gap-3 lg:grid-cols-3"
    >
      <StatTile
        label={labels.openRisk}
        value={openRisk}
        valueFirst
        isLoading={loading}
        skeleton={TILE_SKELETON}
        railClass={riskTone}
        valueClassName={`text-xl tracking-tight sm:text-2xl ${
          openRisk > 0 ? TONE_TEXT.red : "text-foreground"
        }`}
        labelClassName="font-normal"
        pulse={openRisk > 0 ? <GuardPulse /> : null}
        className="col-span-2 lg:col-span-1"
      />
      <StatTile
        label={labels.weekChm}
        value={`${weekCritical}/${weekHigh}/${weekMedium}`}
        valueFirst
        isLoading={loading}
        skeleton={TILE_SKELETON}
        railClass={weekTone}
        valueClassName={`text-xl tracking-tight sm:text-2xl ${TONE_TEXT.orange}`}
        labelClassName="font-normal"
      />
      <StatTile
        label={labels.schedules}
        value={`${enabledSchedules} / ${scheduleLimit}`}
        valueFirst
        railClass={schedulesTone}
        valueClassName={`text-xl tracking-tight sm:text-2xl ${
          schedulesFull ? "text-destructive" : "text-foreground"
        }`}
        labelClassName="font-normal"
      />
    </StatGrid>
  );
}
