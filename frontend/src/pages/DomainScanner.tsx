import { Globe, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import DomainScanForm from "@/components/scan/DomainScanForm";
import ScanProgress from "@/components/scan/ScanProgress";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useScanStore } from "@/store/scanStore";
import { useScanDetail } from "@/hooks/useScan";

function DomainScanner() {
  const navigate = useNavigate();
  const activeJobId = useScanStore((s) => s.activeJobId);
  const { data: scanData } = useScanDetail(activeJobId);

  const isScanning = !!activeJobId && (!scanData || scanData.status === "running" || scanData.status === "pending");
  const hasResults = scanData?.status === "completed" && scanData.result_summary;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Globe className="h-6 w-6 text-primary" />
        <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
          DOMAIN SCANNER
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-sm tracking-wide">
            SCAN TARGET
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DomainScanForm />
        </CardContent>
      </Card>

      {isScanning && (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm tracking-wide">
              SCAN PROGRESS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScanProgress />
          </CardContent>
        </Card>
      )}

      {hasResults && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-sm tracking-wide">
                RESULTS
              </CardTitle>
              <Badge variant="completed" className="font-mono text-[10px]">
                COMPLETED
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: "Critical", count: scanData.result_summary!.critical, color: "text-red-400", bg: "bg-red-600/10" },
                { label: "High", count: scanData.result_summary!.high, color: "text-orange-400", bg: "bg-orange-500/10" },
                { label: "Medium", count: scanData.result_summary!.medium, color: "text-yellow-400", bg: "bg-yellow-500/10" },
                { label: "Low", count: scanData.result_summary!.low, color: "text-blue-400", bg: "bg-blue-500/10" },
                { label: "Info", count: scanData.result_summary!.info, color: "text-gray-400", bg: "bg-gray-500/10" },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex flex-col items-center rounded-md ${item.bg} p-3`}
                >
                  <span className={`font-mono text-lg font-bold ${item.color}`}>
                    {item.count}
                  </span>
                  <span className="mt-1 font-mono text-[9px] text-muted-foreground">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted p-3">
              <div className="flex items-center gap-2">
                {scanData.result_summary!.critical > 0 || scanData.result_summary!.high > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
                <span className="font-mono text-xs text-foreground">
                  {scanData.result_summary!.total_findings} finding
                  {scanData.result_summary!.total_findings !== 1 ? "s" : ""} found
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/scan/${activeJobId}`)}
                className="font-mono text-xs"
              >
                View Details
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default DomainScanner;
