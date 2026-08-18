import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Siren, AlertTriangle } from "lucide-react";
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
import { Textarea } from "@/components/ui/Textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  type SiemEvent,
} from "@/api/siem";
import { useAuthStore } from "@/store/authStore";
import type { ApiError } from "@/lib/utils";

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

function apiDetail(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const detail = (err as ApiError).response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return fallback;
}

function statusBadge(status: string) {
  if (status === "open")
    return <Badge className="bg-sky-500/15 text-sky-700">terbuka</Badge>;
  if (status === "ack")
    return <Badge className="bg-amber-500/15 text-amber-700">diakui</Badge>;
  if (status === "closed")
    return <Badge className="bg-emerald-500/15 text-emerald-600">ditutup</Badge>;
  return <Badge variant="info">{status}</Badge>;
}

function caseStatusLabel(status: "open" | "ack" | "closed"): string {
  if (status === "open") return "Terbuka";
  if (status === "ack") return "Diakui";
  return "Ditutup";
}

function severityForLevel(level: number): {
  label: string;
  className: string;
} {
  if (level >= 12)
    return {
      label: "Kritis",
      className: "bg-red-600 text-white",
    };
  if (level >= 7)
    return {
      label: "Tinggi",
      className: "bg-amber-600 text-white",
    };
  if (level >= 4)
    return {
      label: "Sedang",
      className: "bg-sky-600 text-white",
    };
  return {
    label: "Rendah",
    className: "border border-border bg-muted text-foreground",
  };
}

function LevelChip({ level }: { level: number }) {
  const sev = severityForLevel(level);
  return (
    <Badge className={sev.className}>
      L{level} · {sev.label}
    </Badge>
  );
}

