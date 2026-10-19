import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { StatGrid, StatTile } from "@/components/patterns/StatTile";
import { Progress } from "@/components/ui/Progress";
import { TONE_TEXT } from "@/lib/toneColors";

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
    ? "text-sm text-destructive"
    : isNearCap
      ? `text-sm ${TONE_TEXT.amber}`
      : "text-sm text-foreground";
  const quotaIndicatorClassName = isFull
    ? "bg-destructive"
    : isNearCap
      ? "bg-amber-600"
      : undefined;
  const skuRailClass = isFull
    ? "bg-destructive"
    : isNearCap
      ? "bg-amber-600"
      : "bg-primary";
  const quotaLabel = t("skuShort", { count: enabledCount, limit, sku });
  return (
    <StatGrid
      testid="uptime-kpi"
      className="lg:grid-cols-[1fr_1fr_2fr]"
    >
      <StatTile
        label={t("statUp")}
        value={upCount}
        railClass={upCount > 0 ? "bg-primary" : "bg-border"}
        pulse={upCount > 0 ? <GuardPulse /> : null}
        valueClassName="text-primary-text sm:text-2xl"
      />
      <StatTile
        label={t("statDown")}
        value={downCount}
        railClass={downCount > 0 ? "bg-destructive" : "bg-border"}
        valueClassName={
          downCount > 0
            ? "text-destructive sm:text-2xl"
            : "text-muted-foreground sm:text-2xl"
        }
      />
      <StatTile
        label={t("statSku")}
        value={<span className="min-w-0 break-words">{quotaLabel}</span>}
        railClass={skuRailClass}
        valueClassName={skuCountClassName}
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
    </StatGrid>
  );
}
