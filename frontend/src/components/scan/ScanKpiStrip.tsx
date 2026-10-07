import type { LucideIcon } from "lucide-react";
import { Clock, Crosshair, Shield, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GuardPulse } from "@/components/guard/guardChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  findingsRailClass,
  severityTextClass,
  statusRailClass,
  worstSeverity,
  type SeveritySummary,
} from "@/components/scan/scanChrome";
import { cn } from "@/lib/utils";

function KpiTile({
  icon: Icon,
  label,
  value,
  railClass,
  valueClass,
  pulse = false,
  testid,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly value: string;
  readonly railClass: string;
  readonly valueClass: string;
  readonly pulse?: boolean;
  readonly testid: string;
}) {
  return (
    <div
      data-testid={testid}
      className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4"
    >
      <SiemRail className={railClass} />
      <div className="flex items-center gap-2 pl-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {pulse ? <GuardPulse /> : null}
      </div>
      <p
        className={cn(
          "mt-1 truncate pl-2 font-mono text-lg font-bold tabular-nums sm:text-2xl",
          valueClass,
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

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
    <div
      data-testid="scan-kpi-strip"
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
    >
      <KpiTile
        testid="scan-kpi-findings"
        icon={Crosshair}
        label={t("findings")}
        value={String(findingsCount)}
        railClass={findingsRailClass(status, summary)}
        valueClass={findingsCount > 0 ? severityTextClass(worst) : "text-muted-foreground"}
      />
      <KpiTile
        testid="scan-kpi-target"
        icon={Target}
        label={t("target")}
        value={target}
        railClass="bg-border"
        valueClass="text-foreground"
      />
      <KpiTile
        testid="scan-kpi-type"
        icon={Shield}
        label={t("type")}
        value={typeLabel}
        railClass="bg-border"
        valueClass="text-foreground"
      />
      <KpiTile
        testid="scan-kpi-duration"
        icon={Clock}
        label={t("duration")}
        value={durationLabel}
        railClass={statusRailClass(status)}
        valueClass="text-foreground"
        pulse={running}
      />
    </div>
  );
}
