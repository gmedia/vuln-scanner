import { StatGrid, StatGridSkeleton, StatTile } from "@/components/patterns/StatTile";
import { Progress } from "@/components/ui/Progress";
import {
  quotaIndicatorClass,
  quotaRailClass,
  quotaState,
  type AssetTranslate,
} from "@/components/assets/assetChrome";

export type AssetKpiStripProps = {
  readonly sku: string;
  readonly count: number;
  readonly limit: number;
  readonly scheduled: number;
  readonly domains: number;
  readonly ips: number;
  readonly t: AssetTranslate;
};

export function AssetKpiStrip({
  sku,
  count,
  limit,
  scheduled,
  domains,
  ips,
  t,
}: AssetKpiStripProps) {
  const { pct: quotaPct, tone } = quotaState(count, limit);

  return (
    <StatGrid testid="assets-kpi-strip" className="gap-3">
      <StatTile
        label={t("kpiQuota")}
        value={
          <span className="text-sm font-medium text-foreground">
            {t("skuLabel", { sku, count, limit })}
          </span>
        }
        railClass={quotaRailClass(tone)}
        valueClassName="text-sm font-semibold"
        extra={
          <Progress
            value={quotaPct}
            className="h-1.5"
            indicatorClassName={quotaIndicatorClass(tone)}
          />
        }
      />
      <StatTile
        label={t("kpiScheduled")}
        value={String(scheduled)}
        railClass={scheduled > 0 ? "bg-primary" : "bg-border"}
      />
      <StatTile
        label={t("kpiDomains")}
        value={String(domains)}
        railClass={domains > 0 ? "bg-sky-600" : "bg-border"}
      />
      <StatTile
        label={t("kpiIps")}
        value={String(ips)}
        railClass={ips > 0 ? "bg-violet-500" : "bg-border"}
      />
    </StatGrid>
  );
}

export function AssetKpiSkeleton() {
  return <StatGridSkeleton testid="assets-kpi-skeleton" />;
}
