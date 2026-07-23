import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  Crosshair,
  Download,
  RefreshCw,
  Shield,
  Target,
} from "lucide-react";
import { useScanDetail } from "@/hooks/useScan";
import { type ScanFinding, downloadFile } from "@/api/scans";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { SCAN_TYPE_LABELS } from "@/lib/constants";
import SeverityChart from "@/components/results/SeverityChart";
import FindingsTable from "@/components/results/FindingsTable";

function rescanPath(scanType: string): string {
  if (scanType === "domain") return "/scan/domain";
  if (scanType === "apk" || scanType === "ipa" || scanType === "mobile") {
    return "/scan/mobile";
  }
  return "/scan/ip";
}

function ScanDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: scan, isLoading, isError } = useScanDetail(id ?? null);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !scan) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 rounded-full bg-red-600/10 p-4">
            <Crosshair className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="mb-2 font-mono text-lg font-bold text-foreground">
            SCAN NOT FOUND
          </h2>
          <p className="mb-6 font-mono text-sm text-muted-foreground">
            The scan you&apos;re looking for doesn&apos;t exist or failed to load.
          </p>
          <Button variant="outline" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const durationStart = scan.started_at ?? scan.created_at;
  const duration =
    scan.completed_at && durationStart
      ? Math.max(
          0,
          Math.round(
            (new Date(scan.completed_at).getTime() -
              new Date(durationStart).getTime()) /
              1000,
          ),
        )
      : null;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const findingsCount = scan.result_summary?.total_findings ?? scan.findings?.length ?? 0;
  const reScanTo = rescanPath(scan.scan_type);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            to="/dashboard"
            className="mt-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back to Dashboard</span>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
                Scan details
              </h2>
              <Badge
                variant={scan.status as "running" | "completed" | "failed" | "pending"}
                className="font-mono text-[10px] capitalize"
              >
                {scan.status}
              </Badge>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {scan.target}
            </p>
            {scan.completed_at && (
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                Finished {new Date(scan.completed_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {id && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs"
                onClick={() => downloadFile(id, "json")}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs"
                onClick={() => downloadFile(id, "html")}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                HTML
              </Button>
            </>
          )}
          <Button asChild size="sm" className="font-mono text-xs">
            <Link to={reScanTo} data-testid="rescan-button">
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Re-scan
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStat
          icon={Crosshair}
          label="Findings"
          value={`${findingsCount}`}
          emphasize
        />
        <QuickStat
          icon={Target}
          label="Target"
          value={scan.target}
        />
        <QuickStat
          icon={Shield}
          label="Type"
          value={SCAN_TYPE_LABELS[scan.scan_type] ?? scan.scan_type}
        />
        <QuickStat
          icon={Clock}
          label="Duration"
          value={duration != null ? formatDuration(duration) : "N/A"}
        />
      </div>

      <Card>
        <CardHeader className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="font-mono text-sm tracking-wide">
                Findings
              </CardTitle>
              <CardDescription className="font-mono text-xs">
                {scan.findings?.length ?? 0} vulnerability findings detected
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <FindingsTable
            findings={scan.findings}
            isLoading={false}
          />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="py-3">
            <CardTitle className="font-mono text-sm tracking-wide">
              Severity
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              Distribution of {findingsCount} findings
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <SeverityChart summary={scan.result_summary} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="py-3">
            <CardTitle className="font-mono text-sm tracking-wide">
              Scan info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <InfoRow label="Scan ID" value={scan.id} mono />
            <InfoRow
              label="Created"
              value={new Date(scan.created_at).toLocaleString()}
            />
            {scan.started_at && (
              <InfoRow
                label="Started"
                value={new Date(scan.started_at).toLocaleString()}
              />
            )}
            {scan.completed_at && (
              <InfoRow
                label="Completed"
                value={new Date(scan.completed_at).toLocaleString()}
              />
            )}
            {scan.celery_task_id && (
              <InfoRow label="Task ID" value={scan.celery_task_id} mono />
            )}
          </CardContent>
        </Card>
      </div>

      {scan.status === "completed" && scan.findings && scan.findings.length > 0 && (
        <RemediationCard findings={scan.findings} />
      )}
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  emphasize,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <Card className={emphasize ? "border-primary/40 bg-primary/5" : undefined}>
      <CardContent className="flex items-center gap-3 p-3 sm:p-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
            emphasize ? "bg-primary/15" : "bg-muted"
          }`}
        >
          <Icon className={`h-4 w-4 ${emphasize ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{label}</p>
          <p
            className={`truncate font-mono font-medium text-foreground ${
              emphasize ? "text-base sm:text-lg" : "text-sm"
            }`}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <span
        className={`max-w-[60%] truncate text-xs text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function RemediationCard({ findings }: { findings: ScanFinding[] }) {
  const total = findings.length;
  const remediated = findings.filter((f) => f.remediation !== null).length;
  const pct = total > 0 ? Math.round((remediated / total) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500/10">
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-xs text-muted-foreground">
                Remediation Available
              </p>
              <p className="whitespace-nowrap font-mono text-sm font-semibold text-foreground">
                {remediated}
                <span className="font-normal text-muted-foreground">
                  /{total}
                </span>
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Progress value={pct} className="h-1.5" />
              <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                {pct}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScanDetail;
