import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { Skeleton } from "@/components/ui/Skeleton";
import { hostnameRailClass } from "@/components/status/statusChrome";
import { cn } from "@/lib/utils";

function KpiTile({
  label,
  value,
  valueClass,
  railClass,
  pulse = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueClass: string;
  readonly railClass: string;
  readonly pulse?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4">
      <SiemRail className={railClass} />
      <p className="pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className={cn("mt-1 flex min-w-0 items-center pl-2", valueClass)}>
        <span className="min-w-0 truncate">{value}</span>
        {pulse ? <GuardPulse /> : null}
      </div>
    </div>
  );
}

export function StatusKpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
      <Skeleton className="h-[4.5rem] rounded-lg" />
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
  hostnameStatus,
  hostnameLabel,
}: {
  readonly published: boolean;
  readonly publishedLabel: string;
  readonly unpublishedLabel: string;
  readonly upCount: number;
  readonly downCount: number;
  readonly publicPath: string;
  readonly hostnameStatus: string;
  readonly hostnameLabel: string;
}) {
  const { t } = useTranslation("statusPage");
  const componentRail =
    downCount > 0 ? "bg-destructive" : upCount > 0 ? "bg-primary" : "bg-border";
  return (
    <div
      data-testid="status-kpi-strip"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <KpiTile
        label={t("statPublished")}
        value={published ? publishedLabel : unpublishedLabel}
        railClass={published ? "bg-primary" : "bg-border"}
        pulse={published}
        valueClass={
          published
            ? "text-lg font-semibold text-foreground"
            : "text-lg font-semibold text-muted-foreground"
        }
      />
      <KpiTile
        label={t("statComponents")}
        value={`${upCount} ${t("stateUp")} · ${downCount} ${t("stateDown")}`}
        railClass={componentRail}
        valueClass={
          downCount > 0
            ? "font-mono text-lg font-bold tabular-nums text-destructive"
            : "font-mono text-lg font-bold tabular-nums text-foreground"
        }
      />
      <KpiTile
        label={t("hostnameStatus")}
        value={hostnameLabel}
        railClass={hostnameRailClass(hostnameStatus)}
        valueClass="text-lg font-semibold text-foreground"
      />
      <KpiTile
        label={t("publicUrl")}
        value={publicPath}
        railClass="bg-border"
        valueClass="font-mono text-sm text-foreground"
      />
    </div>
  );
}
