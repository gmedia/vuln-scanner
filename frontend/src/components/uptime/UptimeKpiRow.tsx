import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { Progress } from "@/components/ui/Progress";
import { cn } from "@/lib/utils";

function KpiTile({
  label,
  value,
  railClass,
  pulse = false,
  extra,
  valueClass = "font-mono text-lg font-bold tabular-nums text-foreground",
  className,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly railClass: string;
  readonly pulse?: boolean;
  readonly extra?: ReactNode;
  readonly valueClass?: string;
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
      <p className="pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className={cn("mt-1 flex flex-wrap items-center gap-2 pl-2", valueClass)}>
        {value}
        {pulse ? <GuardPulse /> : null}
      </div>
      {extra ? <div className="mt-2 pl-2">{extra}</div> : null}
    </div>
  );
}

export function UptimeKpiRow({
  upCount,
  downCount,
  enabledCount,
  limit,
  sku,
}: {
  readonly upCount: number;
  readonly downCount: number;
  readonly enabledCount: number;
  readonly limit: number;
  readonly sku: string;
}) {
  const { t } = useTranslation("uptime");
  const quotaPct =
    limit > 0 ? Math.min(100, Math.round((enabledCount / limit) * 100)) : 0;
  const isFull = quotaPct >= 100 && limit > 0;
  const isNearCap = quotaPct >= 80 && !isFull;
  const skuCountClassName = isFull
    ? "font-mono text-sm font-bold tabular-nums text-destructive"
    : isNearCap
      ? "font-mono text-sm font-bold tabular-nums text-amber-500"
      : "font-mono text-sm font-bold tabular-nums text-foreground";
  const quotaIndicatorClassName = isFull
    ? "bg-destructive"
    : isNearCap
      ? "bg-amber-500"
      : undefined;
  const skuRailClass = isFull
    ? "bg-destructive"
    : isNearCap
      ? "bg-amber-500"
      : "bg-primary";
  const quotaLabel = t("skuShort", { count: enabledCount, limit, sku });
  return (
    <div
      data-testid="uptime-kpi"
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[1fr_1fr_2fr]"
    >
      <KpiTile
        label={t("statUp")}
        value={upCount}
        railClass={upCount > 0 ? "bg-primary" : "bg-border"}
        pulse={upCount > 0}
        valueClass="font-mono text-lg font-bold tabular-nums text-primary sm:text-2xl"
      />
      <KpiTile
        label={t("statDown")}
        value={downCount}
        railClass={downCount > 0 ? "bg-destructive" : "bg-border"}
        valueClass={
          downCount > 0
            ? "font-mono text-lg font-bold tabular-nums text-destructive sm:text-2xl"
            : "font-mono text-lg font-bold tabular-nums text-muted-foreground sm:text-2xl"
        }
      />
      <KpiTile
        label={t("statSku")}
        value={<span className="min-w-0 break-words">{quotaLabel}</span>}
        railClass={skuRailClass}
        valueClass={skuCountClassName}
        className="col-span-2 lg:col-span-1"
        extra={
          <Progress
            data-testid="uptime-sku-quota"
            value={quotaPct}
            aria-valuenow={quotaPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={quotaLabel}
            className="h-1.5"
            indicatorClassName={quotaIndicatorClassName}
          />
        }
      />
    </div>
  );
}
