import { Fragment, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/Skeleton";
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
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
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

function isCreditError(raw: string | null | undefined): boolean {
  return !!raw && raw.toLowerCase().includes("insufficient credits");
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
  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
      {s.last_job_id && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 sm:min-h-8 sm:flex-none"
          onClick={() => {
            if (s.last_job_id) {
              void downloadFile(s.last_job_id, "executive");
            }
          }}
          aria-label={t("execAria")}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          {t("executive")}
        </Button>
      )}
      {canCreate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 sm:min-h-8 sm:flex-none"
          disabled={togglePending || (!s.enabled && atCap)}
          title={
            !s.enabled && atCap
              ? t("capReachedShort", { max: MAX_ENABLED_SCHEDULES })
              : undefined
          }
          onClick={() => onToggle(s.id, !s.enabled)}
        >
          {s.enabled ? t("disable") : t("enable")}
        </Button>
      )}
      {canCreate && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 sm:min-h-8"
              disabled={deletePending}
              aria-label={t("deleteAria")}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
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
          <span>{formatWhen(job.created_at ?? null, i18n.language)}</span>
          <Link to={`/scan/${job.id}`} className="text-primary hover:underline">
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
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <CalendarClock className="h-6 w-6 text-primary" />
        <h2 className="text-lg font-bold tracking-wide text-foreground">
          {t("title")}
        </h2>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm tracking-wide">
              {t("quota")}
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
                {t("capReached", { max: MAX_ENABLED_SCHEDULES })}
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
      </Card>

      {canCreate ? (
        <Card data-testid="schedule-create-card">
          <CardHeader>
            <CardTitle className="text-sm tracking-wide">{t("newTitle")}</CardTitle>
            <CardDescription className="text-xs">
              {t("newHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sched-name">{t("labelOptional")}</Label>
                  <Input
                    id="sched-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("labelPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("type")}</Label>
                  <Select
                    value={scanType}
                    onValueChange={(v) => setScanType(v as "domain" | "ip")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domain">{t("domain")}</SelectItem>
                      <SelectItem value="ip">{t("ip")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label>{t("frequency")}</Label>
                  <Select
                    value={cadence}
                    onValueChange={(v) => setCadence(v as "weekly" | "monthly")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">{t("weekly")}</SelectItem>
                      <SelectItem value="monthly">{t("monthly")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
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
          </CardContent>
        </Card>
      ) : (
        <p
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          data-testid="viewer-schedule-readonly"
        >
          {t("viewerReadonly")}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">{t("yours")}</CardTitle>
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
                  const creditDisabled =
                    !s.enabled && isCreditError(s.last_error);
                  return (
                    <li
                      key={s.id}
                      className="rounded-lg border border-border p-3"
                    >
                      <p className="break-words text-sm font-medium text-foreground">
                        {s.name || s.target}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {s.scan_type} ·{" "}
                          {s.cadence === "weekly"
                            ? t("weekly").toLowerCase()
                            : t("monthly").toLowerCase()}
                        </span>
                        {!s.enabled && (
                          <Badge variant="default" className="ml-2 text-[10px]">
                            {t("disabled")}
                          </Badge>
                        )}
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
                          variant={creditDisabled ? "default" : "destructive"}
                          className={
                            creditDisabled
                              ? "mt-3 border-amber-500/40 bg-amber-500/10 text-xs text-amber-200"
                              : "mt-3 border-destructive/40 text-xs"
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
                                  {t("creditHistory")}
                                </Link>{" "}
                                {t("creditReenable")}
                              </p>
                            )}
                          </AlertDescription>
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
                <Table className="w-full table-fixed text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[40%] text-[10px] uppercase tracking-wider">
                        {t("colSchedule")}
                      </TableHead>
                      <TableHead className="w-[32%] text-[10px] uppercase tracking-wider">
                        {t("colNext")}
                      </TableHead>
                      <TableHead className="w-[28%] text-right text-[10px] uppercase tracking-wider">
                        {t("colActions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((s: ScanSchedule) => {
                      const runsOpen = !!expandedRuns[s.id];
                      const mappedErr = mapScheduleError(s.last_error);
                      const creditDisabled =
                        !s.enabled && isCreditError(s.last_error);
                      return (
                        <Fragment key={s.id}>
                          <TableRow>
                            <TableCell className="align-top">
                              <div className="min-w-0 space-y-0.5">
                                <p className="break-words text-sm font-medium text-foreground">
                                  {s.name || s.target}
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    {s.scan_type} ·{" "}
                                    {s.cadence === "weekly"
                                      ? t("weekly").toLowerCase()
                                      : t("monthly").toLowerCase()}
                                  </span>
                                  {!s.enabled && (
                                    <Badge
                                      variant="default"
                                      className="ml-2 text-[10px]"
                                    >
                                      {t("disabled")}
                                    </Badge>
                                  )}
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
                            <TableCell className="align-top">
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
                                  variant={
                                    creditDisabled ? "default" : "destructive"
                                  }
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
                                          {t("creditHistory")}
                                        </Link>{" "}
                                        {t("creditReenable")}
                                      </p>
                                    )}
                                  </AlertDescription>
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
        </CardContent>
      </Card>
    </div>
  );
}

export default Schedules;
