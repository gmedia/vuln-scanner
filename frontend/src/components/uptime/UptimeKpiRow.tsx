import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/Progress";
import { LiveDot } from "@/components/uptime/UptimeChrome";
import { cn } from "@/lib/utils";

function KpiTile({
  label,
  value,
  railClass,
  valueClass,
  live,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly railClass: string;
  readonly valueClass: string;
  readonly live?: boolean;
}) {
  return (
    <div className="relative flex min-w-0 flex-col justify-center overflow-hidden rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
      <span
        className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", railClass)}
        aria-hidden
      />
      <p className="pl-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2 pl-2">
        {live ? <LiveDot /> : null}
        <p className={valueClass}>{value}</p>
      </div>
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
      <KpiTile
        label={t("statUp")}
        value={upCount}
        railClass="bg-primary"
        live={upCount > 0}
        valueClass="font-mono text-lg font-bold tabular-nums text-primary sm:text-2xl"
      />
      <KpiTile
        label={t("statDown")}
        value={downCount}
        railClass={downCount > 0 ? "bg-destructive" : "bg-muted-foreground/30"}
        live={false}
        valueClass={
          downCount > 0
            ? "font-mono text-lg font-bold tabular-nums text-destructive sm:text-2xl"
            : "font-mono text-lg font-bold tabular-nums text-muted-foreground sm:text-2xl"
        }
      />
      <div className="relative col-span-2 flex min-w-0 flex-col justify-center gap-2 overflow-hidden rounded-lg border border-border bg-card p-3 sm:p-4 lg:col-span-1">
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
          className="ml-2 h-1.5"
          indicatorClassName={quotaIndicatorClassName}
        />
      </div>
    </div>
  );
}
