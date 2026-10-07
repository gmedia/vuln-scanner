import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { cn } from "@/lib/utils";

export type HostKpiStripProps = {
  readonly sku: string;
  readonly count: number;
  readonly limit: number;
  readonly agentsCount: number;
  readonly needsDecision: number;
  readonly waiting: boolean;
  readonly fleetStale: boolean;
  readonly featureOn: boolean;
};

function KpiTile({
  label,
  value,
  railClass,
  pulse = false,
  extra,
  valueClass = "font-mono text-lg font-bold tabular-nums text-foreground",
  testid,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly railClass: string;
  readonly pulse?: boolean;
  readonly extra?: ReactNode;
  readonly valueClass?: string;
  readonly testid: string;
}) {
  return (
    <div
      data-testid={testid}
      className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4"
    >
      <SiemRail className={railClass} />
      <p className="pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div
        className={cn("mt-1 flex flex-wrap items-center gap-2 pl-2", valueClass)}
      >
        {value}
        {pulse ? <GuardPulse /> : null}
      </div>
      {extra ? <div className="mt-2 pl-2">{extra}</div> : null}
    </div>
  );
}

export default function HostKpiStrip({
  sku,
  count,
  limit,
  agentsCount,
  needsDecision,
  waiting,
  fleetStale,
  featureOn,
}: HostKpiStripProps) {
  const { t } = useTranslation("host");
  if (!featureOn) return null;

  const quotaPct =
    limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;
  const isFull = quotaPct >= 100 && limit > 0;
  const isNearCap = quotaPct >= 80 && !isFull;
  const quotaRailClass = isFull
    ? "bg-destructive"
    : isNearCap
      ? "bg-amber-500"
      : "bg-primary";
  const quotaIndicatorClass = isFull
    ? "bg-destructive"
    : isNearCap
      ? "bg-amber-500"
      : undefined;
  const quotaValueClass = isFull
    ? "font-mono text-lg font-bold tabular-nums text-destructive sm:text-2xl"
    : isNearCap
      ? "font-mono text-lg font-bold tabular-nums text-amber-500 sm:text-2xl"
      : "font-mono text-lg font-bold tabular-nums text-foreground sm:text-2xl";
  const helperOk = agentsCount > 0 && !fleetStale;
  const helperRailClass =
    agentsCount === 0 ? "bg-border" : helperOk ? "bg-primary" : "bg-destructive";

  return (
    <section
      data-testid="host-overview"
      aria-label={t("title")}
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
    >
      <KpiTile
        testid="host-overview-sites"
        label={t("overviewSites")}
        value={
          <span className="min-w-0 break-words">
            {t("overviewOf", { count, limit })}
          </span>
        }
        railClass={quotaRailClass}
        valueClass={quotaValueClass}
        extra={
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">
              {t("overviewSitesHint", { sku })}
            </p>
            <Progress
              value={quotaPct}
              aria-valuenow={quotaPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("overviewOf", { count, limit })}
              className="h-1.5"
              indicatorClassName={quotaIndicatorClass}
            />
          </div>
        }
      />
      <KpiTile
        testid="host-overview-agents"
        label={t("overviewAgents")}
        value={agentsCount > 0 ? String(agentsCount) : t("overviewNoAgents")}
        railClass={agentsCount > 0 ? "bg-primary" : "bg-border"}
        valueClass={
          agentsCount > 0
            ? "font-mono text-lg font-bold tabular-nums text-foreground sm:text-2xl"
            : "truncate text-sm font-semibold text-muted-foreground"
        }
      />
      <KpiTile
        testid="host-overview-decision"
        label={t("overviewNeedsDecision")}
        value={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {needsDecision} {t("overviewFilesSuffix")}
            </span>
            {waiting ? (
              <Badge variant="running">{t("overviewWaiting")}</Badge>
            ) : null}
          </span>
        }
        railClass={needsDecision > 0 ? "bg-destructive" : "bg-border"}
        valueClass={
          needsDecision > 0
            ? "font-mono text-lg font-bold tabular-nums text-destructive sm:text-2xl"
            : "font-mono text-lg font-bold tabular-nums text-muted-foreground sm:text-2xl"
        }
      />
      <KpiTile
        testid="host-overview-helper"
        label={t("kpiHelper")}
        value={fleetStale ? t("overviewHelperStale") : t("overviewHelperOk")}
        railClass={helperRailClass}
        pulse={helperOk}
        valueClass={
          fleetStale
            ? "text-sm font-semibold leading-tight text-destructive"
            : "text-sm font-semibold leading-tight text-foreground"
        }
      />
    </section>
  );
}
