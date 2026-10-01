import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SiemRail } from "@/components/siem/siemChrome";
import { cn } from "@/lib/utils";

function KpiTile({
  label,
  value,
  railClass,
  valueClass,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly railClass: string;
  readonly valueClass: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4">
      <SiemRail className={railClass} />
      <p className="pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 pl-2 font-mono text-lg font-bold tabular-nums sm:text-2xl", valueClass)}>
        {value}
      </p>
    </div>
  );
}

export function UptimeDetailKpiStrip({
  pct,
  okCount,
  totalCount,
  retentionNote,
}: {
  readonly pct: number | undefined;
  readonly okCount: number | undefined;
  readonly totalCount: number | undefined;
  readonly retentionNote?: string;
}) {
  const { t } = useTranslation("uptime");
  return (
    <div
      data-testid="uptime-detail-kpi"
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      {retentionNote ? (
        <p
          data-testid="uptime-samples-retention-note"
          className="col-span-3 text-xs text-muted-foreground"
        >
          {retentionNote}
        </p>
      ) : null}
      <KpiTile
        label={t("rangeUptime")}
        value={pct == null ? "—" : `${pct}%`}
        railClass="bg-primary"
        valueClass="text-primary"
      />
      <KpiTile
        label={t("rangeOk")}
        value={okCount ?? "—"}
        railClass="bg-border"
        valueClass="text-foreground"
      />
      <KpiTile
        label={t("rangeTotal")}
        value={totalCount ?? "—"}
        railClass="bg-border"
        valueClass="text-foreground"
      />
    </div>
  );
}
