import type { SiemStatus } from "@/api/siem";
import { SiemRail } from "@/components/siem/siemChrome";
import { indexerHealth, type IndexerHealth } from "@/lib/siemSeverity";

type Translate = (key: string, options?: Record<string, string | number>) => string;

const INDEXER_RAIL: Record<IndexerHealth, string> = {
  live: "bg-primary",
  degraded: "bg-amber-500",
  down: "bg-destructive",
};

const INDEXER_LABEL: Record<IndexerHealth, string> = {
  live: "kpiIndexerLive",
  degraded: "kpiIndexerDegraded",
  down: "kpiIndexerDown",
};

function IndexerPulse() {
  return (
    <span className="relative ml-2 inline-flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  );
}

function KpiTile({
  label,
  value,
  railClass,
  pulse = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly railClass: string;
  readonly pulse?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4">
      <SiemRail className={railClass} />
      <p className="pl-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center pl-2 font-mono text-lg font-bold tabular-nums text-foreground">
        {value}
        {pulse ? <IndexerPulse /> : null}
      </div>
    </div>
  );
}

export function SiemIndexerStrip({
  status,
  agentCount,
  t,
}: {
  readonly status: SiemStatus;
  readonly agentCount: number;
  readonly t: Translate;
}) {
  const health = indexerHealth(status);
  return (
    <div
      data-testid="siem-indexer-strip"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <KpiTile
        label={t("kpiIndexer")}
        value={t(INDEXER_LABEL[health])}
        railClass={INDEXER_RAIL[health]}
        pulse={health === "live"}
      />
      <KpiTile
        label={t("kpiMinLevel")}
        value={String(status.search_min_level)}
        railClass="bg-border"
      />
      <KpiTile
        label={t("kpiLookback")}
        value={t("lookbackHours", { hours: status.max_lookback_hours })}
        railClass="bg-border"
      />
      <KpiTile
        label={t("kpiAgents")}
        value={String(agentCount)}
        railClass="bg-border"
      />
    </div>
  );
}
