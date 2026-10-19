import type { GuardStatus } from "@/api/guard";
import { GuardPulse } from "@/components/guard/guardChrome";
import { formatWhen, type GuardTranslate } from "@/components/guard/guardFormat";
import { StatGrid, StatGridSkeleton, StatTile } from "@/components/patterns/StatTile";
import { Badge } from "@/components/ui/Badge";
import { TONE_CHIP_TEXT } from "@/lib/toneColors";

type GuardHealth = "on" | "degraded" | "off";

const STATE_RAIL: Record<GuardHealth, string> = {
  on: "bg-primary",
  degraded: "bg-amber-600",
  off: "bg-border",
};

export function GuardKpiStrip({
  status,
  agentCount,
  alertCount,
  dateLocale,
  t,
}: {
  readonly status: GuardStatus;
  readonly agentCount: number;
  readonly alertCount: number;
  readonly dateLocale: string;
  readonly t: GuardTranslate;
}) {
  const health: GuardHealth = !status.enabled
    ? "off"
    : status.degraded
      ? "degraded"
      : "on";
  const on = status.enabled;
  return (
    <StatGrid testid="guard-kpi-strip" className="gap-3">
      <StatTile
        label={t("guardState")}
        value={
          <span data-testid="guard-state" data-enabled={on ? "true" : "false"}>
            <strong className="font-bold">
              {on ? t("enabledOn") : t("enabledOff")}
            </strong>
          </span>
        }
        railClass={STATE_RAIL[health]}
        pulse={health === "on" ? <GuardPulse /> : null}
        valueClassName="text-sm font-semibold"
        extraPlacement="inline"
        extra={
          status.degraded ? (
            <Badge className={`bg-amber-500/15 ${TONE_CHIP_TEXT.amber}`}>
              {t("degraded")}
            </Badge>
          ) : null
        }
      />
      <StatTile
        label={t("agents")}
        value={on ? String(agentCount) : "—"}
        railClass="bg-border"
      />
      <StatTile
        label={t("alertsTitle")}
        value={on ? String(alertCount) : "—"}
        railClass={on && alertCount > 0 ? "bg-destructive" : "bg-border"}
      />
      <StatTile
        label={t("kpiLastSync")}
        value={on ? formatWhen(status.last_inventory_sync_at, dateLocale) : "—"}
        railClass="bg-border"
      />
    </StatGrid>
  );
}

export function GuardKpiSkeleton() {
  return <StatGridSkeleton testid="guard-kpi-skeleton" />;
}
