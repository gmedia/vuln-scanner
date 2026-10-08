import { Crosshair, ListChecks, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import IpScanForm from "@/components/scan/IpScanForm";
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
  "Open ports and service versions (nmap)",
  "CVE lookup via OSV.dev",
  "Severity classification of findings",
  "Operating system fingerprinting when available",
];

function IpScanner() {
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
        <PageHeader title="IP scanner" />

        <ScanShell railClass="bg-primary" testid="scan-target">
          <ScanShellHead icon={Crosshair} title="Scan target" />
          <ScanShellBody>
            <IpScanForm />
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

export default IpScanner;
