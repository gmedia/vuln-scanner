import { useTranslation } from "react-i18next";

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
  return (
    <div data-testid="uptime-kpi" className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
        <p className="font-mono text-lg font-bold tabular-nums text-primary sm:text-2xl">
          {upCount}
        </p>
        <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("statUp")}
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
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
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
        <p className="font-mono text-lg font-bold tabular-nums text-foreground sm:text-2xl">
          {t("skuShort", { count: enabledCount, limit, sku })}
        </p>
        <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("statSku")}
        </p>
      </div>
    </div>
  );
}
