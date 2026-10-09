import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Download,
  Gauge,
  Pause,
  Play,
  Printer,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { downloadFile, printFile } from "@/api/scans";
import {
  ScheduleShell,
  ScheduleShellHead,
  ScheduleIconChip,
} from "@/components/schedules/ScheduleShell";
import {
  listTone,
  quotaIndicatorClass,
  quotaRailClass,
  scheduleRailClass,
  scheduleTone,
  scheduleWashClass,
} from "@/components/schedules/scheduleChrome";
import { SiemRail } from "@/components/siem/siemChrome";
import { cn } from "@/lib/utils";
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
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import PageHeader from "@/components/layout/PageHeader";
import { useTranslation } from "react-i18next";

export { mapScheduleError };

function formatWhen(iso: string | null, locale: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "id-ID", {
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

function parseScanType(value: string | null): "domain" | "ip" {
  return value === "ip" ? "ip" : "domain";
}

function ScheduleRowActions({
  schedule: s,
  canCreate,
  atCap,
  togglePending,
  deletePending,
  onToggle,
  onDelete,
}: {
  schedule: ScanSchedule;
  canCreate: boolean;
  atCap: boolean;
  togglePending: boolean;
  deletePending: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("schedules");
  const rowActionClass =
    "min-h-11 w-full min-w-0 px-3 sm:h-8 sm:min-h-8 sm:w-8 sm:min-w-8 sm:shrink-0 sm:px-0";
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-nowrap sm:items-center sm:justify-end sm:gap-1">
      {s.last_job_id && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={rowActionClass}
            title={t("executive")}
            onClick={() => {
              if (s.last_job_id) {
                void downloadFile(s.last_job_id, "executive");
              }
            }}
            aria-label={t("execAria")}
          >
            <Download className="mr-1 h-4 w-4 shrink-0 sm:mr-0" />
            <span className="min-w-0 truncate sm:sr-only">{t("executive")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={rowActionClass}
            title={t("printExec")}
            onClick={() => {
              if (!s.last_job_id) return;
              void Promise.resolve(printFile(s.last_job_id, "executive")).catch(
                (err: unknown) => {
                  if (err instanceof Error && err.message === "popup_blocked") {
                    toast.error(t("printPopupBlocked"));
                  }
                },
              );
            }}
            aria-label={t("printExecAria")}
            data-testid="schedule-print-executive"
          >
            <Printer className="mr-1 h-4 w-4 shrink-0 sm:mr-0" />
            <span className="min-w-0 truncate sm:sr-only">{t("printExec")}</span>
          </Button>
        </>
      )}
      {canCreate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={rowActionClass}
          disabled={togglePending || (!s.enabled && atCap)}
          title={
            !s.enabled && atCap
              ? t("capReachedShort", { max: MAX_ENABLED_SCHEDULES })
              : s.enabled
                ? t("disable")
                : t("enable")
          }
          aria-label={s.enabled ? t("disable") : t("enable")}
          onClick={() => onToggle(s.id, !s.enabled)}
        >
          {s.enabled ? (
            <Pause className="mr-1 h-4 w-4 shrink-0 sm:mr-0" />
          ) : (
            <Play className="mr-1 h-4 w-4 shrink-0 sm:mr-0" />
          )}
          <span className="min-w-0 truncate sm:sr-only">
            {s.enabled ? t("disable") : t("enable")}
          </span>
        </Button>
      )}
      {canCreate && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={rowActionClass}
              disabled={deletePending}
              title={t("delete")}
              aria-label={t("deleteAria")}
            >
              <Trash2 className="h-4 w-4 shrink-0 text-destructive" />
              <span className="ml-1 truncate text-destructive sm:sr-only">
                {t("delete")}
              </span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteBody", { target: s.target })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                onClick={() => onDelete(s.id)}
              >
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

type ScheduleRunStatus = ScheduleRunJob["status"];

function RunStatusCell({ status }: { status: ScheduleRunStatus }) {
  return (
    <Badge
      variant={
        status === "completed"
          ? "completed"
          : status === "failed"
            ? "failed"
            : status === "running"
              ? "running"
              : "pending"
      }
      className="min-w-[5.5rem] justify-center whitespace-nowrap text-[10px] uppercase"
    >
      {status}
    </Badge>
  );
}

function RunTimeCell({ value, locale }: { value?: string; locale: string }) {
  return (
    <span className="min-w-0 truncate font-mono text-xs tabular-nums">
      {formatWhen(value ?? null, locale)}
    </span>
  );
}

function ScheduleRunsPanel({ scheduleId }: { scheduleId: string }) {
  const { t, i18n } = useTranslation("schedules");
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const { data, isLoading, error } = useQuery({
    queryKey: ["schedule-runs", activeOrgId, scheduleId],
    queryFn: () => listScheduleRuns(scheduleId, 10),
    enabled: !!activeOrgId && !!scheduleId,
  });

  if (isLoading) {
    return (
      <div className="mt-2 pl-1">
        <TableRowSkeleton rows={2} />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mt-2 border-destructive/40 text-xs">
        <AlertTriangle />
        <AlertDescription>{t("runsLoadFailed")}</AlertDescription>
      </Alert>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        {t("noRuns")}
      </p>
    );
  }

  return (
    <ul className="mt-2 space-y-1 border-l border-border pl-3">
      {data.map((job: ScheduleRunJob) => (
        <li
          key={job.id}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 text-xs text-muted-foreground"
        >
          <RunStatusCell status={job.status} />
          <RunTimeCell value={job.created_at} locale={i18n.language} />
          <Link
            to={`/scan/${job.id}`}
            className="justify-self-end whitespace-nowrap text-primary hover:underline"
          >
            {t("openScan")}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Schedules() {
  const { t, i18n } = useTranslation("schedules");
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
      toast.success(t("toastCreated"));
    },
    onError: (err: unknown) => {
      setFormError(mapScheduleError(apiDetail(err, t("errCreate"))));
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateSchedule(id, { enabled }),
    onSuccess: () => {
      setActionError(null);
      toast.success(t("toastToggled"));
      void qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err: unknown) => {
      setActionError(
        mapScheduleError(apiDetail(err, t("errToggle"))),
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      setActionError(null);
      toast.success(t("toastDeleted"));
      void qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (err: unknown) => {
      setActionError(
        mapScheduleError(apiDetail(err, t("errDelete"))),
      );
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (atCap) {
      setFormError(
        t("capCreateBlocked", { max: MAX_ENABLED_SCHEDULES }),
      );
      return;
    }
    if (!target.trim()) {
      setFormError(t("targetRequired"));
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
    <div className="w-full space-y-6">
      <PageHeader title={t("title")} />

      <ScheduleShell
        railClass={quotaRailClass(enabledCount, MAX_ENABLED_SCHEDULES)}
        testid="schedule-quota"
      >
        <ScheduleShellHead>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Gauge
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <h3 className="text-sm font-medium tracking-wide">
                {t("quota")}
              </h3>
            </div>
            <span className="font-mono text-lg font-bold tabular-nums text-foreground sm:text-2xl">
              {enabledCount}/{MAX_ENABLED_SCHEDULES}
            </span>
          </div>
        </ScheduleShellHead>
        <div className="space-y-3 px-4 py-3">
          <Progress
            value={capPercent}
            className="h-1.5"
            indicatorClassName={quotaIndicatorClass(
              enabledCount,
              MAX_ENABLED_SCHEDULES,
            )}
          />
          {atCap && (
            <Alert className="border-amber-500/40 text-amber-400" role="status">
              <AlertTriangle />
              <AlertDescription>
                {t("capReached", { max: MAX_ENABLED_SCHEDULES })}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </ScheduleShell>

      {canCreate ? (
        <ScheduleShell railClass="bg-primary" testid="schedule-create-card">
          <ScheduleShellHead>
            <div className="flex items-start gap-3">
              <ScheduleIconChip icon={Plus} />
              <div className="min-w-0">
                <h3 className="text-sm font-medium tracking-wide">
                  {t("newTitle")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("newHint")}
                </p>
              </div>
            </div>
          </ScheduleShellHead>
          <div className="px-4 py-4">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sched-name">{t("labelOptional")}</Label>
                  <Input
                    id="sched-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("labelPlaceholder")}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sched-type">{t("type")}</Label>
                  <Select
                    value={scanType}
                    onValueChange={(v) => setScanType(v as "domain" | "ip")}
                  >
                    <SelectTrigger
                      id="sched-type"
                      aria-label={t("type")}
                      className="h-10 min-h-10"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domain">{t("domain")}</SelectItem>
                      <SelectItem value="ip">{t("ip")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sched-target">{t("target")}</Label>
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
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sched-cadence">{t("frequency")}</Label>
                  <Select
                    value={cadence}
                    onValueChange={(v) => setCadence(v as "weekly" | "monthly")}
                  >
                    <SelectTrigger
                      id="sched-cadence"
                      aria-label={t("frequency")}
                      className="h-10 min-h-10"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">{t("weekly")}</SelectItem>
                      <SelectItem value="monthly">{t("monthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="sched-notify">
                    {t("notifyOptional")}
                  </Label>
                  <Input
                    id="sched-notify"
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder={t("notifyPlaceholder")}
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
                    ? t("capReachedShort", { max: MAX_ENABLED_SCHEDULES })
                    : undefined
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {createMut.isPending ? t("creating") : t("create")}
              </Button>
            </form>
          </div>
        </ScheduleShell>
      ) : (
        <p
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="viewer-schedule-readonly"
        >
          {t("viewerReadonly")}
        </p>
      )}

      <ScheduleShell
        railClass={scheduleRailClass(listTone(data ?? []))}
        wash={scheduleWashClass(listTone(data ?? []))}
        testid="schedule-list"
      >
        <ScheduleShellHead>
          <h3 className="text-sm font-medium tracking-wide">{t("yours")}</h3>
        </ScheduleShellHead>
        <div className="px-4 py-3">
          {actionError && (
            <Alert
              variant="destructive"
              className="mb-3 border-destructive/40"
            >
              <AlertTriangle />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
          {isLoading && <TableRowSkeleton rows={4} columns={3} />}
          {error && (
            <p className="text-sm text-destructive">{t("loadFailed")}</p>
          )}
          {!isLoading && data && data.length === 0 && (
            <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center">
              <CalendarClock className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          )}
          {!isLoading && data && data.length > 0 && (
            <>
              <ul className="space-y-3 sm:hidden" data-testid="schedules-mobile-list">
                {data.map((s: ScanSchedule) => {
                  const runsOpen = !!expandedRuns[s.id];
                  const mappedErr = mapScheduleError(s.last_error);
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "relative overflow-hidden rounded-lg border border-border bg-card p-3 pl-4",
                        scheduleWashClass(scheduleTone(s)),
                      )}
                    >
                      <SiemRail
                        className={scheduleRailClass(scheduleTone(s))}
                      />
                      <p className="break-words text-sm font-medium text-foreground">
                        {s.name || s.target}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {s.scan_type} ·{" "}
                          {s.cadence === "weekly"
                            ? t("weekly").toLowerCase()
                            : t("monthly").toLowerCase()}
                        </span>
                        <Badge
                          variant={s.enabled ? "success" : "default"}
                          className="ml-2 text-[10px]"
                        >
                          {s.enabled ? t("statusActive") : t("disabled")}
                        </Badge>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("nextPrefix", {
                          when: formatWhen(s.next_run_at, i18n.language),
                        })}
                      </p>
                      {s.last_job_id && (
                        <Link
                          to={`/scan/${s.last_job_id}`}
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          {t("lastScan")}
                        </Link>
                      )}
                      {s.notify_email && (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {t("notify", { email: s.notify_email })}
                        </p>
                      )}
                      <div className="mt-3">
                        <ScheduleRowActions
                          schedule={s}
                          canCreate={canCreate}
                          atCap={atCap}
                          togglePending={toggleMut.isPending}
                          deletePending={deleteMut.isPending}
                          onToggle={(id, enabled) =>
                            toggleMut.mutate({ id, enabled })
                          }
                          onDelete={(id) => deleteMut.mutate(id)}
                        />
                      </div>
                      {mappedErr && (
                        <Alert
                          variant="destructive"
                          className="mt-3 border-destructive/40 text-xs"
                        >
                          <AlertTriangle />
                          <AlertDescription>{mappedErr}</AlertDescription>
                        </Alert>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-auto min-h-11 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={() => toggleRuns(s.id)}
                        aria-expanded={runsOpen}
                      >
                        {runsOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        {t("runHistory")}
                      </Button>
                      {runsOpen && <ScheduleRunsPanel scheduleId={s.id} />}
                    </li>
                  );
                })}
              </ul>
              <div className="hidden sm:block">
                <Table className="w-full text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("colSchedule")}
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider">
                        {t("colNext")}
                      </TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap text-right text-[10px] uppercase tracking-wider">
                        {t("colActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((s: ScanSchedule) => {
                      const runsOpen = !!expandedRuns[s.id];
                      const mappedErr = mapScheduleError(s.last_error);
                      return (
                        <Fragment key={s.id}>
                          <TableRow className={scheduleWashClass(scheduleTone(s))}>
                            <TableCell className="relative align-top pl-4">
                              <SiemRail
                                className={scheduleRailClass(scheduleTone(s))}
                              />
                              <div className="min-w-0 space-y-0.5">
                                <p className="break-words text-sm font-medium text-foreground">
                                  {s.name || s.target}
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    {s.scan_type} ·{" "}
                                    {s.cadence === "weekly"
                                      ? t("weekly").toLowerCase()
                                      : t("monthly").toLowerCase()}
                                  </span>
                                  <Badge
                                    variant={s.enabled ? "success" : "default"}
                                    className="ml-2 text-[10px]"
                                  >
                                    {s.enabled ? t("statusActive") : t("disabled")}
                                  </Badge>
                                </p>
                                {s.notify_email && (
                                  <p className="break-all text-xs text-muted-foreground">
                                    {t("notify", { email: s.notify_email })}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-xs text-muted-foreground">
                              {formatWhen(s.next_run_at, i18n.language)}
                              {s.last_job_id && (
                                <>
                                  {" · "}
                                  <Link
                                    to={`/scan/${s.last_job_id}`}
                                    className="text-primary hover:underline"
                                  >
                                    {t("lastScan")}
                                  </Link>
                                </>
                              )}
                            </TableCell>
                            <TableCell className="w-[1%] whitespace-nowrap align-top">
                              <ScheduleRowActions
                                schedule={s}
                                canCreate={canCreate}
                                atCap={atCap}
                                togglePending={toggleMut.isPending}
                                deletePending={deleteMut.isPending}
                                onToggle={(id, enabled) =>
                                  toggleMut.mutate({ id, enabled })
                                }
                                onDelete={(id) => deleteMut.mutate(id)}
                              />
                            </TableCell>
                          </TableRow>
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={3} className="space-y-2 pt-0">
                              {mappedErr && (
                                <Alert
                                  variant="destructive"
                                  className="border-destructive/40 text-xs"
                                >
                                  <AlertTriangle />
                                  <AlertDescription>{mappedErr}</AlertDescription>
                                </Alert>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                                onClick={() => toggleRuns(s.id)}
                                aria-expanded={runsOpen}
                              >
                                {runsOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                {t("runHistory")}
                              </Button>
                              {runsOpen && (
                                <ScheduleRunsPanel scheduleId={s.id} />
                              )}
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </ScheduleShell>
    </div>
  );
}

export default Schedules;
