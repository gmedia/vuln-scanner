import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  ScanShell,
  ScanShellBody,
  ScanShellHead,
} from "@/components/scan/ScanShell";
import {
  scannerResultRailClass,
  scannerResultWashClass,
  severityRailClass,
  severityTextClass,
} from "@/components/scan/scanChrome";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/toneColors";
import { RAILED_CARD_CLASS } from "@/components/patterns/RailedShell";

type ScanSummary = {
  readonly critical?: unknown;
  readonly high?: unknown;
  readonly medium?: unknown;
  readonly low?: unknown;
  readonly info?: unknown;
  readonly total_findings?: unknown;
};

function count(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

const SEVERITIES = [
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
  { key: "info", label: "Info" },
] as const;

export function ScanResultsPanel({
  summary,
  onViewDetails,
}: {
  readonly summary: ScanSummary;
  readonly onViewDetails: () => void;
}) {
  const { t } = useTranslation("scan");
  const critical = count(summary.critical);
  const high = count(summary.high);
  const medium = count(summary.medium);
  const low = count(summary.low);
  const info = count(summary.info);
  const totalFindings = count(summary.total_findings);
  const values: Record<string, number> = { critical, high, medium, low, info };
  const needsAttention = critical > 0 || high > 0;
  const railTone = { critical, high, medium, low };

  return (
    <ScanShell
      railClass={scannerResultRailClass(railTone)}
      className={cn(scannerResultWashClass(railTone))}
      testid="scan-results"
    >
      <ScanShellHead
        title={t("resultsTitle")}
        aside={
          <Badge variant="completed" className="text-[10px]">
            COMPLETED
          </Badge>
        }
      />
      <ScanShellBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
          {SEVERITIES.map((item) => (
            <div
              key={item.key}
              className={cn(RAILED_CARD_CLASS, "px-3 py-2")}
            >
              <SiemRail className={severityRailClass(item.key)} />
              <span
                className={cn(
                  "block pl-1 font-mono text-lg font-bold tabular-nums",
                  severityTextClass(item.key),
                )}
              >
                {values[item.key]}
              </span>
              <span className="mt-0.5 block pl-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <div className={cn(RAILED_CARD_CLASS, "rounded-md bg-muted/40 p-3")}>
          <SiemRail
            className={needsAttention ? "bg-destructive" : "bg-primary"}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 pl-2">
            <div className="flex items-center gap-2">
              {needsAttention ? (
                <AlertTriangle className={cn("h-4 w-4", TONE_TEXT.red)} />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-primary-text" />
              )}
              <span className="text-xs text-foreground">
                {totalFindings} finding
                {totalFindings !== 1 ? "s" : ""} found
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onViewDetails}
              className="min-h-11 text-xs sm:min-h-9"
            >
              View Details
            </Button>
          </div>
        </div>
      </ScanShellBody>
    </ScanShell>
  );
}
