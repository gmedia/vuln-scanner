import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/Progress";

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
    limit > 0
      ? Math.min(100, Math.round((enabledCount / limit) * 100))
      : 0;
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
  const quotaLabel = t("skuShort", { count: enabledCount, limit, sku });
  return (
    <div
      data-testid="uptime-kpi"
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[1fr_1fr_2fr]"
    >
      <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
        <p className="font-mono text-lg font-bold tabular-nums text-primary sm:text-2xl">
          {upCount}
        </p>
        <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("statUp")}
        </p>
      </div>
      <div className="flex min-w-0 flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
        <p
          className={
            downCount > 0
              ? "font-mono text-lg font-bold tabular-nums text-destructive sm:text-2xl"
              : "font-mono text-lg font-bold tabular-nums text-muted-foreground sm:text-2xl"
          }
        >
          {downCount}
        </p>
        <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("statDown")}
        </p>
      </div>
      <div className="col-span-2 flex min-w-0 flex-col justify-center gap-2 rounded-lg border border-border bg-card p-3 sm:p-4 lg:col-span-1">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("statSku")}
          </p>
          <p className={`${skuCountClassName} min-w-0 break-words`}>
            {quotaLabel}
          </p>
        </div>
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
      </div>
    </div>
  );
}
