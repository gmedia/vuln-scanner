import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Clock, Crosshair, Shield, Target } from "lucide-react";
import { useScanDetail } from "@/hooks/useScan";
import type { ScanFinding } from "@/api/scans";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Separator } from "@/components/ui/Separator";
import { SCAN_TYPE_LABELS } from "@/lib/constants";
import SeverityChart from "@/components/results/SeverityChart";
import FindingsTable from "@/components/results/FindingsTable";

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
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const duration = scan.started_at && scan.completed_at
    ? Math.round(
        (new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()) / 1000,
      )
    : null;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
            SCAN DETAILS
          </h2>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {scan.target}
          </p>
        </div>
        <Badge variant={scan.status as "running" | "completed" | "failed" | "pending"} className="font-mono text-[10px] capitalize">
          {scan.status}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          icon={Crosshair}
          label="Findings"
          value={`${scan.result_summary?.total_findings ?? 0}`}
        />
        <QuickStat
          icon={Clock}
          label="Duration"
          value={duration ? formatDuration(duration) : "N/A"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-mono text-sm tracking-wide">
              SEVERITY
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              Distribution of {scan.result_summary?.total_findings ?? 0} findings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SeverityChart summary={scan.result_summary} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono text-sm tracking-wide">
              SCAN INFO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-sm tracking-wide">
            FINDINGS
          </CardTitle>
          <CardDescription className="font-mono text-xs">
            {scan.findings?.length ?? 0} vulnerability findings detected
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FindingsTable
            findings={scan.findings}
            isLoading={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{label}</p>
          <p className="truncate font-mono text-sm font-medium text-foreground">
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
        className={`text-xs text-foreground ${mono ? "font-mono" : ""} max-w-[60%] truncate`}
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
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-xs text-muted-foreground">
                Remediation Available
              </p>
              <p className="font-mono text-sm font-semibold text-foreground whitespace-nowrap">
                {remediated}
                <span className="text-muted-foreground font-normal">
                  /{total}
                </span>
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Progress value={pct} className="h-1.5" />
              <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-8 text-right">
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
