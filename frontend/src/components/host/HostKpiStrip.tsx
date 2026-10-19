import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { StatGrid, StatTile } from "@/components/patterns/StatTile";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { TONE_TEXT } from "@/lib/toneColors";

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
      ? "bg-amber-600"
      : "bg-primary";
  const quotaIndicatorClass = isFull
    ? "bg-destructive"
    : isNearCap
      ? "bg-amber-600"
      : undefined;
  const quotaValueClass = isFull
    ? "text-destructive sm:text-2xl"
    : isNearCap
      ? `${TONE_TEXT.amber} sm:text-2xl`
      : "sm:text-2xl";
  const helperOk = agentsCount > 0 && !fleetStale;
  const helperRailClass =
    agentsCount === 0
      ? "bg-border"
      : helperOk
        ? "bg-primary"
        : "bg-destructive";

  return (
    <StatGrid
      testid="host-overview"
      label={t("title")}
      as="section"
      className="lg:grid-cols-4"
    >
      <StatTile
        testid="host-overview-sites"
        label={t("overviewSites")}
        value={
          <span className="min-w-0 break-words">
            {t("overviewOf", { count, limit })}
          </span>
        }
        railClass={quotaRailClass}
        valueClassName={quotaValueClass}
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
      <StatTile
        testid="host-overview-agents"
        label={t("overviewAgents")}
        value={agentsCount > 0 ? String(agentsCount) : t("overviewNoAgents")}
        railClass={agentsCount > 0 ? "bg-primary" : "bg-border"}
        valueClassName={
          agentsCount > 0
            ? "sm:text-2xl"
            : "truncate text-sm font-semibold text-muted-foreground"
        }
      />
      <StatTile
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
        valueClassName={
          needsDecision > 0
            ? "text-destructive sm:text-2xl"
            : "text-muted-foreground sm:text-2xl"
        }
      />
      <StatTile
        testid="host-overview-helper"
        label={t("kpiHelper")}
        value={fleetStale ? t("overviewHelperStale") : t("overviewHelperOk")}
        railClass={helperRailClass}
        pulse={helperOk ? <GuardPulse /> : null}
        valueClassName={
          fleetStale
            ? "text-sm font-semibold leading-tight text-destructive"
            : "text-sm font-semibold leading-tight"
        }
      />
    </StatGrid>
  );
}
