import { Crosshair, ListChecks, Loader } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  "ipCoverage1",
  "ipCoverage2",
  "ipCoverage3",
  "ipCoverage4",
];

function IpScanner() {
  const { t } = useTranslation("scan");
  const navigate = useNavigate();
  const activeJobId = useScanStore((s) => s.activeJobId);
  const { data: scanData } = useScanDetail(activeJobId);

  const isScanning =
    !!activeJobId &&
    (!scanData ||
      scanData.status === "running" ||
      scanData.status === "pending");
  const hasResults =
    scanData?.status === "completed" && scanData.result_summary;

  return (
    <div className="grid w-full items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <PageHeader title={t("ipScannerTitle")} />

        <ScanShell railClass="bg-primary" testid="scan-target">
          <ScanShellHead icon={Crosshair} title={t("scanTarget")} />
          <ScanShellBody>
            <IpScanForm />
          </ScanShellBody>
        </ScanShell>

        {isScanning && (
          <ScanShell railClass="bg-sky-600">
            <ScanShellHead icon={Loader} title={t("scanProgress")} />
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
          <ScanShellHead icon={ListChecks} title={t("scanCoverage")} />
          <ScanShellBody testid="scan-coverage">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {COVERAGE.map((item) => (
                <li key={item}>{t(item)}</li>
              ))}
            </ul>
          </ScanShellBody>
        </ScanShell>
      )}
    </div>
  );
}

export default IpScanner;
