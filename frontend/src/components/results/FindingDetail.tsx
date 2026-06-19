import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Shield, Wrench } from "lucide-react";
import type { ScanFinding } from "@/api/scans";
import { Badge } from "@/components/ui/Badge";
import { Separator } from "@/components/ui/Separator";

interface FindingDetailProps {
  finding: ScanFinding;
}

function FindingDetail({ finding }: FindingDetailProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 shadow-sm animate-in fade-in-0 slide-in-from-top-2">
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          <span className="font-mono text-xs text-muted-foreground">
            CVSS {finding.cvss_score.toFixed(1)}
          </span>
        )}
      </div>

      {finding.description && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </span>
          </div>
          <p className="font-mono text-xs text-foreground leading-relaxed">
            {finding.description}
          </p>
        </div>
      )}

      {finding.remediation && (
        <div>
          <Separator className="mb-3" />
          <div className="mb-1.5 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-primary">
              Remediation
            </span>
          </div>
          <p className="font-mono text-xs text-foreground leading-relaxed">
            {finding.remediation}
          </p>
        </div>
      )}

      <Separator className="my-3" />

      <button
        onClick={() => setShowRaw(!showRaw)}
        className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {showRaw ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        RAW DATA
      </button>

      {showRaw && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[10px] text-muted-foreground leading-relaxed">
          {finding.raw_data
            ? JSON.stringify(finding.raw_data, null, 2)
            : "No raw data available for this finding."}
        </pre>
      )}
    </div>
  );
}

export default FindingDetail;
