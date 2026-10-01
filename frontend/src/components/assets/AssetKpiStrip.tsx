import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Progress } from "@/components/ui/Progress";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  quotaIndicatorClass,
  quotaRailClass,
  quotaTone,
  type AssetTranslate,
} from "@/components/assets/assetChrome";

function KpiTile({
  label,
  value,
  railClass,
  extra,
  valueClass = "font-mono text-lg font-bold tabular-nums text-foreground",
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly railClass: string;
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
      </div>
      {extra ? <div className="mt-2 pl-2">{extra}</div> : null}
    </div>
  );
}

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
  const quotaPct =
    limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;
  const atCap = count >= limit;
  const tone = quotaTone(quotaPct, atCap);

  return (
    <div
      data-testid="assets-kpi-strip"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <KpiTile
        label={t("kpiQuota")}
        value={
          <span className="text-sm font-medium text-foreground">
            {t("skuLabel", { sku, count, limit })}
          </span>
        }
        railClass={quotaRailClass(tone)}
        valueClass="text-sm font-semibold text-foreground"
        extra={
          <Progress
            value={quotaPct}
            className="h-1.5"
            indicatorClassName={quotaIndicatorClass(tone)}
          />
        }
      />
      <KpiTile
        label={t("kpiScheduled")}
        value={String(scheduled)}
        railClass={scheduled > 0 ? "bg-primary" : "bg-border"}
      />
      <KpiTile
        label={t("kpiDomains")}
        value={String(domains)}
        railClass={domains > 0 ? "bg-sky-500" : "bg-border"}
      />
      <KpiTile
        label={t("kpiIps")}
        value={String(ips)}
        railClass={ips > 0 ? "bg-violet-500" : "bg-border"}
      />
    </div>
  );
}

export function AssetKpiSkeleton() {
  return (
    <div
      data-testid="assets-kpi-skeleton"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
    </div>
  );
}
