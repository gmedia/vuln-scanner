import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { StatGrid, StatGridSkeleton, StatTile } from "@/components/patterns/StatTile";
import { hostnameRailClass } from "@/components/status/statusChrome";

export function StatusKpiSkeleton() {
  return <StatGridSkeleton testid="status-kpi-skeleton" />;
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
    <StatGrid testid="status-kpi-strip" className="gap-3">
      <StatTile
        label={t("statPublished")}
        value={
          <span className="min-w-0 truncate">
            {published ? publishedLabel : unpublishedLabel}
          </span>
        }
        railClass={published ? "bg-primary" : "bg-border"}
        pulse={published ? <GuardPulse /> : null}
        valueClassName={
          published
            ? "text-lg font-semibold text-foreground"
            : "text-lg font-semibold text-muted-foreground"
        }
      />
      <StatTile
        label={t("statComponents")}
        value={
          <span className="min-w-0 truncate">
            {`${upCount} ${t("stateUp")} · ${downCount} ${t("stateDown")}`}
          </span>
        }
        railClass={componentRail}
        valueClassName={
          downCount > 0
            ? "text-destructive"
            : "text-foreground"
        }
      />
      <StatTile
        label={t("hostnameStatus")}
        value={
          <span className="min-w-0 truncate">{hostnameLabel}</span>
        }
        railClass={hostnameRailClass(hostnameStatus)}
        valueClassName="text-lg font-semibold text-foreground"
      />
      <StatTile
        label={t("publicUrl")}
        value={<span className="min-w-0 truncate">{publicPath}</span>}
        railClass="bg-border"
        valueClassName="text-sm text-foreground"
      />
    </StatGrid>
  );
}
