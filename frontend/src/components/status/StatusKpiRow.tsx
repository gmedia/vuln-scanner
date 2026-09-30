import { useTranslation } from "react-i18next";
import { LiveDot } from "@/components/uptime/UptimeChrome";
import { cn } from "@/lib/utils";

function KpiTile({
  label,
  value,
  railClass,
  valueClass,
  live,
  liveTone,
}: {
  readonly label: string;
  readonly value: string;
  readonly railClass: string;
  readonly valueClass: string;
  readonly live?: boolean;
  readonly liveTone?: "primary" | "destructive";
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
      <div className="mt-1 flex min-w-0 items-center gap-2 pl-2">
        {live ? <LiveDot tone={liveTone} /> : null}
        <p className={cn("min-w-0 truncate", valueClass)}>{value}</p>
      </div>
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
        railClass={published ? "bg-primary" : "bg-muted-foreground/30"}
        live={published}
        valueClass={
          published
            ? "text-lg font-semibold text-foreground"
            : "text-lg font-semibold text-muted-foreground"
        }
      />
      <KpiTile
        label={t("statComponents")}
        value={`${upCount} ${t("stateUp")} · ${downCount} ${t("stateDown")}`}
        railClass={downCount > 0 ? "bg-destructive" : "bg-primary"}
        live={downCount > 0}
        liveTone="destructive"
        valueClass={
          downCount > 0
            ? "font-mono text-lg font-bold tabular-nums text-destructive"
            : "font-mono text-lg font-bold tabular-nums text-foreground"
        }
      />
      <KpiTile
        label={t("publicUrl")}
        value={publicPath}
        railClass="bg-primary/50"
        valueClass="font-mono text-sm text-foreground"
      />
    </div>
  );
}
