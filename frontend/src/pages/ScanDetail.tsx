import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Braces,
  Briefcase,
  Crosshair,
  Download,
  GitCompare,
  Printer,
  RefreshCw,
  Shield,
  Wrench,
} from "lucide-react";
import { useScanDetail, useScanDiff, useScanFindings } from "@/hooks/useScan";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { type ScanDiff, downloadFile, printFile } from "@/api/scans";
import type {
  FindingsSortDir,
  FindingsSortKey,
} from "@/components/results/FindingsTable";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";
import { Progress } from "@/components/ui/Progress";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton, TableRowSkeleton } from "@/components/ui/Skeleton";
import { SCAN_TYPE_LABELS } from "@/lib/constants";
import SeverityChart from "@/components/results/SeverityChart";
import FindingsTable from "@/components/results/FindingsTable";
import { ScanError } from "@/components/scan/ScanError";
import { ScanKpiStrip } from "@/components/scan/ScanKpiStrip";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  diffRailClass,
  findingsRailClass,
  findingsWashClass,
  severityRailClass,
  severityWashClass,
  worstSeverity,
} from "@/components/scan/scanChrome";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabCount,
  TabsTrigger,
} from "@/components/ui/Tabs";
import PageHeader from "@/components/layout/PageHeader";
import PageHeaderBack from "@/components/layout/PageHeaderBack";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function rescanPath(scanType: string): string {
  if (scanType === "domain") return "/scan/domain";
  if (scanType === "apk" || scanType === "ipa" || scanType === "mobile") {
    return "/scan/mobile";
  }
  return "/scan/ip";
}

const FINDINGS_PAGE_SIZE = 20;
const FINDING_SORT_KEYS: readonly FindingsSortKey[] = [
  "severity",
  "title",
  "category",
  "cvss_score",
];
const FINDING_SEVERITIES = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parseSeverity(raw: string | null): string | undefined {
  if (!raw || !FINDING_SEVERITIES.has(raw)) return undefined;
  return raw;
}

function parseSortKey(raw: string | null): FindingsSortKey {
  return FINDING_SORT_KEYS.includes(raw as FindingsSortKey)
    ? (raw as FindingsSortKey)
    : "severity";
}

function parseSortDir(raw: string | null): FindingsSortDir {
  return raw === "desc" ? "desc" : "asc";
}

const SCAN_TABS = ["findings", "diff", "export"] as const;
type ScanTab = (typeof SCAN_TABS)[number];

function parseScanTab(raw: string | null): ScanTab {
  for (const tab of SCAN_TABS) {
    if (tab === raw) return tab;
  }
  return "findings";
}

function Shell({
  railClass,
  wash,
  children,
  className,
}: {
  readonly railClass: string;
  readonly wash?: string | null;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card pl-4",
        wash,
        className,
      )}
    >
      <SiemRail className={railClass} />
      {children}
    </div>
  );
}

function ShellHead({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("border-b border-border px-4 py-3", className)}>
      {children}
    </div>
  );
}

function IconChip({ icon: Icon }: { readonly icon: typeof Briefcase }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
      aria-hidden
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}

