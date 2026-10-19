import type { SiemStatus } from "@/api/siem";
import { StatGrid, StatTile } from "@/components/patterns/StatTile";
import { indexerHealth, type IndexerHealth } from "@/lib/siemSeverity";

type Translate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

const INDEXER_RAIL: Record<IndexerHealth, string> = {
  live: "bg-primary",
  degraded: "bg-amber-600",
  down: "bg-destructive",
};

const INDEXER_LABEL: Record<IndexerHealth, string> = {
  live: "kpiIndexerLive",
  degraded: "kpiIndexerDegraded",
  down: "kpiIndexerDown",
};

function IndexerPulse() {
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
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
    <StatGrid testid="siem-indexer-strip" className="gap-3">
      <StatTile
        label={t("kpiIndexer")}
        value={t(INDEXER_LABEL[health])}
        railClass={INDEXER_RAIL[health]}
        pulse={health === "live" ? <IndexerPulse /> : null}
      />
      <StatTile
        label={t("kpiMinLevel")}
        value={String(status.search_min_level)}
        railClass="bg-border"
      />
      <StatTile
        label={t("kpiLookback")}
        value={t("lookbackHours", { hours: status.max_lookback_hours })}
        railClass="bg-border"
      />
      <StatTile
        label={t("kpiAgents")}
        value={String(agentCount)}
        railClass="bg-border"
      />
    </StatGrid>
  );
}
