import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Radar,
  Globe,
  Smartphone,
  Crosshair,
  ChevronDown,
  Plus,
  CalendarClock,
  Shield,
  TriangleAlert,
} from "lucide-react";
import { useScanHistory } from "@/hooks/useScan";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { SCAN_TYPE_LABELS } from "@/lib/constants";
import type { ScanJob } from "@/api/scans";
import { canMutateWorkspace } from "@/api/orgs";
import { listSchedules, MAX_ENABLED_SCHEDULES } from "@/api/schedules";
import { listGuardAgents, listGuardAlerts } from "@/api/guard";
import { useAuthStore } from "@/store/authStore";
import { useCreditStore } from "@/store/creditStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const PAGE_LIMIT = 20;
const RECENT_CAP = 8;

const NEW_SCAN_OPTIONS = [
  { to: "/scan/ip", labelKey: "scanIp" as const, icon: Radar },
  { to: "/scan/domain", labelKey: "scanDomain" as const, icon: Globe },
  { to: "/scan/mobile", labelKey: "scanMobile" as const, icon: Smartphone },
];

function severityCount(
  summary: ScanJob["result_summary"],
  key: "critical" | "high" | "medium" | "low" | "info" | "total_findings",
): number {
  if (!summary) return 0;
  const raw = summary[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

function isInternalTarget(target: string): boolean {
  const t = target.trim().toLowerCase();
  if (t === "127.0.0.1" || t === "0.0.0.0" || t === "localhost") return true;
  if (t === "example.com" || t.endsWith(".example.com")) return true;
  if (t.includes("definitely-does-not-exist")) return true;
  return false;
}

function formatIdDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "en" ? "en-US" : "id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCredits(n: number, locale: string): string {
  return n.toLocaleString(locale === "en" ? "en-US" : "id-ID");
}

function latestPerTarget(scans: ScanJob[]): ScanJob[] {
  const seen = new Set<string>();
  const out: ScanJob[] = [];
  for (const s of scans) {
    const key = `${s.scan_type}:${s.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function Dashboard() {
  const { t, i18n } = useTranslation("scan");
  const [hideInternal, setHideInternal] = useState(true);

  const { data: pageData, isLoading, isFetching } = useScanHistory(
    1,
    PAGE_LIMIT,
    undefined,
  );
  const activeRole = useAuthStore((s) => s.activeRole);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const canCreateScans = canMutateWorkspace(activeRole());
  const credits = useCreditStore((s) => s.credits);
  const fetchBalance = useCreditStore((s) => s.fetchBalance);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance, activeOrgId]);

  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules", activeOrgId],
    queryFn: listSchedules,
    enabled: !!activeOrgId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["guard-agents", activeOrgId],
    queryFn: listGuardAgents,
    enabled: !!activeOrgId,
    retry: false,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["guard-alerts", activeOrgId],
    queryFn: () => listGuardAlerts(20),
    enabled: !!activeOrgId,
    retry: false,
  });

  const scans = useMemo(() => pageData?.items ?? [], [pageData?.items]);
  const totalScans = pageData?.total ?? scans.length;
  const isFirstLoad = isLoading && !pageData;

  const [nowMs] = useState(() => Date.now());
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;

  const uniqueLatest = useMemo(() => latestPerTarget(scans), [scans]);

  const displayed = useMemo(() => {
    const filtered = hideInternal
      ? uniqueLatest.filter((s) => !isInternalTarget(s.target))
      : uniqueLatest;
    const sorted = [...filtered].sort((a, b) => {
      const rank = (s: ScanJob) =>
        s.status === "failed" ? 0 : s.status === "running" ? 1 : 2;
      const rd = rank(a) - rank(b);
      if (rd !== 0) return rd;
      return (
        new Date(b.started_at ?? 0).getTime() -
        new Date(a.started_at ?? 0).getTime()
      );
    });
    return sorted.slice(0, RECENT_CAP);
  }, [uniqueLatest, hideInternal]);

  const hiddenInternalCount = uniqueLatest.filter((s) =>
    isInternalTarget(s.target),
  ).length;

  const openRisk = uniqueLatest.reduce(
    (acc, s) => {
      if (s.status !== "completed") return acc;
      acc.critical += severityCount(s.result_summary, "critical");
      acc.high += severityCount(s.result_summary, "high");
      return acc;
    },
    { critical: 0, high: 0 },
  );

  const weekCounts = scans.reduce(
    (acc, s) => {
      const t = s.started_at ? new Date(s.started_at).getTime() : 0;
      if (t < weekAgo) return acc;
      acc.critical += severityCount(s.result_summary, "critical");
      acc.high += severityCount(s.result_summary, "high");
      acc.medium += severityCount(s.result_summary, "medium");
      return acc;
    },
    { critical: 0, high: 0, medium: 0 },
  );

  const enabledSchedules = schedules.filter((s) => s.enabled);
  const failedJobs = scans.filter((s) => s.status === "failed");
  const staleAgents = agents.filter((a) => {
    if (!a.last_keep_alive) return a.status !== "active";
    const age = nowMs - new Date(a.last_keep_alive).getTime();
    return age > 24 * 60 * 60 * 1000;
  });
  const criticalAlerts = alerts.filter((a) => a.rule_level >= 12);

  const attention: { key: string; text: string; to: string }[] = [];
  if (openRisk.critical + openRisk.high > 0) {
    attention.push({
      key: "risk",
      text: t("attentionRisk", { count: openRisk.critical + openRisk.high }),
      to: "#pekerjaan-terakhir",
    });
  }
  if (failedJobs.length > 0) {
    attention.push({
      key: "fail",
      text: t("attentionFail", { count: failedJobs.length }),
      to: `/scan/${failedJobs[0].id}`,
    });
  }
  if (staleAgents.length > 0) {
    attention.push({
      key: "guard",
      text: t("attentionGuardStale", { count: staleAgents.length }),
      to: "/guard",
    });
  }
  if (criticalAlerts.length > 0) {
    attention.push({
      key: "alert",
      text: t("attentionGuardAlert", { count: criticalAlerts.length }),
      to: "/guard",
    });
  }

  const noJadwal = enabledSchedules.length === 0;
  const primaryIsJadwal = canCreateScans && noJadwal;

  return (
    <div className="w-full max-w-none space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold tracking-wide text-foreground">
              {t("summary")}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {enabledSchedules.length > 0
                ? t("assetsWithActiveSchedules", {
                    count: enabledSchedules.length,
                  })
                : t("oneOffScansNoAttach", { count: totalScans })}
            </p>
          </div>
        </div>

        {canCreateScans ? (
          <div className="flex flex-wrap items-center gap-2">
            {primaryIsJadwal ? (
              <Button asChild className="text-sm">
                <Link to="/schedules" data-testid="primary-jadwal-cta">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {t("setSchedule")}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="text-sm">
                <Link to="/schedules">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {t("setSchedule")}
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={primaryIsJadwal ? "outline" : "default"}
                  className="w-full text-sm sm:w-auto"
                  data-testid="new-scan-cta"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("newScan")}
                  <ChevronDown className="ml-2 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {NEW_SCAN_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.to} asChild>
                    <Link to={opt.to}>
                      <opt.icon className="h-4 w-4 shrink-0" />
                      {t(opt.labelKey)}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <p
            className="text-xs text-muted-foreground"
            data-testid="viewer-scan-readonly"
          >
            {t("viewerReadonly")}
          </p>
        )}
      </div>

      {attention.length > 0 && (
        <Alert
          variant="destructive"
          className="border-destructive/40"
          data-testid="attention-strip"
        >
          <TriangleAlert />
          <AlertTitle>{t("attention")}</AlertTitle>
          <AlertDescription>
            {attention.map((a) => (
              <Link
                key={a.key}
                to={a.to}
                className="block text-xs hover:underline"
              >
                {a.text}
              </Link>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("openRisk")}
          value={openRisk.critical + openRisk.high}
          isLoading={isFirstLoad}
          className="border-red-600/30"
          valueClassName="text-red-400"
        />
        <StatCard
          label={t("weekChm")}
          value={`${weekCounts.critical}/${weekCounts.high}/${weekCounts.medium}`}
          isLoading={isFirstLoad}
          className="border-orange-500/30"
          valueClassName="text-orange-400"
        />
        <StatCard
          label={t("schedules")}
          value={`${enabledSchedules.length} / ${MAX_ENABLED_SCHEDULES}`}
          isLoading={false}
          className="border-primary/30"
          valueClassName="text-foreground"
        />
        <StatCard
          label={t("credits")}
          value={formatCredits(credits, i18n.language)}
          isLoading={false}
          valueClassName="text-foreground"
        />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-12">
        <Card className="flex min-h-0 flex-col lg:col-span-8">
          <CardHeader className="border-b pb-4">
            <CardTitle
              id="pekerjaan-terakhir"
              className="shrink-0 text-sm tracking-wide"
            >
              {t("recentWork")}
            </CardTitle>
            {hiddenInternalCount > 0 && (
              <CardAction>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 text-[10px] text-muted-foreground"
                  onClick={() => setHideInternal((v) => !v)}
                >
                  {hideInternal
                    ? t("labTargetsHidden", { count: hiddenInternalCount })
                    : t("hideLabTargets")}
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="flex-1">
            {isFirstLoad || (isFetching && !pageData) ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : scans.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-10 text-center">
                <Radar className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-foreground">{t("noScansYet")}</p>
                <p className="text-xs text-muted-foreground">
                  {canCreateScans
                    ? t("emptyCanCreate")
                    : t("emptyCannotCreate")}
                </p>
                  {canCreateScans && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <Button asChild size="sm" className="text-xs">
                      <Link to="/scan/ip">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        {t("scanIp")}
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      <Link to="/schedules" data-testid="empty-schedules-link">
                        <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                        {t("setSchedule")}
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : displayed.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {t("allLabRows")}
              </p>
            ) : (
              <Table className="table-fixed text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[36%] text-[10px] uppercase tracking-wider">
                      {t("colTarget")}
                    </TableHead>
                    <TableHead className="w-[12%] text-[10px] uppercase tracking-wider">
                      {t("colType")}
                    </TableHead>
                    <TableHead className="w-[16%] text-[10px] uppercase tracking-wider">
                      {t("colFinished")}
                    </TableHead>
                    <TableHead className="w-[24%] text-[10px] uppercase tracking-wider">
                      {t("colFindings")}
                    </TableHead>
                    <TableHead className="w-[12%] text-[10px] uppercase tracking-wider">
                      {t("colStatus")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayed.map((scan) => {
                    const crit = severityCount(scan.result_summary, "critical");
                    const high = severityCount(scan.result_summary, "high");
                    const med = severityCount(scan.result_summary, "medium");
                    const showStatus =
                      scan.status === "failed" ||
                      scan.status === "running" ||
                      scan.status === "pending";
                    return (
                      <TableRow key={scan.id}>
                        <TableCell className="pr-2">
                          <Link
                            to={`/scan/${scan.id}`}
                            className="block truncate font-mono text-xs text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {scan.target}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {SCAN_TYPE_LABELS[scan.scan_type] ?? scan.scan_type}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatIdDate(scan.started_at, i18n.language)}
                        </TableCell>
                        <TableCell>
                          {crit + high + med > 0 ? (
                            <span className="flex flex-wrap gap-1">
                              {crit > 0 && (
                                <Badge variant="critical">{crit}C</Badge>
                              )}
                              {high > 0 && (
                                <Badge variant="high">{high}H</Badge>
                              )}
                              {med > 0 && (
                                <Badge variant="medium">{med}M</Badge>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {showStatus ? (
                            <Badge
                              variant={
                                scan.status as
                                  | "running"
                                  | "completed"
                                  | "failed"
                                  | "pending"
                              }
                              className="capitalize"
                            >
                              {scan.status === "failed"
                                ? t("statusFailed")
                                : scan.status === "running"
                                  ? t("statusRunning")
                                  : t("statusQueued")}
                            </Badge>
                          ) : (
                            <Badge variant="completed" className="capitalize">
                              {t("statusOk")}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {!isFirstLoad && totalScans > 0 && (
              <p className="mt-3 text-right text-[11px] text-muted-foreground">
                {t("workspaceScanCount", { count: totalScans })}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex h-full min-h-0 flex-col gap-4 lg:col-span-4">
          <Card className="flex flex-1 flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm tracking-wide">{t("attachCoverage")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col space-y-2 text-xs">
              {enabledSchedules.length === 0 ? (
                <p className="text-muted-foreground">
                  {t("noSchedulesHint")}
                </p>
              ) : (
                enabledSchedules.slice(0, 3).map((sch) => (
                  <div key={sch.id} className="border-b border-border pb-2 last:border-0">
                    <p className="font-mono text-foreground">{sch.target}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {sch.cadence} · {t("nextRun", { date: formatIdDate(sch.next_run_at, i18n.language) })}
                    </p>
                  </div>
                ))
              )}
              <Button asChild variant="outline" size="sm" className="w-full text-xs">
                <Link to="/schedules">
                  <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                  {t("manageSchedules")}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-1 flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm tracking-wide">{t("guard")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col space-y-2 text-xs">
              <p className="text-muted-foreground">
                {t("agentsCount", { count: agents.length })}
                {staleAgents.length > 0
                  ? t("staleSuffix", { count: staleAgents.length })
                  : ""}
              </p>
              <Button asChild variant="outline" size="sm" className="w-full text-xs">
                <Link to="/guard">
                  <Shield className="mr-1.5 h-3.5 w-3.5" />
                  {t("openGuard")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
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
  value: number | string;
  isLoading: boolean;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card className={cn("border-border", className)}>
      <CardContent className="flex flex-col items-center justify-center p-3">
        {isLoading ? (
          <>
            <Skeleton className="mb-1 h-7 w-14" />
            <Skeleton className="h-3 w-12" />
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl",
                valueClassName ?? "text-foreground",
              )}
            >
              {value}
            </span>
            <span className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default Dashboard;
