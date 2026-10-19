import { useTranslation } from "react-i18next";
import { StatGrid, StatTile } from "@/components/patterns/StatTile";

export function UptimeDetailKpiStrip({
  pct,
  okCount,
  totalCount,
  retentionNote,
}: {
  readonly pct: number | null | undefined;
  readonly okCount: number | null | undefined;
  readonly totalCount: number | null | undefined;
  readonly retentionNote?: string;
}) {
  const { t } = useTranslation("uptime");
  return (
    <StatGrid
      testid="uptime-detail-kpi"
      className="grid-cols-3 lg:grid-cols-3"
    >
      {retentionNote ? (
        <p
          data-testid="uptime-samples-retention-note"
          className="col-span-3 text-xs text-muted-foreground"
        >
          {retentionNote}
        </p>
      ) : null}
      <StatTile
        label={t("rangeUptime")}
        value={pct == null ? "—" : `${pct}%`}
        railClass="bg-primary"
        valueLayout="text"
        valueClassName="text-primary-text"
      />
      <StatTile
        label={t("rangeOk")}
        value={okCount ?? "—"}
        railClass="bg-border"
        valueLayout="text"
      />
      <StatTile
        label={t("rangeTotal")}
        value={totalCount ?? "—"}
        railClass="bg-border"
        valueLayout="text"
      />
    </StatGrid>
  );
}
