import { ListChecks, Loader, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import MobileUpload from "@/components/scan/MobileUpload";
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
  "mobileCoverage1",
  "mobileCoverage2",
  "mobileCoverage3",
  "mobileCoverage4",
];

function MobileScanner() {
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
        <PageHeader title={t("mobileScannerTitle")} />

        <ScanShell railClass="bg-primary" testid="scan-target">
          <ScanShellHead icon={Smartphone} title={t("uploadBinary")} />
          <ScanShellBody>
            <MobileUpload />
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
                <li key={item} className="break-words">
                  {t(item)}
                </li>
              ))}
            </ul>
          </ScanShellBody>
        </ScanShell>
      )}
    </div>
  );
}

export default MobileScanner;
