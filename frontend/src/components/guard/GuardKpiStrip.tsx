import type { ReactNode } from "react";
import type { GuardStatus } from "@/api/guard";
import { GuardPulse } from "@/components/guard/guardChrome";
import {
  formatWhen,
  type GuardTranslate,
} from "@/components/guard/guardFormat";
import { SiemRail } from "@/components/siem/siemChrome";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

type GuardHealth = "on" | "degraded" | "off";

const STATE_RAIL: Record<GuardHealth, string> = {
  on: "bg-primary",
  degraded: "bg-amber-500",
  off: "bg-border",
};

function KpiTile({
  label,
  value,
  railClass,
  pulse = false,
  extra,
  valueClass = "font-mono text-lg font-bold tabular-nums text-foreground",
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly railClass: string;
  readonly pulse?: boolean;
  readonly extra?: ReactNode;
  readonly valueClass?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4">
      <SiemRail className={railClass} />
      <p className="pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className={`mt-1 flex flex-wrap items-center gap-2 pl-2 ${valueClass}`}>
        {value}
        {pulse ? <GuardPulse /> : null}
        {extra}
      </div>
    </div>
  );
}

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
    <div
      data-testid="guard-kpi-strip"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <KpiTile
        label={t("guardState")}
        value={
          <span
            data-testid="guard-state"
            data-enabled={on ? "true" : "false"}
          >
            <strong>{on ? t("enabledOn") : t("enabledOff")}</strong>
          </span>
        }
        railClass={STATE_RAIL[health]}
        pulse={health === "on"}
        valueClass="text-sm font-semibold text-foreground"
        extra={
          status.degraded ? (
            <Badge className="bg-amber-500/15 text-amber-800">
              {t("degraded")}
            </Badge>
          ) : null
        }
      />
      <KpiTile
        label={t("agents")}
        value={on ? String(agentCount) : "—"}
        railClass="bg-border"
      />
      <KpiTile
        label={t("alertsTitle")}
        value={on ? String(alertCount) : "—"}
        railClass={on && alertCount > 0 ? "bg-destructive" : "bg-border"}
      />
      <KpiTile
        label={t("kpiLastSync")}
        value={on ? formatWhen(status.last_inventory_sync_at, dateLocale) : "—"}
        railClass="bg-border"
      />
    </div>
  );
}

export function GuardKpiSkeleton() {
  return (
    <div
      data-testid="guard-kpi-skeleton"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
    </div>
  );
}
