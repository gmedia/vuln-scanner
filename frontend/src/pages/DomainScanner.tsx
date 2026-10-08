import { Globe, ListChecks, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import DomainScanForm from "@/components/scan/DomainScanForm";
import ScanProgress from "@/components/scan/ScanProgress";
import {
  ScanShell,
  ScanShellBody,
  ScanShellHead,
} from "@/components/scan/ScanShell";
import { ScanResultsPanel } from "@/components/scan/ScanResultsPanel";
import { useScanStore } from "@/store/scanStore";
import { useScanDetail } from "@/hooks/useScan";

const COVERAGE = [
  "DNS resolution and subdomain enumeration",
  "SSL/TLS certificate analysis",
  "Security headers audit",
  "Technology stack fingerprinting",
];

function DomainScanner() {
  const navigate = useNavigate();
  const activeJobId = useScanStore((s) => s.activeJobId);
  const { data: scanData } = useScanDetail(activeJobId);

  const isScanning =
    !!activeJobId &&
    (!scanData ||
      scanData.status === "running" ||
      scanData.status === "pending");
  const hasResults = scanData?.status === "completed" && scanData.result_summary;

  return (
    <div className="grid w-full items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <PageHeader title="Domain scanner" />

        <ScanShell railClass="bg-primary" testid="scan-target">
          <ScanShellHead icon={Globe} title="Scan target" />
          <ScanShellBody>
            <DomainScanForm />
          </ScanShellBody>
        </ScanShell>

        {isScanning && (
          <ScanShell railClass="bg-sky-500">
            <ScanShellHead icon={Loader} title="Scan progress" />
            <ScanShellBody>
              <ScanProgress />
            </ScanShellBody>
          </ScanShell>
        )}

        {hasResults && (
          <ScanResultsPanel
            summary={scanData.result_summary!}
            onViewDetails={() => navigate(`/scan/${activeJobId}`)}
          />
        )}
      </div>

      {!isScanning && !hasResults && (
        <ScanShell railClass="bg-border">
          <ScanShellHead icon={ListChecks} title="What this scan covers" />
          <ScanShellBody testid="scan-coverage">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {COVERAGE.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ScanShellBody>
        </ScanShell>
      )}
    </div>
  );
}

export default DomainScanner;
