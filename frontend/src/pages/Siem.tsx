import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Search, Siren, AlertTriangle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { listGuardAgents } from "@/api/guard";
import {
  addSiemCaseNote,
  canCreateSiemCase,
  canManageSiemCase,
  createSiemCase,
  getSiemStatus,
  isSiemDisabledError,
  listSiemCases,
  listSiemEvents,
  patchSiemCase,
  type SiemCase,
} from "@/api/siem";
import { useAuthStore } from "@/store/authStore";
import type { ApiError } from "@/lib/utils";
import { useTranslation } from "react-i18next";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const AUTH_SESSION_DETAILS = new Set([
  "Invalid or expired token",
  "Missing Authorization header",
  "Invalid Authorization header format. Expected: Bearer <token>",
  "Invalid token type: access token required",
]);

function isAuthSessionError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("response" in err)) return false;
  const res = (err as ApiError).response;
  if (res?.status === 401) return true;
  const detail = res?.data?.detail;
  return typeof detail === "string" && AUTH_SESSION_DETAILS.has(detail);
}

function apiDetail(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as ApiError).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function statusBadge(status: string, t: (k: string) => string) {
  if (status === "open")
    return <Badge className="bg-sky-500/15 text-sky-700">{t("statusOpen")}</Badge>;
  if (status === "ack")
    return <Badge className="bg-amber-500/15 text-amber-700">{t("statusAck")}</Badge>;
  if (status === "closed")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600">{t("statusClosed")}</Badge>
    );
  return <Badge variant="info">{status}</Badge>;
}

function caseStatusLabel(
  status: "open" | "ack" | "closed",
  t: (k: string) => string,
): string {
  if (status === "open") return t("statusOpenBtn");
  if (status === "ack") return t("statusAckBtn");
  return t("statusClosedBtn");
}

function severityForLevel(
  level: number,
  t: (k: string) => string,
): {
  label: string;
  className: string;
} {
  if (level >= 12)
    return {
      label: t("sevCritical"),
      className: "bg-red-600 text-white",
    };
  if (level >= 7)
    return {
      label: t("sevHigh"),
      className: "bg-amber-600 text-white",
    };
  if (level >= 4)
    return {
      label: t("sevMedium"),
      className: "bg-sky-600 text-white",
    };
  return {
    label: t("sevLow"),
    className: "border border-border bg-muted text-foreground",
  };
}

function LevelChip({
  level,
  t,
}: {
  level: number;
  t: (k: string) => string;
}) {
  const sev = severityForLevel(level, t);
  return (
    <Badge className={sev.className}>
      L{level} · {sev.label}
    </Badge>
  );
}

