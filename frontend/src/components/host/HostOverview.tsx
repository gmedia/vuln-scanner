import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { HostLiveDot } from "@/components/host/HostChrome";
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
  railClass,
  valueClass,
  live,
  liveTone,
  testid,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly railClass: string;
  readonly valueClass: string;
  readonly live?: boolean;
  readonly liveTone?: "primary" | "destructive" | "info";
  readonly testid: string;
}) {
  return (
    <div
      data-testid={testid}
      className="relative flex min-w-0 flex-col justify-center overflow-hidden rounded-lg border border-border bg-card px-3 py-3 sm:px-4"
    >
      <span
        className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", railClass)}
        aria-hidden
      />
      <p className="pl-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex min-w-0 items-center gap-2 pl-2">
        {live ? <HostLiveDot tone={liveTone} /> : null}
        <div className={cn("min-w-0", valueClass)}>{value}</div>
      </div>
      {hint ? (
        <p className="mt-0.5 truncate pl-2 text-[11px] text-muted-foreground">
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
        className="relative col-span-2 flex min-w-0 flex-col justify-center gap-2 overflow-hidden rounded-lg border border-border bg-card p-3 sm:p-4 lg:col-span-1"
      >
        <span
          className={cn(
            "absolute inset-y-2 left-0 w-0.5 rounded-full",
            isFull
              ? "bg-destructive"
              : isNearCap
                ? "bg-amber-500"
                : "bg-primary/50",
          )}
          aria-hidden
        />
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pl-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("overviewSites")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("overviewSitesHint", { sku })}
          </p>
        </div>
        <p className={`${skuCountClassName} pl-2 min-w-0 break-words`}>
          {t("overviewOf", { count, limit })}
        </p>
        <Progress
          value={quotaPct}
          aria-valuenow={quotaPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("overviewOf", { count, limit })}
          className="ml-2 h-1.5"
          indicatorClassName={quotaIndicatorClassName}
        />
      </div>
      <KpiTile
        label={t("overviewAgents")}
        value={agentsCount > 0 ? String(agentsCount) : t("overviewNoAgents")}
        railClass={
          agentsCount > 0 ? "bg-primary/50" : "bg-muted-foreground/30"
        }
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
        railClass={
          needsDecision > 0
            ? "bg-destructive"
            : waiting
              ? "bg-blue-500"
              : "bg-muted-foreground/30"
        }
        valueClass={
          needsDecision > 0
            ? "font-mono text-lg font-bold tabular-nums text-destructive sm:text-2xl"
            : "font-mono text-lg font-bold tabular-nums text-muted-foreground sm:text-2xl"
        }
        live={waiting || needsDecision > 0}
        liveTone={needsDecision > 0 ? "destructive" : "info"}
        testid="host-overview-decision"
      />
      <KpiTile
        label="Helper"
        value={fleetStale ? t("overviewHelperStale") : t("overviewHelperOk")}
        railClass={fleetStale ? "bg-destructive" : "bg-primary"}
        valueClass={
          fleetStale
            ? "text-sm font-semibold leading-tight text-destructive"
            : "text-sm font-semibold leading-tight text-foreground"
        }
        live={!fleetStale}
        liveTone={fleetStale ? "destructive" : "primary"}
        testid="host-overview-helper"
      />
    </section>
  );
}
