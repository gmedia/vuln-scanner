import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function KpiTile({
  label,
  value,
  valueClass,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueClass: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 min-w-0 truncate", valueClass)}>{value}</p>
    </div>
  );
}

export function StatusKpiRow({
  published,
  publishedLabel,
  unpublishedLabel,
  upCount,
  downCount,
  publicPath,
}: {
  readonly published: boolean;
  readonly publishedLabel: string;
  readonly unpublishedLabel: string;
  readonly upCount: number;
  readonly downCount: number;
  readonly publicPath: string;
}) {
  const { t } = useTranslation("statusPage");
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      <KpiTile
        label={t("statPublished")}
        value={published ? publishedLabel : unpublishedLabel}
        valueClass={
          published
            ? "text-lg font-semibold text-foreground"
            : "text-lg font-semibold text-muted-foreground"
        }
      />
      <KpiTile
        label={t("statComponents")}
        value={`${upCount} ${t("stateUp")} · ${downCount} ${t("stateDown")}`}
        valueClass={
          downCount > 0
            ? "font-mono text-lg font-bold tabular-nums text-destructive"
            : "font-mono text-lg font-bold tabular-nums text-foreground"
        }
      />
      <KpiTile
        label={t("publicUrl")}
        value={publicPath}
        valueClass="font-mono text-sm text-foreground"
      />
    </div>
  );
}
