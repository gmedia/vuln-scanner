import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ScanFinding } from "@/api/scans";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Separator } from "@/components/ui/Separator";

interface FindingDetailProps {
  finding: ScanFinding;
}

function FindingDetail({ finding }: FindingDetailProps) {
  const { t } = useTranslation("scan");
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Card className="bg-card/50 shadow-xs animate-in fade-in-0 slide-in-from-top-2">
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              finding.severity as "critical" | "high" | "medium" | "low" | "info"
            }
            className="text-[10px] capitalize"
          >
            {finding.severity}
          </Badge>
          {finding.cve_id && (
            <a
              href={`https://nvd.nist.gov/vuln/detail/${finding.cve_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
            >
              {finding.cve_id}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {finding.cvss_score !== null && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              CVSS {finding.cvss_score.toFixed(1)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>

      {finding.description && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("findingDescription")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">
            {finding.description}
          </p>
        </div>
      )}

      {finding.impact && (
        <div className="mb-4">
          <Separator className="mb-3" />
          <div className="mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-500">
              {t("findingImpact")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">
            {finding.impact}
          </p>
        </div>
      )}

      {finding.remediation && (
        <div>
          <Separator className="mb-3" />
          <div className="mb-1.5 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-primary">
              {t("findingRemediation")}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">
            {finding.remediation}
          </p>
        </div>
      )}

      <Separator className="my-3" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setShowRaw(!showRaw)}
        className="h-auto px-0 text-[10px] text-muted-foreground hover:bg-transparent hover:text-foreground"
      >
        {showRaw ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {t("rawData")}
      </Button>

      {showRaw && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[10px] text-muted-foreground leading-relaxed">
          {finding.raw_data
            ? JSON.stringify(finding.raw_data, null, 2)
            : t("noRawData")}
        </pre>
      )}
      </CardContent>
    </Card>
  );
}

export default FindingDetail;