export default function Siem() {
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
  const [selected, setSelected] = useState<SiemEvent | null>(null);
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
    onError: (e) => setActionError(apiDetail(e, "Gagal membuat kasus")),
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
    onError: (e) => setActionError(apiDetail(e, "Gagal mengubah kasus")),
  });

  const noteMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      addSiemCaseNote(id, body),
    onSuccess: () => {
      setNoteBody("");
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, "Gagal menambah catatan")),
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
  const cases = casesQ.data?.items ?? [];
  const activeCase: SiemCase | undefined = cases.find(
    (c) => c.id === activeCaseId,
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Siren className="h-6 w-6 text-primary" />
          SIEM
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pencarian event terkontrol + kasus. Bukan dashboard Wazuh.
        </p>
      </div>

      {actionError && (
        <Alert variant="destructive" className="border-destructive/40">
          <AlertTriangle />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {!activeOrgId && (
        <p className="text-sm text-muted-foreground">Pilih organisasi dulu.</p>
      )}

      {statusQ.isLoading && <Skeleton className="h-24 w-full" />}

      {featureOff && (
        <Card data-testid="siem-feature-off">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Modul SIEM belum diaktifkan di lingkungan ini.
          </CardContent>
        </Card>
      )}

      {statusQ.isError && !featureOff && (
        <p className="text-sm text-destructive">
          {apiDetail(statusQ.error, "Gagal memuat status SIEM")}
        </p>
      )}

      {featureOn && (
        <>
          {statusQ.data?.degraded && (
            <Alert className="border-amber-500/40 text-amber-800">
              <AlertTriangle />
              <AlertDescription>
                Indexer terdegradasi
                {statusQ.data.last_error ? `: ${statusQ.data.last_error}` : ""}.
              </AlertDescription>
            </Alert>
          )}

          {agents.length === 0 && !agentsQ.isLoading && (
            <Card data-testid="siem-no-agents">
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Pasang agen di Guard dulu.
              </CardContent>
            </Card>
          )}

          <Card data-testid="siem-search">
            <CardHeader>
              <CardTitle>Cari event</CardTitle>
              <CardDescription>
                Filter terstruktur saja. Min level default{" "}
                {statusQ.data?.search_min_level ?? 7}. Rentang waktu maks{" "}
                {statusQ.data?.max_lookback_hours ?? 168} jam (WIB).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-12 items-end gap-3">
                <div className="col-span-12 sm:col-span-6 xl:col-span-2">
                  <Label htmlFor="siem-since">Sejak (dd/mm/yyyy)</Label>
                  <Input
                    id="siem-since"
                    type="datetime-local"
                    lang="id-ID"
                    value={since}
                    onChange={(e) => setSince(e.target.value)}
                  />
                </div>
                <div className="col-span-12 sm:col-span-6 xl:col-span-2">
                  <Label htmlFor="siem-until">Sampai (dd/mm/yyyy)</Label>
                  <Input
                    id="siem-until"
                    type="datetime-local"
                    lang="id-ID"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </div>
                <div className="col-span-6 sm:col-span-4 xl:col-span-1">
                  <Label htmlFor="siem-level">Min level</Label>
                  <Input
                    id="siem-level"
                    type="number"
                    min={0}
                    max={15}
                    placeholder={String(statusQ.data?.search_min_level ?? 7)}
                    value={minLevel}
                    onChange={(e) => setMinLevel(e.target.value)}
                  />
                </div>
                <div className="col-span-6 sm:col-span-4 xl:col-span-2">
                  <Label htmlFor="siem-agent">Agen</Label>
                  <select
                    id="siem-agent"
                    className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                  >
                    <option value="">Semua agen org</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.wazuh_agent_id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-12 sm:col-span-8 xl:col-span-3">
                  <Label htmlFor="siem-q">Kotak pencarian</Label>
                  <Input
                    id="siem-q"
                    value={q}
                    maxLength={128}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="rule atau agen"
                  />
                </div>
                <div className="col-span-12 sm:col-span-4 xl:col-span-2">
                  <Button
                    className="w-auto min-w-[8rem]"
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
                    Terapkan
                  </Button>
                </div>
              </div>

              {eventsQ.data?.degraded && (
                <p className="text-sm text-amber-700">
                  Hasil parsial
                  {eventsQ.data.last_error
                    ? `: ${eventsQ.data.last_error}`
                    : ""}
                </p>
              )}

              {eventsQ.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="sticky top-0 z-[1] border-b border-border bg-card shadow-[0_1px_0_hsl(var(--border))]">
                      <tr className="text-muted-foreground">
                        <th className="w-[12rem] py-2 pr-3">Waktu (WIB)</th>
                        <th className="w-[8rem] py-2 pr-3">Level</th>
                        <th className="py-2 pr-3">Rule</th>
                        <th className="w-[10rem] py-2">Agen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.length === 0 && (
                        <tr data-testid="siem-events-empty">
                          <td
                            colSpan={4}
                            className="py-4 text-muted-foreground"
                          >
                            Tidak ada event.
                          </td>
                        </tr>
                      )}
                      {events.map((ev) => (
                        <tr
                          key={ev.external_id}
                          data-testid="siem-event-row"
                          className="cursor-pointer border-b border-border/60 hover:bg-accent/40"
                          onClick={() => setSelected(ev)}
                        >
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {formatWhen(ev.occurred_at)}
                          </td>
                          <td className="py-2 pr-3">
                            <LevelChip level={ev.rule_level} />
                          </td>
                          <td
                            className="truncate py-2 pr-3"
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
                          </td>
                          <td
                            className="truncate py-2 font-mono text-xs"
                            title={ev.agent_name ?? ev.agent_wazuh_id ?? undefined}
                          >
                            {ev.agent_name ?? ev.agent_wazuh_id ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {allEvents.length > pageSize && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {allEvents.length} event · halaman {safeEventPage + 1}/
                      {eventPageCount}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={safeEventPage === 0}
                        onClick={() => setEventPage((p) => Math.max(0, p - 1))}
                      >
                        Sebelumnya
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
                        Berikutnya
                      </Button>
                    </div>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>

          {selected && (
            <Card data-testid="siem-event-detail">
              <CardHeader>
                <CardTitle>Detail event</CardTitle>
                <CardDescription>{selected.external_id}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Level:</span>{" "}
                  {selected.rule_level}
                </p>
                <p>
                  <span className="text-muted-foreground">Rule:</span>{" "}
                  {selected.rule_description}
                </p>
                <p>
                  <span className="text-muted-foreground">Agen:</span>{" "}
                  {selected.agent_name ?? selected.agent_wazuh_id ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Waktu:</span>{" "}
                  {formatWhen(selected.occurred_at)}
                </p>
                {canCreate && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <Label htmlFor="siem-case-title">Judul kasus</Label>
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
                      Buat kasus
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Kasus</CardTitle>
              <CardDescription>
                Kasus disimpan di aplikasi, bukan plugin Wazuh.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {casesQ.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : cases.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada kasus. Pilih event di tabel, lalu buat kasus.
                </p>
              ) : (
                <ul className="space-y-2">
                  {cases.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent/40"
                        onClick={() => setActiveCaseId(c.id)}
                      >
                        <span>{c.title}</span>
                        {statusBadge(c.status)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {activeCase && (
                <div
                  className="space-y-3 rounded-md border border-border p-3"
                  data-testid="siem-case-detail"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">{activeCase.title}</h3>
                    {statusBadge(activeCase.status)}
                  </div>
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
                           {caseStatusLabel(st)}
                         </Button>
                       ))}
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Event</p>
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
                    <p className="mb-1 text-xs text-muted-foreground">Catatan</p>
                    <ul className="space-y-1 text-sm">
                      {activeCase.notes.map((n) => (
                        <li key={n.id}>{n.body}</li>
                      ))}
                    </ul>
                  </div>
                  {canCreate && (
                    <div className="space-y-2">
                      <Label htmlFor="siem-note">Catatan baru</Label>
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
                        Tambah catatan
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
