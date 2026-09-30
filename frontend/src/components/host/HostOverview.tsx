import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { cn } from "@/lib/utils";

export type HostOverviewProps = {
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
  hint,
  valueClass,
  testid,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly valueClass: string;
  readonly testid: string;
}) {
  return (
    <div
      data-testid={testid}
      className="flex min-w-0 flex-col justify-center rounded-md border border-border bg-card px-4 py-3"
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className={cn("mt-1 min-w-0", valueClass)}>{value}</div>
      {hint ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function HostOverview({
  sku,
  count,
  limit,
  agentsCount,
  needsDecision,
  waiting,
  fleetStale,
  featureOn,
}: HostOverviewProps) {
  const { t } = useTranslation("host");
  if (!featureOn) return null;
  const quotaPct =
    limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;
  const isFull = quotaPct >= 100 && limit > 0;
  const isNearCap = quotaPct >= 80 && !isFull;
  const skuCountClassName = isFull
    ? "font-mono text-lg font-bold tabular-nums text-destructive sm:text-2xl"
    : isNearCap
      ? "font-mono text-lg font-bold tabular-nums text-amber-500 sm:text-2xl"
      : "font-mono text-lg font-bold tabular-nums text-foreground sm:text-2xl";
  const quotaIndicatorClassName = isFull
    ? "bg-destructive"
    : isNearCap
      ? "bg-amber-500"
      : undefined;

  return (
    <section
      data-testid="host-overview"
      aria-label={t("title")}
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
    >
      <div
        data-testid="host-overview-sites"
        className="col-span-2 flex min-w-0 flex-col justify-center gap-2 rounded-md border border-border bg-card px-4 py-3 lg:col-span-1"
      >
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("overviewSites")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("overviewSitesHint", { sku })}
          </p>
        </div>
        <p className={`${skuCountClassName} min-w-0 break-words`}>
          {t("overviewOf", { count, limit })}
        </p>
        <Progress
          value={quotaPct}
          aria-valuenow={quotaPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("overviewOf", { count, limit })}
          className="h-1.5"
          indicatorClassName={quotaIndicatorClassName}
        />
      </div>
      <KpiTile
        label={t("overviewAgents")}
        value={agentsCount > 0 ? String(agentsCount) : t("overviewNoAgents")}
        valueClass={
          agentsCount > 0
            ? "font-mono text-lg font-bold tabular-nums text-foreground sm:text-2xl"
            : "truncate text-sm font-semibold text-muted-foreground"
        }
        testid="host-overview-agents"
      />
      <KpiTile
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
        valueClass={
          needsDecision > 0
            ? "font-mono text-lg font-bold tabular-nums text-destructive sm:text-2xl"
            : "font-mono text-lg font-bold tabular-nums text-muted-foreground sm:text-2xl"
        }
        testid="host-overview-decision"
      />
      <KpiTile
        label="Helper"
        value={fleetStale ? t("overviewHelperStale") : t("overviewHelperOk")}
        valueClass={
          fleetStale
            ? "text-sm font-semibold leading-tight text-destructive"
            : "text-sm font-semibold leading-tight text-foreground"
        }
        testid="host-overview-helper"
      />
    </section>
  );
}
