import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { Radar, Globe, Smartphone, Crosshair, ArrowRight, Clock, ChevronDown, Loader2 } from "lucide-react";
import { useScanHistory } from "@/hooks/useScan";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/Select";
import { SCAN_TYPE_LABELS } from "@/lib/constants";
import type { ScanJob } from "@/api/scans";
import { cn } from "@/lib/utils";

const PAGE_LIMIT = 20;

const FILTER_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "ip", label: "IP Address" },
  { value: "domain", label: "Domain" },
  { value: "apk", label: "APK" },
  { value: "ipa", label: "IPA" },
] as const;

function severityCount(
  summary: ScanJob["result_summary"],
  key: "critical" | "high" | "medium" | "low" | "info" | "total_findings",
): number {
  if (!summary) return 0;
  const raw = summary[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function Dashboard() {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<ScanJob[][]>([]);
  const [allLoaded, setAllLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: pageData, isLoading, isFetching } = useScanHistory(
    page,
    PAGE_LIMIT,
    filter || undefined,
  );

  const prevFilter = useRef(filter);
  useEffect(() => {
    if (prevFilter.current !== filter) {
      setPage(1);
      setPages([]);
      setAllLoaded(false);
      prevFilter.current = filter;
    }
  }, [filter]);

  if (
    pageData &&
    !isFetching &&
    pageData.page === page &&
    pages.length < page
  ) {
    const next = [...pages, pageData.items];
    setPages(next);
    if (next.length * PAGE_LIMIT >= pageData.total) {
      setAllLoaded(true);
    }
    if (loadingMore) {
      setLoadingMore(false);
    }
  }

  const scans = pages.flat();

  const totals = scans.reduce(
    (acc, s) => {
      acc.critical += severityCount(s.result_summary, "critical");
      acc.high += severityCount(s.result_summary, "high");
      acc.medium += severityCount(s.result_summary, "medium");
      acc.low += severityCount(s.result_summary, "low");
      acc.info += severityCount(s.result_summary, "info");
      acc.total += severityCount(s.result_summary, "total_findings");
      return acc;
    },
    { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  );

  const totalScans = pageData?.total ?? scans.length;

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
    setLoadingMore(true);
  }, []);

  const isFirstLoad = isLoading && pages.length === 0;

  const quickActions = [
    {
      to: "/scan/ip",
      icon: Radar,
      label: "New IP Scan",
      desc: "Scan network hosts for vulnerabilities",
    },
    {
      to: "/scan/domain",
      icon: Globe,
      label: "New Domain Scan",
      desc: "Analyze web domains and subdomains",
    },
    {
      to: "/scan/mobile",
      icon: Smartphone,
      label: "Upload APK/IPA",
      desc: "Static analysis of mobile binaries",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Crosshair className="h-6 w-6 text-primary" />
        <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
          DASHBOARD
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Scans" value={totalScans} isLoading={isFirstLoad} />
        <StatCard
          label="Critical"
          value={totals.critical}
          isLoading={isFirstLoad}
          className="border-red-600/30"
          valueClassName="text-red-400"
        />
        <StatCard
          label="High"
          value={totals.high}
          isLoading={isFirstLoad}
          className="border-orange-500/30"
          valueClassName="text-orange-400"
        />
        <StatCard
          label="Medium"
          value={totals.medium}
          isLoading={isFirstLoad}
          className="border-yellow-500/30"
          valueClassName="text-yellow-400"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="font-mono text-sm tracking-wide shrink-0">
              SCAN HISTORY
            </CardTitle>
            <div className="flex items-center gap-3">
              <Select value={filter} onValueChange={(v) => setFilter(v === "" ? "" : v)}>
                <SelectTrigger className="h-7 w-[130px] text-[11px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-[11px]">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {totalScans > 0 && (
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {totalScans} total
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {isFirstLoad ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : scans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 rounded-full bg-muted p-3">
                  <Radar className="h-6 w-6 text-muted-foreground opacity-40" />
                </div>
                <p className="mb-1 font-mono text-sm text-foreground">
                  No scans yet
                </p>
                <p className="mb-4 font-mono text-xs text-muted-foreground">
                  {filter
                    ? `No ${SCAN_TYPE_LABELS[filter]?.toLowerCase() ?? filter} scans found.`
                    : "Start your first vulnerability scan."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {scans.map((scan) => (
                  <Link
                    key={scan.id}
                    to={`/scan/${scan.id}`}
                    className="group flex items-center justify-between rounded-md px-2 py-3 -mx-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-xs text-foreground">
                          {scan.target}
                        </span>
                        <Badge variant={scan.status as "running" | "completed" | "failed" | "pending"} className="text-[9px] capitalize shrink-0">
                          {scan.status}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {SCAN_TYPE_LABELS[scan.scan_type] ?? scan.scan_type}
                        </span>
                        {scan.started_at && (
                          <span className="font-mono text-[10px] text-muted-foreground inline-flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {new Date(scan.started_at).toLocaleDateString()}
                          </span>
                        )}
                        {severityCount(scan.result_summary, "total_findings") > 0 && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {severityCount(scan.result_summary, "total_findings")} findings
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            )}

            {!isFirstLoad && scans.length > 0 && !allLoaded && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore || isFetching}
                  className="font-mono text-xs"
                >
                  {loadingMore || isFetching ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-3 w-3" />
                      Load More
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm tracking-wide">
              QUICK ACTIONS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to} className="block">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-start transition-all duration-200 hover:bg-primary/5 hover:border-primary/40 hover:text-primary"
                >
                  <action.icon className="mr-3 h-4 w-4" />
                  <div className="text-left">
                    <span className="font-mono text-xs font-medium">
                      {action.label}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                      {action.desc}
                    </span>
                  </div>
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  isLoading,
  className,
  valueClassName,
}: {
  label: string;
  value: number;
  isLoading: boolean;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card className={cn("border-border", className)}>
      <CardContent className="flex flex-col items-center justify-center p-4">
        {isLoading ? (
          <>
            <Skeleton className="mb-2 h-8 w-16" />
            <Skeleton className="h-3 w-12" />
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-mono text-3xl font-bold tracking-tight",
                valueClassName ?? "text-foreground",
              )}
            >
              {value}
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default Dashboard;
