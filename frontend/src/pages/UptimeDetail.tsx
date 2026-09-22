import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { Activity, ArrowLeft } from "lucide-react";
import {
  getMonitor,
  getMonitorStats,
  listEvents,
  listSamples,
  pauseMonitor,
  type UptimeEvent,
  type UptimeRange,
} from "@/api/uptime";
import PageHeader from "@/components/layout/PageHeader";
import PageHeaderBack from "@/components/layout/PageHeaderBack";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { UptimeHistoryPanel } from "@/components/uptime/UptimeHistoryPanel";
import { explainUptimeError } from "@/components/uptime/uptimeErrors";
import i18n from "@/i18n";
import { htmlLang, isAppLocale } from "@/i18n/locales";

const SAMPLE_PAGE_SIZE = 50;
const OUTAGE_PAGE_SIZE = 10;
const RANGES: readonly UptimeRange[] = ["6h", "24h", "7d"];
const RANGE_LABEL: Record<UptimeRange, "range6h" | "range24h" | "range7d"> = {
  "6h": "range6h",
  "24h": "range24h",
  "7d": "range7d",
};

const RANGE_MS: Record<UptimeRange, number> = {
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function rangeWindow(range: UptimeRange): { from: string; until: string } {
  const until = new Date();
  const from = new Date(until.getTime() - RANGE_MS[range]);
  return { from: from.toISOString(), until: until.toISOString() };
}

function formatTime(iso: string): string {
  const lng = isAppLocale(i18n.language) ? htmlLang(i18n.language) : "id";
  return new Date(iso).toLocaleString(lng === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number, ongoing: string): string {
  if (ms < 0) return ongoing;
  const totalMin = Math.max(0, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours < 48) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

function stateBadgeVariant(state: string) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  return "info" as const;
}

function segmentClass(state: string): string {
  if (state === "up") return "bg-primary";
  if (state === "down") return "bg-destructive";
  return "bg-muted-foreground/40";
}

type BarSegment = {
  readonly id: string;
  readonly state: string;
  readonly start: number;
  readonly end: number;
};

function buildBarSegments(
  events: readonly UptimeEvent[],
  fromIso: string,
  untilIso: string,
): BarSegment[] {
  const fromMs = new Date(fromIso).getTime();
  const untilMs = new Date(untilIso).getTime();
  if (!(untilMs > fromMs)) return [];
  const ordered = [...events].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const inWindow = ordered.filter((e) => {
    const t = new Date(e.at).getTime();
    return t >= fromMs && t <= untilMs;
  });
  const prior = [...ordered]
    .reverse()
    .find((e) => new Date(e.at).getTime() < fromMs);
  const startState = prior?.to_state ?? "unknown";
  const points = [
    { at: fromMs, state: startState, id: prior?.id ?? "start" },
    ...inWindow.map((e) => ({
      at: new Date(e.at).getTime(),
      state: e.to_state,
      id: e.id,
    })),
    {
      at: untilMs,
      state: inWindow[inWindow.length - 1]?.to_state ?? startState,
      id: "end",
    },
  ];
  const segs: BarSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const cur = points[i];
    const next = points[i + 1];
    if (!cur || !next) continue;
    const start = Math.max(fromMs, cur.at);
    const end = Math.min(untilMs, next.at);
    if (end <= start) continue;
    segs.push({ id: `${cur.id}-${start}`, state: cur.state, start, end });
  }
  return segs;
}

type OutageRow = {
  readonly id: string;
  readonly at: string;
  readonly until: string | null;
  readonly detail: string | null;
  readonly ongoing: boolean;
  readonly durationMs: number;
};

function buildOutages(
  events: readonly UptimeEvent[],
  fromIso: string,
  untilIso: string,
): OutageRow[] {
  const fromMs = new Date(fromIso).getTime();
  const untilMs = new Date(untilIso).getTime();
  const ordered = [...events].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const rows: OutageRow[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const ev = ordered[i];
    if (!ev || ev.to_state !== "down") continue;
    const startMs = new Date(ev.at).getTime();
    if (startMs > untilMs) continue;
    const recover = ordered
      .slice(i + 1)
      .find((next) => next.to_state === "up" && new Date(next.at).getTime() > startMs);
    const endMs = recover ? new Date(recover.at).getTime() : untilMs;
    if (endMs < fromMs) continue;
    const ongoing = !recover;
    rows.push({
        id: ev.id,
        at: startMs < fromMs ? fromIso : ev.at,
        until: recover?.at ?? null,
      detail: ev.detail,
      ongoing,
      durationMs: Math.max(0, endMs - Math.max(startMs, fromMs)),
    });
  }
  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function AvailabilityBar({
  segments,
  fromMs,
  untilMs,
}: {
  readonly segments: readonly BarSegment[];
  readonly fromMs: number;
  readonly untilMs: number;
}) {
  const span = Math.max(1, untilMs - fromMs);
  return (
    <div
      className="flex h-8 w-full overflow-hidden rounded-md border border-border bg-muted"
      data-testid="uptime-availability-bar"
      aria-hidden
    >
      {segments.length === 0 ? (
        <div className="h-full w-full bg-muted-foreground/20" />
      ) : (
        segments.map((seg) => (
          <div
            key={seg.id}
            className={segmentClass(seg.state)}
            style={{ width: `${((seg.end - seg.start) / span) * 100}%` }}
            data-state={seg.state}
          />
        ))
      )}
    </div>
  );
}

export default function UptimeDetail() {
  const { t } = useTranslation("uptime");
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [range, setRange] = useState<UptimeRange>("24h");
  const [page, setPage] = useState(1);
  const [outagePage, setOutagePage] = useState(1);
  const window = useMemo(() => rangeWindow(range), [range]);

  const monitorQ = useQuery({
    queryKey: ["uptime-monitor", id],
    queryFn: () => getMonitor(id as string),
    enabled: Boolean(id),
    retry: false,
  });
  const statsQ = useQuery({
    queryKey: ["uptime-stats", id, window.from, window.until],
    queryFn: () =>
      getMonitorStats(id as string, { from: window.from, until: window.until }),
    enabled: Boolean(id) && monitorQ.isSuccess,
  });
  const eventsQ = useQuery({
    queryKey: ["uptime-events", id, window.from, window.until],
    queryFn: () =>
      listEvents(id as string, {
        from: window.from,
        until: window.until,
        limit: 200,
      }),
    enabled: Boolean(id) && monitorQ.isSuccess,
  });
  const samplesQ = useQuery({
    queryKey: ["uptime-samples", id, window.from, window.until, page],
    queryFn: () =>
      listSamples(id as string, {
        from: window.from,
        until: window.until,
        limit: SAMPLE_PAGE_SIZE,
        offset: (page - 1) * SAMPLE_PAGE_SIZE,
      }),
    enabled: Boolean(id) && monitorQ.isSuccess,
  });

  const pauseMut = useMutation({
    mutationFn: (monitorId: string) => pauseMonitor(monitorId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["uptime-monitor", id] });
      void qc.invalidateQueries({ queryKey: ["uptime"] });
    },
  });

  const notFound =
    monitorQ.isError &&
    isAxiosError(monitorQ.error) &&
    monitorQ.error.response?.status === 404;

  const stateLabel = (state: string) => {
    if (state === "up") return t("stateUp");
    if (state === "down") return t("stateDown");
    if (state === "degraded") return t("stateDegraded");
    return t("stateUnknown");
  };

  const events = eventsQ.data;
  const segments = useMemo(
    () => buildBarSegments(events ?? [], window.from, window.until),
    [events, window.from, window.until],
  );
  const outages = useMemo(
    () => buildOutages(events ?? [], window.from, window.until),
    [events, window.from, window.until],
  );
  const samples = samplesQ.data?.items ?? [];
  const sampleTotal = samplesQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(sampleTotal / SAMPLE_PAGE_SIZE));
  const outageTotalPages = Math.max(
    1,
    Math.ceil(outages.length / OUTAGE_PAGE_SIZE),
  );
  const safeOutagePage = Math.min(outagePage, outageTotalPages);
  const pagedOutages = outages.slice(
    (safeOutagePage - 1) * OUTAGE_PAGE_SIZE,
    safeOutagePage * OUTAGE_PAGE_SIZE,
  );
  const fromMs = new Date(window.from).getTime();
  const untilMs = new Date(window.until).getTime();

  if (!id || notFound) {
    return (
      <div data-testid="uptime-detail-not-found">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 rounded-full bg-red-600/10 p-4">
            <Activity className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="mb-2 text-lg font-bold text-foreground">
            {t("detailNotFound")}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {t("detailNotFoundHint")}
          </p>
          <Button variant="outline" asChild>
            <Link to="/uptime">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("backToList")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (monitorQ.isLoading || !monitorQ.data) {
    return (
      <div className="space-y-6" data-testid="uptime-detail">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const monitor = monitorQ.data;
  const pct = statsQ.data?.uptime_pct;
  const lastHint = explainUptimeError(monitor.last_error);

  return (
    <div className="space-y-6" data-testid="uptime-detail">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {monitor.name}
            <Badge variant={stateBadgeVariant(monitor.state)}>
              {stateLabel(monitor.state)}
            </Badge>
          </span>
        }
        description={
          <>
            <span className="block truncate font-mono text-xs">
              {monitor.check_type} · {monitor.target}
            </span>
            {monitor.last_latency_ms != null ? (
              <span className="mt-0.5 block text-[11px]">
                {t("latency")}: {monitor.last_latency_ms}ms
              </span>
            ) : null}
            {monitor.last_error ? (
              <span className="mt-0.5 block text-[11px] text-destructive">
                {monitor.last_error}
                {lastHint ? ` — ${t(lastHint)}` : ""}
              </span>
            ) : null}
          </>
        }
        leading={<PageHeaderBack to="/uptime" label={t("backToList")} />}
        actions={
          <Button
            variant="outline"
            data-testid="uptime-detail-pause"
            disabled={pauseMut.isPending}
            onClick={() => pauseMut.mutate(monitor.id)}
          >
            {monitor.enabled ? t("pause") : t("resume")}
          </Button>
        }
      />

      <Tabs
        value={range}
        onValueChange={(next) => {
          setRange(next as UptimeRange);
          setPage(1);
          setOutagePage(1);
        }}
      >
        <TabsList data-testid="uptime-range-tabs">
          {RANGES.map((r) => (
            <TabsTrigger key={r} value={r} data-testid={`uptime-range-${r}`}>
              {t(RANGE_LABEL[r])}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div
        data-testid="uptime-detail-kpi"
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
          <p className="font-mono text-lg font-bold tabular-nums text-primary sm:text-2xl">
            {pct == null ? "—" : `${pct}%`}
          </p>
          <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("rangeUptime")}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
          <p className="font-mono text-lg font-bold tabular-nums text-foreground sm:text-2xl">
            {statsQ.data?.ok_count ?? "—"}
          </p>
          <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("rangeOk")}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-3">
          <p className="font-mono text-lg font-bold tabular-nums text-foreground sm:text-2xl">
            {statsQ.data?.total_count ?? "—"}
          </p>
          <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("rangeTotal")}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("timelineTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {eventsQ.isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <AvailabilityBar
              segments={segments}
              fromMs={fromMs}
              untilMs={untilMs}
            />
          )}
          <p className="text-xs text-muted-foreground">{t("timelineHint")}</p>
        </CardContent>
      </Card>

      <Card data-testid="uptime-outages">
        <CardHeader>
          <CardTitle className="text-sm tracking-wide">
            {t("outagesTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : outages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("outagesEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {pagedOutages.map((row) => (
                <li
                  key={row.id}
                  className="rounded-md border border-border p-3"
                  data-testid="uptime-outage-row"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-mono text-xs text-foreground">
                      {formatTime(row.at)}
                      {row.until ? ` → ${formatTime(row.until)}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.ongoing
                        ? t("outageOngoing")
                        : formatDuration(row.durationMs, t("outageOngoing"))}
                    </p>
                  </div>
                  {row.detail ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {row.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {outages.length > OUTAGE_PAGE_SIZE ? (
            <Pagination
              className="mt-3"
              data-testid="uptime-outage-pagination"
            >
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      setOutagePage((p) => Math.max(1, p - 1))
                    }
                    disabled={safeOutagePage <= 1}
                    aria-disabled={safeOutagePage <= 1}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {safeOutagePage}/{outageTotalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setOutagePage((p) => Math.min(outageTotalPages, p + 1))
                    }
                    disabled={safeOutagePage >= outageTotalPages}
                    aria-disabled={safeOutagePage >= outageTotalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </CardContent>
      </Card>

      <UptimeHistoryPanel
        monitor={monitor}
        rows={samples}
        loading={samplesQ.isLoading}
      />
      {sampleTotal > SAMPLE_PAGE_SIZE ? (
        <Pagination className="mt-2" data-testid="uptime-sample-pagination">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-disabled={page <= 1}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                {page}/{totalPages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-disabled={page >= totalPages}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
