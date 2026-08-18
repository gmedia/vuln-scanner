import { useState, useRef, useEffect, useMemo } from "react";
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
} from "lucide-react";
import { useScanHistory } from "@/hooks/useScan";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { SCAN_TYPE_LABELS } from "@/lib/constants";
import type { ScanJob } from "@/api/scans";
import { canMutateWorkspace } from "@/api/orgs";
import { listSchedules, MAX_ENABLED_SCHEDULES } from "@/api/schedules";
import { listGuardAgents, listGuardAlerts } from "@/api/guard";
import { useAuthStore } from "@/store/authStore";
import { useCreditStore } from "@/store/creditStore";
import { cn } from "@/lib/utils";

const PAGE_LIMIT = 20;
const RECENT_CAP = 8;

const NEW_SCAN_OPTIONS = [
  { to: "/scan/ip", label: "Scan IP", icon: Radar },
  { to: "/scan/domain", label: "Scan domain", icon: Globe },
  { to: "/scan/mobile", label: "Scan mobile", icon: Smartphone },
] as const;

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

function formatIdDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCredits(n: number): string {
  return n.toLocaleString("id-ID");
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
  const [hideInternal, setHideInternal] = useState(true);
  const [newScanOpen, setNewScanOpen] = useState(false);
  const newScanRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        newScanRef.current &&
        !newScanRef.current.contains(event.target as Node)
      ) {
        setNewScanOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      text: `${openRisk.critical + openRisk.high} temuan Critical/High pada scan terakhir per target`,
      to: "#pekerjaan-terakhir",
    });
  }
  if (failedJobs.length > 0) {
    attention.push({
      key: "fail",
      text: `${failedJobs.length} scan gagal pada halaman ini`,
      to: `/scan/${failedJobs[0].id}`,
    });
  }
  if (staleAgents.length > 0) {
    attention.push({
      key: "guard",
      text: `${staleAgents.length} agen Guard tidak check-in > 24 jam`,
      to: "/guard",
    });
  }
  if (criticalAlerts.length > 0) {
    attention.push({
      key: "alert",
      text: `${criticalAlerts.length} alert Guard level tinggi`,
      to: "/guard",
    });
  }

  const noJadwal = enabledSchedules.length === 0;
  const primaryIsJadwal = canCreateScans && noJadwal;

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-bold tracking-wide text-foreground">
              Ringkasan
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {enabledSchedules.length > 0
                ? `${enabledSchedules.length} aset dengan jadwal aktif`
                : `${totalScans} scan sekali jalan · belum ada attach`}
            </p>
          </div>
        </div>

        {canCreateScans ? (
          <div className="flex flex-wrap items-center gap-2">
            {primaryIsJadwal ? (
              <Button asChild size="lg" className="min-h-11 text-sm">
                <Link to="/schedules" data-testid="primary-jadwal-cta">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Atur jadwal
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="lg" className="min-h-11 text-sm">
                <Link to="/schedules">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Atur jadwal
                </Link>
              </Button>
            )}
            <div ref={newScanRef} className="relative shrink-0">
              <Button
                size="lg"
                variant={primaryIsJadwal ? "outline" : "default"}
                className="w-full min-h-11 text-sm sm:w-auto"
                onClick={() => setNewScanOpen((o) => !o)}
                aria-expanded={newScanOpen}
                aria-haspopup="menu"
                data-testid="new-scan-cta"
              >
                <Plus className="mr-2 h-4 w-4" />
                Scan baru
                <ChevronDown
                  className={cn(
                    "ml-2 h-3.5 w-3.5 transition-transform",
                    newScanOpen && "rotate-180",
                  )}
                />
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
                      className="flex items-center gap-2 rounded-md px-3 py-2.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <opt.icon className="h-4 w-4 shrink-0" />
                      {opt.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p
            className="text-xs text-muted-foreground"
            data-testid="viewer-scan-readonly"
          >
            Peran viewer — hanya melihat riwayat
          </p>
        )}
      </div>

      {attention.length > 0 && (
        <div
          className="space-y-1.5 rounded-md border border-red-600/40 bg-red-950/20 px-3 py-2"
          data-testid="attention-strip"
        >
          {attention.map((a) => (
            <Link
              key={a.key}
              to={a.to}
              className="block text-xs text-red-200 hover:underline"
            >
              {a.text}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Risiko terbuka"
          value={openRisk.critical + openRisk.high}
          isLoading={isFirstLoad}
          className="border-red-600/30"
          valueClassName="text-red-400"
        />
        <StatCard
          label="7 hari (C/H/M)"
          value={`${weekCounts.critical}/${weekCounts.high}/${weekCounts.medium}`}
          isLoading={isFirstLoad}
          className="border-orange-500/30"
          valueClassName="text-orange-400"
        />
        <StatCard
          label="Jadwal"
          value={`${enabledSchedules.length} / ${MAX_ENABLED_SCHEDULES}`}
          isLoading={false}
          className="border-primary/30"
          valueClassName="text-foreground"
        />
        <StatCard
          label="Kredit"
          value={formatCredits(credits)}
          isLoading={false}
          valueClassName="text-foreground"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="flex flex-col lg:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between gap-4 py-3">
            <CardTitle
              id="pekerjaan-terakhir"
              className="shrink-0 text-sm tracking-wide"
            >
              Pekerjaan terakhir
            </CardTitle>
            <div className="flex items-center gap-3">
              {hiddenInternalCount > 0 && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setHideInternal((v) => !v)}
                >
                  {hideInternal
                    ? `Target percobaan disembunyikan (${hiddenInternalCount})`
                    : "Sembunyikan target percobaan"}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 pt-0">
            {isFirstLoad || (isFetching && !pageData) ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : scans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 rounded-full bg-muted p-3">
                  <Radar className="h-6 w-6 text-muted-foreground opacity-40" />
                </div>
                <p className="mb-1 text-sm text-foreground">Belum ada scan</p>
                <p className="mb-4 text-xs text-muted-foreground">
                  {canCreateScans
                    ? "Scan IP atau domain, atau pasang jadwal attach."
                    : "Belum ada scan di workspace ini."}
                </p>
                {canCreateScans && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button asChild size="sm" className="text-xs">
                      <Link to="/scan/ip">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Scan IP
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
                        Atur jadwal
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : displayed.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Semua baris adalah target percobaan. Tampilkan untuk melihatnya.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="w-[36%] py-2 font-medium">Target</th>
                      <th className="w-[12%] py-2 font-medium">Jenis</th>
                      <th className="w-[16%] py-2 font-medium">Selesai</th>
                      <th className="w-[24%] py-2 font-medium">Temuan</th>
                      <th className="w-[12%] py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayed.map((scan) => {
                      const crit = severityCount(scan.result_summary, "critical");
                      const high = severityCount(scan.result_summary, "high");
                      const med = severityCount(scan.result_summary, "medium");
                      const showStatus =
                        scan.status === "failed" ||
                        scan.status === "running" ||
                        scan.status === "pending";
                      return (
                        <tr key={scan.id} className="hover:bg-muted/40">
                          <td className="py-2 pr-2">
                            <Link
                              to={`/scan/${scan.id}`}
                              className="block truncate font-mono text-xs text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {scan.target}
                            </Link>
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {SCAN_TYPE_LABELS[scan.scan_type] ?? scan.scan_type}
                          </td>
                          <td className="py-2 text-muted-foreground">
                            {formatIdDate(scan.started_at)}
                          </td>
                          <td className="py-2">
                            {crit + high + med > 0 ? (
                              <span className="flex flex-wrap gap-1">
                                {crit > 0 && (
                                  <span className="text-red-400">{crit}C</span>
                                )}
                                {high > 0 && (
                                  <span className="text-orange-400">{high}H</span>
                                )}
                                {med > 0 && (
                                  <span className="text-yellow-400">{med} sedang</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2">
                            {showStatus ? (
                              <Badge
                                variant={
                                  scan.status as
                                    | "running"
                                    | "completed"
                                    | "failed"
                                    | "pending"
                                }
                                className="text-[9px] capitalize"
                              >
                                {scan.status === "failed"
                                  ? "Gagal"
                                  : scan.status === "running"
                                    ? "Berjalan"
                                    : "Antrian"}
                              </Badge>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!isFirstLoad && totalScans > 0 && (
              <p className="mt-3 text-right text-[11px] text-muted-foreground">
                {totalScans} scan di workspace · menampilkan target unik terbaru
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm tracking-wide">Cakupan attach</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {enabledSchedules.length === 0 ? (
                <p className="text-muted-foreground">
                  Belum ada jadwal. Pilih IP/domain colo atau VPS, set mingguan.
                </p>
              ) : (
                enabledSchedules.slice(0, 3).map((sch) => (
                  <div key={sch.id} className="border-b border-border pb-2 last:border-0">
                    <p className="font-mono text-foreground">{sch.target}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {sch.cadence} · berikutnya {formatIdDate(sch.next_run_at)}
                    </p>
                  </div>
                ))
              )}
              <Button asChild variant="outline" size="sm" className="w-full text-xs">
                <Link to="/schedules">
                  <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                  Kelola jadwal
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm tracking-wide">Guard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p className="text-muted-foreground">
                {agents.length} agen
                {staleAgents.length > 0
                  ? ` · ${staleAgents.length} stale`
                  : ""}
              </p>
              <Button asChild variant="outline" size="sm" className="w-full text-xs">
                <Link to="/guard">
                  <Shield className="mr-1.5 h-3.5 w-3.5" />
                  Buka Guard
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
                "font-mono text-2xl font-bold tracking-tight tabular-nums sm:text-3xl",
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
