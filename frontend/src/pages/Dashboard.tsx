import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Radar,
  Globe,
  Smartphone,
  Crosshair,
  ArrowRight,
  Clock,
  ChevronDown,
  Loader2,
  Plus,
} from "lucide-react";
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

const NEW_SCAN_OPTIONS = [
  { to: "/scan/ip", label: "IP scan", icon: Radar },
  { to: "/scan/domain", label: "Domain scan", icon: Globe },
  { to: "/scan/mobile", label: "Mobile scan", icon: Smartphone },
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
  const [newScanOpen, setNewScanOpen] = useState(false);
  const newScanRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (newScanRef.current && !newScanRef.current.contains(event.target as Node)) {
        setNewScanOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-primary" />
          <div>
            <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
              Dashboard
            </h2>
            <p className="font-mono text-[11px] text-muted-foreground">
              All-time overview · {totalScans} scan{totalScans === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div ref={newScanRef} className="relative shrink-0">
          <Button
            size="lg"
            className="w-full min-h-11 font-mono text-sm sm:w-auto"
            onClick={() => setNewScanOpen((o) => !o)}
            aria-expanded={newScanOpen}
            aria-haspopup="menu"
            data-testid="new-scan-cta"
          >
            <Plus className="mr-2 h-4 w-4" />
            New scan
            <ChevronDown className={cn("ml-2 h-3.5 w-3.5 transition-transform", newScanOpen && "rotate-180")} />
          </Button>
          {newScanOpen && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-border bg-card p-1 shadow-lg"
            >
              {NEW_SCAN_OPTIONS.map((opt) => (
                <Link
                  key={opt.to}
                  to={opt.to}
                  role="menuitem"
                  onClick={() => setNewScanOpen(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-2.5 font-mono text-xs text-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <opt.icon className="h-4 w-4 shrink-0" />
                  {opt.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Findings by severity
          <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">
            (loaded history)
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Total scans"
            value={totalScans}
            isLoading={isFirstLoad}
            valueClassName="text-foreground"
          />
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
          <StatCard
            label="Low + Info"
            value={totals.low + totals.info}
            isLoading={isFirstLoad}
            className="border-blue-500/30"
            valueClassName="text-blue-400"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between gap-4 py-3">
            <CardTitle className="shrink-0 font-mono text-sm tracking-wide">
              Scan history
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
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {scans.length} of {totalScans}
                  {!allLoaded && totalScans > scans.length ? " · more available" : ""}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {isFirstLoad ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
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
                <Button asChild size="sm" className="font-mono text-xs">
                  <Link to="/scan/ip">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New scan
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {scans.map((scan) => {
                  const crit = severityCount(scan.result_summary, "critical");
                  const high = severityCount(scan.result_summary, "high");
                  const med = severityCount(scan.result_summary, "medium");
                  const findings = severityCount(scan.result_summary, "total_findings");
                  return (
                    <Link
                      key={scan.id}
                      to={`/scan/${scan.id}`}
                      className="group -mx-2 flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-xs text-foreground">
                            {scan.target}
                          </span>
                          <Badge
                            variant={scan.status as "running" | "completed" | "failed" | "pending"}
                            className="shrink-0 text-[9px] capitalize"
                          >
                            {scan.status}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {SCAN_TYPE_LABELS[scan.scan_type] ?? scan.scan_type}
                          </span>
                          {scan.started_at && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                              <Clock className="h-2.5 w-2.5" />
                              {new Date(scan.started_at).toLocaleDateString()}
                            </span>
                          )}
                          {findings > 0 && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {findings} findings
                              {(crit > 0 || high > 0 || med > 0) && (
                                <span className="ml-1 text-muted-foreground/90">
                                  ({crit > 0 ? `${crit}C` : ""}
                                  {high > 0 ? `${crit > 0 ? " " : ""}${high}H` : ""}
                                  {med > 0 ? `${crit + high > 0 ? " " : ""}${med}M` : ""})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100" />
                    </Link>
                  );
                })}
              </div>
            )}

            {!isFirstLoad && scans.length > 0 && !allLoaded && (
              <div className="mt-3 flex justify-center">
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
                      Load more
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="font-mono text-sm tracking-wide">
              Quick actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((action) => (
              <Link key={action.to} to={action.to} className="block">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-start transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
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
      <CardContent className="flex flex-col items-center justify-center p-3 sm:p-4">
        {isLoading ? (
          <>
            <Skeleton className="mb-2 h-8 w-16" />
            <Skeleton className="h-3 w-12" />
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-mono text-2xl font-bold tracking-tight sm:text-3xl",
                valueClassName ?? "text-foreground",
              )}
            >
              {value}
            </span>
            <span className="mt-1 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default Dashboard;
