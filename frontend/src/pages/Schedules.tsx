import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ArrowLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Download,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { downloadFile } from "@/api/scans";
import {
  createSchedule,
  deleteSchedule,
  listScheduleRuns,
  listSchedules,
  mapScheduleError,
  MAX_ENABLED_SCHEDULES,
  updateSchedule,
  type ScanSchedule,
  type ScheduleRunJob,
} from "@/api/schedules";
import type { ApiError } from "@/lib/utils";
import { canMutateWorkspace } from "@/api/orgs";
import { useAuthStore } from "@/store/authStore";

export { mapScheduleError };

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    });
  } catch {
    return iso;
  }
}

function apiDetail(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as ApiError).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function isCreditError(raw: string | null | undefined): boolean {
  return !!raw && raw.toLowerCase().includes("insufficient credits");
}

function parseScanType(value: string | null): "domain" | "ip" {
  return value === "ip" ? "ip" : "domain";
}

function ScheduleRunsPanel({ scheduleId }: { scheduleId: string }) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const { data, isLoading, error } = useQuery({
    queryKey: ["schedule-runs", activeOrgId, scheduleId],
    queryFn: () => listScheduleRuns(scheduleId, 10),
    enabled: !!activeOrgId && !!scheduleId,
  });

  if (isLoading) {
    return (
      <div className="mt-2 space-y-1 pl-1">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mt-2 border-destructive/40 text-xs">
        <AlertTriangle />
        <AlertDescription>Gagal memuat riwayat scan</AlertDescription>
      </Alert>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Belum ada scan dari target ini.
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-1 border-l border-border pl-3">
      {data.map((job: ScheduleRunJob) => (
        <li
          key={job.id}
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <Badge
            variant={
              job.status === "completed"
                ? "completed"
                : job.status === "failed"
                  ? "failed"
                  : job.status === "running"
                    ? "running"
                    : "pending"
            }
            className="text-[10px]"
          >
            {job.status}
          </Badge>
          <span>{formatWhen(job.created_at ?? null)}</span>
          <Link to={`/scan/${job.id}`} className="text-primary hover:underline">
            buka scan
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Schedules() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
  const activeRole = useAuthStore((s) => s.activeRole);
  const canCreate = canMutateWorkspace(activeRole());

  const prefillKey = `${searchParams.get("target") ?? ""}\0${searchParams.get("scan_type") ?? ""}`;
  const [prefillApplied, setPrefillApplied] = useState("");
  const [target, setTarget] = useState("");
  const [scanType, setScanType] = useState<"domain" | "ip">("domain");
  if (prefillKey !== prefillApplied) {
    setPrefillApplied(prefillKey);
    const t = searchParams.get("target");
    setTarget(t ?? "");
    setScanType(parseScanType(searchParams.get("scan_type")));
  }

  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const { data, isLoading, error } = useQuery({
    queryKey: ["schedules", activeOrgId],
    queryFn: listSchedules,
    enabled: !!activeOrgId,
  });

  const enabledCount = useMemo(
    () => (data ? data.filter((s) => s.enabled).length : 0),
    [data],
  );
  const atCap = enabledCount >= MAX_ENABLED_SCHEDULES;
  const capPercent = Math.min(
    100,
    Math.round((enabledCount / MAX_ENABLED_SCHEDULES) * 100),
  );

  const createMut = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schedules"] });
      setName("");
      setTarget("");
      setNotifyEmail("");
      setFormError(null);
    },
    onError: (err: unknown) => {
      setFormError(mapScheduleError(apiDetail(err, "Gagal membuat jadwal")));
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateSchedule(id, { enabled }),
    onSuccess: () => {
      setActionError(null);
      void qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err: unknown) => {
      setActionError(
        mapScheduleError(apiDetail(err, "Gagal mengubah status jadwal")),
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      setActionError(null);
      void qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err: unknown) => {
      setActionError(
        mapScheduleError(apiDetail(err, "Gagal menghapus jadwal")),
      );
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (atCap) {
      setFormError(
        `Batas ${MAX_ENABLED_SCHEDULES} jadwal aktif per organisasi tercapai. Nonaktifkan satu dulu.`,
      );
      return;
    }
    if (!target.trim()) {
      setFormError("Target wajib diisi");
      return;
    }
    const email = notifyEmail.trim();
    createMut.mutate({
      name: name.trim() || undefined,
      scan_type: scanType,
      target: target.trim(),
      cadence,
      timezone: "Asia/Jakarta",
      notify_email: email || undefined,
    });
  }

  function toggleRuns(id: string) {
    setExpandedRuns((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <CalendarClock className="h-6 w-6 text-primary" />
        <h2 className="text-lg font-bold tracking-wide text-foreground">
          Jadwal scan
        </h2>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm tracking-wide">
              Kuota jadwal aktif
            </CardTitle>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {enabledCount}/{MAX_ENABLED_SCHEDULES}
            </span>
          </div>
          <Progress value={capPercent} className="h-1.5" />
          {atCap && (
            <Alert className="border-amber-500/40 text-amber-400" role="status">
              <AlertTriangle />
              <AlertDescription>
                Batas {MAX_ENABLED_SCHEDULES} jadwal aktif per organisasi
                tercapai. Nonaktifkan satu jadwal sebelum membuat yang baru.
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
      </Card>

      {canCreate ? (
        <Card data-testid="schedule-create-card">
          <CardHeader>
            <CardTitle className="text-sm tracking-wide">Jadwal baru</CardTitle>
            <CardDescription className="text-xs">
              Scan domain/IP berulang (mingguan atau bulanan). Dipotong kredit
              setiap kali dijalankan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sched-name">Label (opsional)</Label>
                  <Input
                    id="sched-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Eksternal mingguan"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipe</Label>
                  <Select
                    value={scanType}
                    onValueChange={(v) => setScanType(v as "domain" | "ip")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domain">Domain</SelectItem>
                      <SelectItem value="ip">IP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sched-target">Target</Label>
                  <Input
                    id="sched-target"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder={
                      scanType === "ip" ? "203.0.113.10" : "example.com"
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Frekuensi</Label>
                  <Select
                    value={cadence}
                    onValueChange={(v) => setCadence(v as "weekly" | "monthly")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Mingguan</SelectItem>
                      <SelectItem value="monthly">Bulanan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="sched-notify">
                    Email notifikasi (opsional)
                  </Label>
                  <Input
                    id="sched-notify"
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder="default: email akun Anda"
                  />
                </div>
              </div>
              {formError && (
                <Alert variant="destructive" className="border-destructive/40">
                  <AlertTriangle />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                disabled={createMut.isPending || atCap}
                title={
                  atCap
                    ? `Batas ${MAX_ENABLED_SCHEDULES} jadwal aktif tercapai`
                    : undefined
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {createMut.isPending ? "Membuat…" : "Buat jadwal"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="viewer-schedule-readonly"
        >
          Peran viewer — tidak dapat membuat atau mengubah jadwal.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">Jadwal Anda</CardTitle>
        </CardHeader>
        <CardContent>
          {actionError && (
            <Alert
              variant="destructive"
              className="mb-3 border-destructive/40"
            >
              <AlertTriangle />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">Gagal memuat jadwal</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Belum ada jadwal. Buat scan domain/IP mingguan atau bulanan di
              atas.
            </p>
          )}
          {!isLoading && data && data.length > 0 && (
            <ul className="divide-y divide-border">
              {data.map((s: ScanSchedule) => {
                const runsOpen = !!expandedRuns[s.id];
                const mappedErr = mapScheduleError(s.last_error);
                const creditDisabled =
                  !s.enabled && isCreditError(s.last_error);

                return (
                  <li key={s.id} className="space-y-2 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-medium text-foreground">
                          {s.name || s.target}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {s.scan_type} ·{" "}
                            {s.cadence === "weekly" ? "mingguan" : "bulanan"}
                          </span>
                          {!s.enabled && (
                            <Badge
                              variant="default"
                              className="ml-2 text-[10px]"
                            >
                              nonaktif
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Berikutnya: {formatWhen(s.next_run_at)}
                          {s.last_job_id && (
                            <>
                              {" · "}
                              <Link
                                to={`/scan/${s.last_job_id}`}
                                className="text-primary hover:underline"
                              >
                                scan terakhir
                              </Link>
                            </>
                          )}
                        </p>
                        {s.notify_email && (
                          <p className="text-xs text-muted-foreground">
                            Notifikasi: {s.notify_email}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {s.last_job_id && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (s.last_job_id) {
                                void downloadFile(s.last_job_id, "executive");
                              }
                            }}
                            aria-label="Unduh laporan eksekutif"
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            Eksekutif
                          </Button>
                        )}
                        {canCreate && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={
                              toggleMut.isPending || (!s.enabled && atCap)
                            }
                            title={
                              !s.enabled && atCap
                                ? `Batas ${MAX_ENABLED_SCHEDULES} jadwal aktif tercapai`
                                : undefined
                            }
                            onClick={() =>
                              toggleMut.mutate({
                                id: s.id,
                                enabled: !s.enabled,
                              })
                            }
                          >
                            {s.enabled ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                        )}
                        {canCreate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deleteMut.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Hapus jadwal untuk ${s.target}?`,
                                )
                              ) {
                                deleteMut.mutate(s.id);
                              }
                            }}
                            aria-label="Hapus jadwal"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {mappedErr && (
                      <Alert
                        variant={creditDisabled ? "default" : "destructive"}
                        className={
                          creditDisabled
                            ? "border-amber-500/40 bg-amber-500/10 text-xs text-amber-200"
                            : "border-destructive/40 text-xs"
                        }
                      >
                        <AlertTriangle />
                        <AlertDescription>
                          <p>{mappedErr}</p>
                          {creditDisabled && (
                            <p className="mt-1">
                              <Link
                                to="/credit-history"
                                className="font-medium text-primary hover:underline"
                              >
                                Lihat riwayat kredit
                              </Link>{" "}
                              lalu aktifkan kembali setelah top-up.
                            </p>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}

                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => toggleRuns(s.id)}
                      aria-expanded={runsOpen}
                    >
                      {runsOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Riwayat scan
                    </button>
                    {runsOpen && <ScheduleRunsPanel scheduleId={s.id} />}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Schedules;