export default function Siem() {
  const { t } = useTranslation("siem");
  const queryClient = useQueryClient();
  const activeRole = useAuthStore((s) => s.activeRole);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const role = activeRole();
  const canCreate = canCreateSiemCase(role);
  const canManage = canManageSiemCase(role);

  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [minLevel, setMinLevel] = useState("7");
  const [agentId, setAgentId] = useState("");
  const [q, setQ] = useState("");
  const [eventPage, setEventPage] = useState(0);
  const [applied, setApplied] = useState({
    since: "",
    until: "",
    min_level: "",
    agent_id: "",
    q: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caseTitle, setCaseTitle] = useState("");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const statusQ = useQuery({
    queryKey: ["siem", activeOrgId, "status"],
    queryFn: getSiemStatus,
    enabled: !!activeOrgId,
    retry: false,
  });

  const featureOff = statusQ.isError && isSiemDisabledError(statusQ.error);
  const featureOn = !!statusQ.data?.enabled && !featureOff;

  const agentsQ = useQuery({
    queryKey: ["guard", activeOrgId, "agents"],
    queryFn: listGuardAgents,
    enabled: !!activeOrgId && featureOn,
  });

  const eventFilters = useMemo(() => {
    const filters: {
      since?: string;
      until?: string;
      min_level?: number;
      agent_id?: string;
      q?: string;
      limit: number;
    } = { limit: 50 };
    if (applied.since) filters.since = new Date(applied.since).toISOString();
    if (applied.until) filters.until = new Date(applied.until).toISOString();
    if (applied.min_level) filters.min_level = Number(applied.min_level);
    if (applied.agent_id) filters.agent_id = applied.agent_id;
    if (applied.q) filters.q = applied.q;
    return filters;
  }, [applied]);

  const eventsQ = useQuery({
    queryKey: ["siem", activeOrgId, "events", eventFilters],
    queryFn: () => listSiemEvents(eventFilters),
    enabled: !!activeOrgId && featureOn,
  });

  const casesQ = useQuery({
    queryKey: ["siem", activeOrgId, "cases"],
    queryFn: listSiemCases,
    enabled: !!activeOrgId && featureOn,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["siem"] });
  };

  const createMut = useMutation({
    mutationFn: createSiemCase,
    onSuccess: (c) => {
      setActionError(null);
      setCaseTitle("");
      setActiveCaseId(c.id);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("createCaseFail"))),
  });

  const patchMut = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "open" | "ack" | "closed";
    }) => patchSiemCase(id, { status }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("patchCaseFail"))),
  });

  const noteMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      addSiemCaseNote(id, body),
    onSuccess: () => {
      setNoteBody("");
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("addNoteFail"))),
  });

  const agents = agentsQ.data ?? [];
  const allEvents = eventsQ.data?.items ?? [];
  const pageSize = 25;
  const eventPageCount = Math.max(1, Math.ceil(allEvents.length / pageSize));
  const safeEventPage = Math.min(eventPage, eventPageCount - 1);
  const events = allEvents.slice(
    safeEventPage * pageSize,
    safeEventPage * pageSize + pageSize,
  );

  const selected =
    events.find((e) => e.external_id === selectedId) ?? events[0] ?? null;

  const cases = casesQ.data?.items ?? [];
  const activeCase: SiemCase | undefined = cases.find(
    (c) => c.id === activeCaseId,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Siren className="h-6 w-6 text-primary" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {actionError && (
        <Alert variant="destructive" className="border-destructive/40">
          <AlertTriangle />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {!activeOrgId && (
        <p className="text-sm text-muted-foreground">{t("pickOrg")}</p>
      )}

      {statusQ.isLoading && (
        <Card>
          <CardContent className="flex min-h-[8rem] items-center px-6 py-8">
            <TableRowSkeleton rows={2} className="w-full" />
          </CardContent>
        </Card>
      )}

      {featureOff && (
        <Card data-testid="siem-feature-off">
          <CardContent className="flex min-h-[8rem] items-center justify-center px-6 py-8 text-center text-sm text-muted-foreground">
            {t("featureOff")}
          </CardContent>
        </Card>
      )}

      {statusQ.isError && !featureOff && (
        <p className="text-sm text-destructive" data-testid="siem-status-error">
          {isAuthSessionError(statusQ.error)
            ? t("sessionExpired")
            : apiDetail(statusQ.error, t("loadStatusFail"))}
        </p>
      )}

      {featureOn && (
        <>
          {statusQ.data?.degraded && (
            <Alert className="border-amber-500/40 text-amber-800">
              <AlertTriangle />
              <AlertDescription>
                {t("indexerDegraded")}
                {statusQ.data.last_error ? `: ${statusQ.data.last_error}` : ""}.
              </AlertDescription>
            </Alert>
          )}

          {agents.length === 0 && !agentsQ.isLoading && (
            <Card data-testid="siem-no-agents">
              <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                <Siren className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("noAgents")}</p>
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="search" className="w-full">
            <TabsList>
              <TabsTrigger value="search">{t("tabSearch")}</TabsTrigger>
              <TabsTrigger value="cases">{t("tabCases")}</TabsTrigger>
            </TabsList>
            <TabsContent value="search" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)] xl:items-start">
          <Card data-testid="siem-search">
            <CardHeader>
              <CardTitle>{t("tabSearch")}</CardTitle>
              <CardDescription>
                {t("searchHint", {
                  minLevel: statusQ.data?.search_min_level ?? 7,
                  hours: statusQ.data?.max_lookback_hours ?? 168,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                data-testid="siem-search-filters"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="siem-since">{t("sinceLabel")}</Label>
                  <DateTimePicker
                    id="siem-since"
                    value={since}
                    onChange={setSince}
                    placeholder={t("datetimePlaceholder")}
                    aria-label={t("since")}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="siem-until">{t("untilLabel")}</Label>
                  <DateTimePicker
                    id="siem-until"
                    value={until}
                    onChange={setUntil}
                    placeholder={t("datetimePlaceholder")}
                    aria-label={t("until")}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="siem-level">{t("minLevel")}</Label>
                  <Input
                    id="siem-level"
                    type="number"
                    min={0}
                    max={15}
                    placeholder={String(statusQ.data?.search_min_level ?? 7)}
                    value={minLevel}
                    onChange={(e) => setMinLevel(e.target.value)}
                    className="h-10 min-h-10"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="siem-agent">{t("agent")}</Label>
                  <Select
                    value={agentId || "__all__"}
                    onValueChange={(value) =>
                      setAgentId(value === "__all__" ? "" : value)
                    }
                  >
                    <SelectTrigger
                      id="siem-agent"
                      aria-label={t("agent")}
                      className="h-10 min-h-10"
                    >
                      <SelectValue placeholder={t("allAgents")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("allAgents")}</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.wazuh_agent_id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="siem-q">{t("query")}</Label>
                  <Input
                    id="siem-q"
                    value={q}
                    maxLength={128}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("queryPlaceholder")}
                    className="h-10 min-h-10"
                  />
                </div>
                <div className="flex min-w-0 flex-col justify-end gap-1.5">
                  <Button
                    className="h-10 min-h-10 w-full"
                    onClick={() => {
                      setEventPage(0);
                      setApplied({
                        since,
                        until,
                        min_level: minLevel,
                        agent_id: agentId,
                        q,
                      });
                    }}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {t("apply")}
                  </Button>
                </div>
              </div>

              {eventsQ.data?.degraded && (
                <p className="text-sm text-amber-700">
                  {t("partialResults")}
                  {eventsQ.data.last_error
                    ? `: ${eventsQ.data.last_error}`
                    : ""}
                </p>
              )}

              {eventsQ.isLoading ? (
                <TableRowSkeleton rows={6} />
              ) : (
                <>
                <div className="space-y-2 md:hidden">
                  {events.length === 0 ? (
                    <p
                      data-testid="siem-events-empty"
                      className="py-10 text-center text-muted-foreground"
                    >
                      {t("eventsEmpty")}
                    </p>
                  ) : (
                    events.map((ev) => (
                      <button
                        key={ev.external_id}
                        type="button"
                        data-testid="siem-event-row"
                        className="w-full rounded-lg border border-border bg-card p-3 text-left min-h-11"
                        onClick={() => setSelectedId(ev.external_id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <LevelChip level={ev.rule_level} t={t} />
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatWhen(ev.occurred_at)}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-sm text-foreground">
                          {ev.rule_description}
                          {ev.rule_id ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              #{ev.rule_id}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          {ev.agent_name ?? ev.agent_wazuh_id ?? "—"}
                        </p>
                      </button>
                    ))
                  )}
                </div>
                <div className="hidden md:block">
                <Table className="table-fixed">
                  <TableHeader className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="w-[12rem]">{t("colTime")}</TableHead>
                      <TableHead className="w-[8rem]">{t("colLevel")}</TableHead>
                      <TableHead>{t("colRule")}</TableHead>
                      <TableHead className="w-[10rem]">{t("colAgent")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.length === 0 && (
                      <TableRow data-testid="siem-events-empty">
                        <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                          {t("eventsEmpty")}
                        </TableCell>
                      </TableRow>
                    )}
                    {events.map((ev) => (
                      <TableRow
                        key={ev.external_id}
                        data-testid="siem-event-row"
                        className="cursor-pointer"
                        onClick={() => setSelectedId(ev.external_id)}
                      >
                        <TableCell className="whitespace-nowrap">
                          {formatWhen(ev.occurred_at)}
                        </TableCell>
                        <TableCell>
                          <LevelChip level={ev.rule_level} t={t} />
                        </TableCell>
                        <TableCell
                          className="truncate"
                          title={
                            ev.rule_id
                              ? `${ev.rule_description} · ${ev.rule_id}`
                              : ev.rule_description
                          }
                        >
                          {ev.rule_description}
                          {ev.rule_id ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              #{ev.rule_id}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell
                          className="truncate font-mono text-xs"
                          title={ev.agent_name ?? ev.agent_wazuh_id ?? undefined}
                        >
                          {ev.agent_name ?? ev.agent_wazuh_id ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
                {allEvents.length > pageSize && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {t("eventPager", {
                        count: allEvents.length,
                        page: safeEventPage + 1,
                        pages: eventPageCount,
                      })}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={safeEventPage === 0}
                        onClick={() => setEventPage((p) => Math.max(0, p - 1))}
                      >
                        {t("prev")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={safeEventPage >= eventPageCount - 1}
                        onClick={() =>
                          setEventPage((p) =>
                            Math.min(eventPageCount - 1, p + 1),
                          )
                        }
                      >
                        {t("next")}
                      </Button>
                    </div>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>

          {selected ? (
            <Card data-testid="siem-event-detail" className="xl:sticky xl:top-4">
              <CardHeader>
                <CardTitle>{t("eventDetail")}</CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-xs">
                    {selected.external_id}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    data-testid="siem-copy-id"
                    onClick={() => {
                      void navigator.clipboard.writeText(selected.external_id);
                    }}
                    aria-label={t("copyId")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">{t("detailLevel")}</span>{" "}
                  {selected.rule_level}
                </p>
                <p>
                  <span className="text-muted-foreground">{t("detailRule")}</span>{" "}
                  {selected.rule_description}
                </p>
                <p>
                  <span className="text-muted-foreground">{t("detailAgent")}</span>{" "}
                  {selected.agent_name ?? selected.agent_wazuh_id ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">{t("detailTime")}</span>{" "}
                  {formatWhen(selected.occurred_at)}
                </p>
                {canCreate && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <Label htmlFor="siem-case-title">{t("caseTitle")}</Label>
                      <Input
                        id="siem-case-title"
                        value={caseTitle}
                        onChange={(e) => setCaseTitle(e.target.value)}
                      />
                    </div>
                    <Button
                      disabled={!caseTitle.trim() || createMut.isPending}
                      onClick={() =>
                        createMut.mutate({
                          title: caseTitle.trim(),
                          external_id: selected.external_id,
                        })
                      }
                    >
                      {t("createCase")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="hidden xl:block" data-testid="siem-event-detail-empty">
              <CardHeader>
                <CardTitle>{t("eventDetail")}</CardTitle>
                <CardDescription>{t("eventsEmpty")}</CardDescription>
              </CardHeader>
            </Card>
          )}
          </div>

            </TabsContent>
            <TabsContent value="cases">
          <Card>
            <CardHeader>
              <CardTitle>{t("tabCases")}</CardTitle>
              <CardDescription>
                {t("casesHint")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {casesQ.isLoading ? (
                <TableRowSkeleton rows={4} />
              ) : cases.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("casesEmpty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {cases.map((c) => (
                    <li key={c.id}>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto w-full justify-between px-3 py-2 text-left text-sm font-normal"
                        onClick={() => setActiveCaseId(c.id)}
                      >
                        <span>{c.title}</span>
                        {statusBadge(c.status, t)}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {activeCase && (
                <Card data-testid="siem-case-detail">
                  <CardHeader className="pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{activeCase.title}</CardTitle>
                      {statusBadge(activeCase.status, t)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                       {(["open", "ack", "closed"] as const).map((st) => (
                         <Button
                           key={st}
                           size="sm"
                           variant="outline"
                           disabled={patchMut.isPending}
                           onClick={() =>
                             patchMut.mutate({ id: activeCase.id, status: st })
                           }
                         >
                            {caseStatusLabel(st, t)}
                         </Button>
                       ))}
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">{t("events")}</p>
                    <ul className="space-y-1 text-sm">
                      {activeCase.events.map((ev) => (
                        <li key={ev.id}>
                          {formatWhen(ev.occurred_at)} · L{ev.rule_level} ·{" "}
                          {ev.rule_description}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">{t("notes")}</p>
                    <ul className="space-y-1 text-sm">
                      {activeCase.notes.map((n) => (
                        <li key={n.id}>{n.body}</li>
                      ))}
                    </ul>
                  </div>
                  {canCreate && (
                    <div className="space-y-2">
                      <Label htmlFor="siem-note">{t("newNote")}</Label>
                      <Textarea
                        id="siem-note"
                        value={noteBody}
                        maxLength={8000}
                        onChange={(e) => setNoteBody(e.target.value)}
                      />
                      <Button
                        disabled={!noteBody.trim() || noteMut.isPending}
                        onClick={() =>
                          noteMut.mutate({
                            id: activeCase.id,
                            body: noteBody.trim(),
                          })
                        }
                      >
                        {t("addNote")}
                      </Button>
                    </div>
                  )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