function ScanDetail() {
  const { t } = useTranslation("scan");
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const findingsPage = parsePage(searchParams.get("page"));
  const severity = parseSeverity(searchParams.get("severity"));
  const sortKey = parseSortKey(searchParams.get("sort"));
  const sortDir = parseSortDir(searchParams.get("dir"));
  const scanTab = parseScanTab(searchParams.get("tab"));
  const urlQ = searchParams.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState(urlQ);
  const lastPushedQ = useRef(urlQ);
  const debouncedQ = useDebouncedValue(searchDraft, 300);
  const queryQ = debouncedQ.trim();

  const patchFindingsParams = useCallback(
    (next: Record<string, string | undefined>) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(next)) {
            if (!value) params.delete(key);
            else params.set(key, value);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const next = queryQ || undefined;
    const current = urlQ.trim() || undefined;
    if (next === current) return;
    lastPushedQ.current = queryQ;
    patchFindingsParams({ q: next, page: undefined });
  }, [queryQ, urlQ, patchFindingsParams]);

  useEffect(() => {
    if (urlQ === lastPushedQ.current) return;
    lastPushedQ.current = urlQ;
    setSearchDraft(urlQ);
  }, [urlQ]);

  const { data: scan, isLoading, isError } = useScanDetail(id ?? null);
  const { data: findingsData, isLoading: findingsLoading } = useScanFindings(
    id ?? null,
    findingsPage,
    FINDINGS_PAGE_SIZE,
    severity,
    queryQ || undefined,
    sortKey,
    sortDir,
  );
  const { data: diff } = useScanDiff(
    id ?? null,
    !!scan && scan.status === "completed",
  );
  const findings = findingsData?.items ?? [];
  const findingsTotal = findingsData?.total ?? 0;
  const findingsPages = findingsData?.pages ?? 0;
  const findingsLimit = findingsData?.limit ?? FINDINGS_PAGE_SIZE;
  const rangeFrom =
    findingsTotal === 0 ? 0 : (findingsPage - 1) * findingsLimit + 1;
  const rangeTo = Math.min(findingsPage * findingsLimit, findingsTotal);
  const withRemediation = findingsData?.with_remediation ?? 0;

  const onPrint = (format: "html" | "executive") => {
    if (!id) return;
    void Promise.resolve(printFile(id, format)).catch((err: unknown) => {
      if (err instanceof Error && err.message === "popup_blocked") {
        toast.error(t("printPopupBlocked"));
      }
    });
  };

  if (isLoading) {
    return (
      <div className="w-full space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Skeleton className="mt-0.5 h-11 w-11 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <Skeleton className="h-11 w-28" />
            <Skeleton className="h-11 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4"
            >
              <SiemRail className="bg-border" />
              <Skeleton className="mb-2 ml-2 h-3 w-16" />
              <Skeleton className="ml-2 h-7 w-20" />
            </div>
          ))}
        </div>
        <div className="relative overflow-hidden rounded-lg border border-border bg-card pl-4">
          <SiemRail className="bg-border" />
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="px-4 py-3">
            <TableRowSkeleton rows={6} />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !scan) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 rounded-full bg-destructive/10 p-4">
            <Crosshair className="h-8 w-8 text-destructive" aria-hidden />
          </div>
          <h2 className="mb-2 text-lg font-bold text-foreground">
            {t("scanNotFound")}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {t("scanNotFoundHint")}
          </p>
          <Button variant="outline" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("backToDashboard")}
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

  const findingsCount = scan.result_summary?.total_findings ?? findingsTotal;
  const reScanTo = rescanPath(scan.scan_type);
  const failMessage =
    typeof scan.result_summary?.error === "string" &&
    scan.result_summary.error.trim()
      ? scan.result_summary.error
      : t("failFallback");
  const worst = worstSeverity(scan.result_summary);

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {t("scanDetails")}
            <Badge
              variant={
                scan.status as "running" | "completed" | "failed" | "pending"
              }
              className="text-[10px] capitalize"
            >
              {scan.status}
            </Badge>
          </span>
        }
        description={
          <>
            <span className="block truncate font-mono text-xs">
              {scan.target}
            </span>
            {scan.completed_at ? (
              <span className="mt-0.5 block text-[11px]">
                {t("finishedAt", {
                  when: new Date(scan.completed_at).toLocaleString(),
                })}
              </span>
            ) : null}
          </>
        }
        leading={
          <PageHeaderBack to="/dashboard" label={t("backToDashboard")} />
        }
        actions={
          <>
            {(scan.scan_type === "ip" || scan.scan_type === "domain") && (
              <Button asChild variant="outline" size="lg">
                <Link
                  to={`/schedules?target=${encodeURIComponent(scan.target)}&scan_type=${scan.scan_type}`}
                  data-testid="attach-schedule-button"
                >
                  {t("setSchedule")}
                </Link>
              </Button>
            )}
            <Button asChild size="lg">
              <Link to={reScanTo} data-testid="rescan-button">
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                {t("rescan")}
              </Link>
            </Button>
          </>
        }
      />

      {scan.status === "failed" && <ScanError showIcon message={failMessage} />}

      <ScanKpiStrip
        findingsCount={findingsCount}
        target={scan.target}
        typeLabel={SCAN_TYPE_LABELS[scan.scan_type] ?? scan.scan_type}
        durationLabel={
          duration != null
            ? formatDuration(duration)
            : scan.status === "running" || scan.status === "pending"
              ? t("inProgress")
              : t("na")
        }
        status={scan.status}
        summary={scan.result_summary}
      />

      <Tabs
        value={scanTab}
        onValueChange={(next) => {
          patchFindingsParams({
            tab: next === "findings" ? undefined : next,
          });
        }}
        className="w-full"
      >
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="findings" className="gap-1.5">
            <Crosshair aria-hidden />
            {t("tabFindings")}
            <TabCount value={findingsCount} />
          </TabsTrigger>
          <TabsTrigger value="diff" className="gap-1.5">
            <GitCompare aria-hidden />
            {t("tabDiff")}
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5">
            <Download aria-hidden />
            {t("tabExport")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="mt-4 space-y-5">
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,0.9fr)] 2xl:items-start">
            <Shell
              railClass={findingsRailClass(scan.status, scan.result_summary)}
              wash={findingsWashClass(scan.status, scan.result_summary)}
            >
              <ShellHead>
                <h3 className="text-sm font-medium tracking-wide">
                  {t("findingsDetected", {
                    count: findingsTotal,
                  })}
                </h3>
                {findingsTotal > 0 ? (
                  <p
                    className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground"
                    data-testid="findings-range"
                  >
                    {t("findingsRange", {
                      from: rangeFrom,
                      to: rangeTo,
                      total: findingsTotal,
                    })}
                  </p>
                ) : null}
              </ShellHead>
              <div className="px-4 py-3">
                <FindingsTable
                  findings={findings}
                  isLoading={findingsLoading}
                  severity={severity}
                  onSeverityChange={(next) => {
                    patchFindingsParams({
                      severity: next,
                      page: undefined,
                    });
                  }}
                  search={searchDraft}
                  onSearchChange={(next) => {
                    setSearchDraft(next);
                    if (findingsPage !== 1) {
                      patchFindingsParams({ page: undefined });
                    }
                  }}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSortChange={(key, dir) => {
                    patchFindingsParams({
                      sort: key === "severity" ? undefined : key,
                      dir: dir === "asc" ? undefined : dir,
                      page: undefined,
                    });
                  }}
                  emptyReason={
                    scan.status === "failed"
                      ? "failed"
                      : scan.status === "completed"
                        ? "clean"
                        : "incomplete"
                  }
                />
                {findingsPages > 1 && (
                  <Pagination
                    className="mt-4"
                    data-testid="findings-pagination"
                  >
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() =>
                            patchFindingsParams({
                              page:
                                findingsPage <= 2
                                  ? undefined
                                  : String(findingsPage - 1),
                            })
                          }
                          disabled={findingsPage === 1}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                          {findingsPage}/{findingsPages}
                        </span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            patchFindingsParams({
                              page: String(
                                Math.min(findingsPages, findingsPage + 1),
                              ),
                            })
                          }
                          disabled={findingsPage === findingsPages}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </Shell>

            <div className="grid gap-5 lg:grid-cols-3 2xl:grid-cols-1">
              {findingsCount > 0 ? (
                <Shell
                  railClass={
                    worst ? severityRailClass(worst) : "bg-border"
                  }
                  wash={severityWashClass(worst)}
                  className="lg:col-span-1"
                >
                  <ShellHead>
                    <h3 className="text-sm font-medium tracking-wide">
                      {t("severity")}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("severityDist", { count: findingsCount })}
                    </p>
                  </ShellHead>
                  <div className="px-4 py-3">
                    <SeverityChart summary={scan.result_summary} />
                  </div>
                </Shell>
              ) : null}

              <Shell railClass="bg-border" className="lg:col-span-2">
                <ShellHead>
                  <h3 className="text-sm font-medium tracking-wide">
                    {t("scanInfo")}
                  </h3>
                </ShellHead>
                <div className="space-y-2 px-4 py-3">
                  <InfoRow label={t("scanId")} value={scan.id} mono />
                  <InfoRow
                    label={t("created")}
                    value={new Date(scan.created_at).toLocaleString()}
                  />
                  {scan.started_at && (
                    <InfoRow
                      label={t("started")}
                      value={new Date(scan.started_at).toLocaleString()}
                    />
                  )}
                  {scan.completed_at && (
                    <InfoRow
                      label={t("completed")}
                      value={new Date(scan.completed_at).toLocaleString()}
                    />
                  )}
                  {scan.celery_task_id && (
                    <InfoRow
                      label={t("taskId")}
                      value={scan.celery_task_id}
                      mono
                    />
                  )}
                </div>
              </Shell>
            </div>
          </div>

          {scan.status === "completed" && findingsCount > 0 && (
            <RemediationCard
              total={Number(findingsCount) || 0}
              remediated={withRemediation}
            />
          )}
        </TabsContent>

        <TabsContent value="diff" className="mt-4">
          {scan.status === "completed" && diff ? (
            <DiffBadgeStrip diff={diff} />
          ) : (
            <div
              className="rounded-xl border border-border bg-muted/40 px-6 py-8 text-center text-sm text-muted-foreground"
              data-testid="scan-diff-pending"
            >
              {t("diffAfterComplete")}
            </div>
          )}
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          {id ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("exportHelper")}
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <Shell railClass="bg-primary">
                  <ShellHead>
                    <div className="flex items-start gap-3">
                      <IconChip icon={Briefcase} />
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium tracking-wide">
                          {t("exportMgmtTitle")}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("execTitle")}
                        </p>
                      </div>
                    </div>
                  </ShellHead>
                  <div className="flex flex-col gap-2 px-4 py-3">
                    <Button
                      title={t("execTitle")}
                      aria-label={t("execAria")}
                      data-testid="export-executive"
                      onClick={() => downloadFile(id, "executive")}
                      className="w-full"
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      {t("execDownload")}
                    </Button>
                    <Button
                      variant="outline"
                      title={t("pdfTitle")}
                      aria-label={t("pdfAria")}
                      data-testid="export-pdf"
                      onClick={() => downloadFile(id, "pdf")}
                      className="w-full"
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      {t("pdfDownload")}
                    </Button>
                    <Button
                      variant="outline"
                      title={t("printExecTitle")}
                      aria-label={t("printExecAria")}
                      data-testid="export-print-executive"
                      onClick={() => onPrint("executive")}
                      className="w-full"
                    >
                      <Printer className="mr-1 h-3.5 w-3.5" />
                      {t("printExec")}
                    </Button>
                  </div>
                </Shell>

                <Shell railClass="bg-border">
                  <ShellHead>
                    <div className="flex items-start gap-3">
                      <IconChip icon={Wrench} />
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium tracking-wide">
                          {t("exportTechTitle")}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("htmlTechTitle")}
                        </p>
                      </div>
                    </div>
                  </ShellHead>
                  <div className="flex flex-col gap-2 px-4 py-3">
                    <Button
                      variant="outline"
                      title={t("htmlTechTitle")}
                      aria-label={t("htmlTechAria")}
                      data-testid="export-html"
                      onClick={() => downloadFile(id, "html")}
                      className="w-full"
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      {t("htmlTechDownload")}
                    </Button>
                    <Button
                      variant="outline"
                      title={t("printHtmlTitle")}
                      aria-label={t("printHtmlAria")}
                      data-testid="export-print-html"
                      onClick={() => onPrint("html")}
                      className="w-full"
                    >
                      <Printer className="mr-1 h-3.5 w-3.5" />
                      {t("printHtml")}
                    </Button>
                  </div>
                </Shell>

                <Shell railClass="bg-border">
                  <ShellHead>
                    <div className="flex items-start gap-3">
                      <IconChip icon={Braces} />
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium tracking-wide">
                          {t("exportRawTitle")}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("jsonTitle")}
                        </p>
                      </div>
                    </div>
                  </ShellHead>
                  <div className="flex flex-col gap-2 px-4 py-3">
                    <Button
                      variant="outline"
                      title={t("jsonTitle")}
                      aria-label={t("jsonAria")}
                      onClick={() => downloadFile(id, "json")}
                      className="w-full"
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      {t("jsonDownload")}
                    </Button>
                  </div>
                </Shell>
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl border border-border bg-muted/40 px-6 py-8 text-center text-sm text-muted-foreground"
              data-testid="scan-export-empty"
            >
              {t("noExport")}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DiffBadgeStrip({ diff }: { diff: ScanDiff }) {
  const { t } = useTranslation("scan");
  const hasBaseline = diff.compared_to_job_id != null;
  const hasDelta =
    diff.new_critical > 0 ||
    diff.new_high > 0 ||
    diff.resolved > 0 ||
    diff.worsened > 0;

  if (!hasBaseline && !hasDelta) {
    return (
      <div
        className="relative overflow-hidden rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 pl-4"
        data-testid="scan-diff-no-baseline"
        role="status"
      >
        <SiemRail className="bg-border" />
        <p className="pl-2 text-xs text-muted-foreground">{t("noBaseline")}</p>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4"
      data-testid="scan-diff-badge"
    >
      <SiemRail className={diffRailClass(diff)} />
      <div className="flex flex-wrap items-center gap-2 pl-2">
        <span className="text-xs font-medium text-muted-foreground">
          {hasBaseline ? t("vsBaseline") : t("findingChanges")}
        </span>
        {!hasDelta && hasBaseline && (
          <span className="text-xs text-muted-foreground" role="status">
            {t("noNewCritHigh")}
          </span>
        )}
        {diff.new_critical > 0 && (
          <Badge variant="critical" className="text-[10px]">
            {t("newCritical", { count: diff.new_critical })}
          </Badge>
        )}
        {diff.new_high > 0 && (
          <Badge variant="high" className="text-[10px]">
            {t("newHigh", { count: diff.new_high })}
          </Badge>
        )}
        {diff.resolved > 0 && (
          <Badge variant="success" className="text-[10px]">
            {t("resolved", { count: diff.resolved })}
          </Badge>
        )}
        {diff.worsened > 0 && (
          <Badge variant="medium" className="text-[10px]">
            {t("worsened", { count: diff.worsened })}
          </Badge>
        )}
        {diff.unchanged > 0 && (
          <Badge variant="default" className="text-[10px]">
            {t("unchanged", { count: diff.unchanged })}
          </Badge>
        )}
      </div>
    </div>
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
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`max-w-[60%] truncate text-xs text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function RemediationCard({
  total,
  remediated,
}: {
  total: number;
  remediated: number;
}) {
  const { t } = useTranslation("scan");
  const pct = total > 0 ? Math.round((remediated / total) * 100) : 0;

  return (
    <Shell railClass="bg-primary">
      <div className="px-4 py-4">
        <div className="flex items-center gap-3 pl-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Shield className="h-4 w-4 text-primary" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {t("remediationAvailable")}
              </p>
              <p className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-foreground">
                {remediated}
                <span className="font-normal text-muted-foreground">
                  /{total}
                </span>
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Progress value={pct} className="h-1.5" />
              <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {pct}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

export default ScanDetail;
