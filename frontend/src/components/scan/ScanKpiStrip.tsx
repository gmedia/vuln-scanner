import { Clock, Crosshair, Shield, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { StatGrid, StatTile } from "@/components/patterns/StatTile";
import {
  findingsRailClass,
  severityTextClass,
  statusRailClass,
  worstSeverity,
  type SeveritySummary,
} from "@/components/scan/scanChrome";

export function ScanKpiStrip({
  findingsCount,
  target,
  typeLabel,
  durationLabel,
  status,
  summary,
}: {
  readonly findingsCount: number;
  readonly target: string;
  readonly typeLabel: string;
  readonly durationLabel: string;
  readonly status: string;
  readonly summary: SeveritySummary;
}) {
  const { t } = useTranslation("scan");
  const worst = worstSeverity(summary);
  const running = status === "running" || status === "pending";

  return (
    <StatGrid testid="scan-kpi-strip">
      <StatTile
        testid="scan-kpi-findings"
        icon={Crosshair}
        label={t("findings")}
        value={String(findingsCount)}
        railClass={findingsRailClass(status, summary)}
        valueLayout="text"
        valueClassName={
          findingsCount > 0
            ? severityTextClass(worst)
            : "text-muted-foreground"
        }
      />
      <StatTile
        testid="scan-kpi-target"
        icon={Target}
        label={t("target")}
        value={target}
        railClass="bg-border"
        valueLayout="text"
      />
      <StatTile
        testid="scan-kpi-type"
        icon={Shield}
        label={t("type")}
        value={typeLabel}
        railClass="bg-border"
        valueLayout="text"
      />
      <StatTile
        testid="scan-kpi-duration"
        icon={Clock}
        label={t("duration")}
        value={durationLabel}
        railClass={statusRailClass(status)}
        valueLayout="text"
        pulse={running ? <GuardPulse /> : null}
      />
    </StatGrid>
  );
}
