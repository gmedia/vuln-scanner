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
import { DatePicker } from "@/components/ui/DatePicker";
import { Label } from "@/components/ui/Label";
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
import { ProtocolGlyph } from "@/components/uptime/UptimeChrome";
import { stateBadgeVariant } from "@/components/uptime/uptimeChrome";
import { useIsMobile } from "@/hooks/use-mobile";
import i18n from "@/i18n";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

const SAMPLE_PAGE_SIZE = 20;
const OUTAGE_PAGE_SIZE = 5;
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

const OUTAGE_EVENT_RETENTION_DAYS = 90;
const SAMPLE_RETENTION_DAYS = 7;

function parseDayInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
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

function DetailKpiTile({
  label,
  value,
  emphasize = false,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly emphasize?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-lg font-bold tabular-nums sm:text-2xl",
          emphasize ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
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
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const isMobile = useIsMobile();
  const outageSize = isMobile ? 5 : OUTAGE_PAGE_SIZE;
  const sampleSize = isMobile ? 10 : SAMPLE_PAGE_SIZE;
  const [prevIsMobile, setPrevIsMobile] = useState(isMobile);
  if (prevIsMobile !== isMobile) {
    setPrevIsMobile(isMobile);
    setPage(1);
    setOutagePage(1);
  }
  const window = useMemo(() => rangeWindow(range), [range]);

  const customWindow = useMemo(() => {
    if (!customFrom || !customTo) {
      return {
        window,
        valid: true,
        custom: false,
        beyondSamples: false as boolean,
      };
    }
    const fromDay = parseDayInput(customFrom);
    const toDay = parseDayInput(customTo);
    if (!fromDay || !toDay) {
      return {
        window,
        valid: false,
        custom: false,
        beyondSamples: false as boolean,
      };
    }
    const now = new Date();
    const start = new Date(fromDay);
    start.setHours(0, 0, 0, 0);
    const end = new Date(toDay);
    end.setHours(23, 59, 59, 999);
    const earliest = new Date(now);
    earliest.setHours(0, 0, 0, 0);
    earliest.setDate(earliest.getDate() - OUTAGE_EVENT_RETENTION_DAYS);
    const valid =
      start.getTime() <= end.getTime() &&
      start.getTime() >= earliest.getTime() &&
      toDay.getTime() <= now.getTime();
    if (!valid) {
      return {
        window,
        valid: false,
        custom: false,
        beyondSamples: false as boolean,
      };
    }
    if (end.getTime() > now.getTime()) end.setTime(now.getTime());
    const sampleFloor = new Date(now);
    sampleFloor.setHours(0, 0, 0, 0);
    sampleFloor.setDate(sampleFloor.getDate() - SAMPLE_RETENTION_DAYS);
    return {
      window: { from: start.toISOString(), until: end.toISOString() },
      valid: true,
      custom: true as boolean,
      beyondSamples: start.getTime() < sampleFloor.getTime(),
    };
  }, [customFrom, customTo, window]);

  const tabsEnabled = !customWindow.custom;
  const activeTabsValue = customWindow.custom ? "" : range;

  const onTabsChange = (next: string) => {
    if (!next) return;
    setRange(next as UptimeRange);
    setCustomFrom("");
    setCustomTo("");
    setPage(1);
    setOutagePage(1);
  };
  const activeWindow = customWindow.window;
  const hasPartialCustom = Boolean(
    (customFrom || customTo) && !(customFrom && customTo),
  );
  const rangeError = customWindow.valid ? null : t("rangeError");
  const showRangeError = !customWindow.valid && !hasPartialCustom;

  const monitorQ = useQuery({
    queryKey: ["uptime-monitor", id],
    queryFn: () => getMonitor(id as string),
    enabled: Boolean(id),
    retry: false,
  });
  const statsQ = useQuery({
    queryKey: ["uptime-stats", id, activeWindow.from, activeWindow.until],
    queryFn: () =>
      getMonitorStats(id as string, {
        from: activeWindow.from,
        until: activeWindow.until,
      }),
    enabled:
      Boolean(id) && monitorQ.isSuccess && !customWindow.beyondSamples,
  });
  const eventsQ = useQuery({
    queryKey: [
      "uptime-events",
      id,
      activeWindow.from,
      activeWindow.until,
    ],
    queryFn: () =>
      listEvents(id as string, {
        from: activeWindow.from,
        until: activeWindow.until,
        limit: 200,
      }),
    enabled: Boolean(id) && monitorQ.isSuccess,
  });
  const samplesQ = useQuery({
    queryKey: [
      "uptime-samples",
      id,
      activeWindow.from,
      activeWindow.until,
      page,
      sampleSize,
    ],
    queryFn: () =>
      listSamples(id as string, {
        from: activeWindow.from,
        until: activeWindow.until,
        limit: sampleSize,
        offset: (page - 1) * sampleSize,
      }),
    enabled:
      Boolean(id) && monitorQ.isSuccess && !customWindow.beyondSamples,
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
    () =>
      buildBarSegments(events ?? [], activeWindow.from, activeWindow.until),
    [events, activeWindow.from, activeWindow.until],
  );
  const outages = useMemo(
    () => buildOutages(events ?? [], activeWindow.from, activeWindow.until),
    [events, activeWindow.from, activeWindow.until],
  );
  const beyondSamples = customWindow.beyondSamples && customWindow.custom;
  const samples = beyondSamples ? [] : (samplesQ.data?.items ?? []);
  const sampleTotal = beyondSamples ? 0 : (samplesQ.data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(sampleTotal / sampleSize));
  const safePage = Math.min(page, totalPages);
  const outageTotalPages = Math.max(
    1,
    Math.ceil(outages.length / outageSize),
  );
  const safeOutagePage = Math.min(outagePage, outageTotalPages);
  const pagedOutages = outages.slice(
    (safeOutagePage - 1) * outageSize,
    safeOutagePage * outageSize,
  );
  const fromMs = new Date(activeWindow.from).getTime();
  const untilMs = new Date(activeWindow.until).getTime();

  if (!id || notFound) {
    return (
      <div data-testid="uptime-detail-not-found">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Activity className="h-6 w-6 text-destructive" aria-hidden />
          </span>
          <h2 className="mb-2 text-lg font-bold text-foreground">
            {t("detailNotFound")}
          </h2>
          <p className="mb-6 max-w-md text-sm text-muted-foreground">
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
  const stats = beyondSamples && customWindow.custom ? undefined : statsQ.data;
  const pct = stats?.uptime_pct;
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
          monitor.last_error ? (
            <span className="block text-[11px] text-destructive">
              {monitor.last_error}
              {lastHint ? ` — ${t(lastHint)}` : ""}
            </span>
          ) : undefined
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

      <article className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"
            >
              <ProtocolGlyph type={monitor.check_type} className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {monitor.check_type}
              </p>
              <p className="truncate font-mono text-sm text-foreground">
                {monitor.target}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {monitor.last_latency_ms != null ? (
                  <span className="font-mono tabular-nums">
                    {t("latency")} {monitor.last_latency_ms}ms
                  </span>
                ) : null}
                {monitor.uptime_24h != null ? (
                  <span className="font-mono tabular-nums">
                    {monitor.uptime_24h}% / 24h
                  </span>
                ) : null}
                <span className="font-mono tabular-nums">
                  {monitor.interval_seconds}s
                </span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <Card className="overflow-hidden" data-testid="uptime-range-filters">
        <CardHeader className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={activeTabsValue} onValueChange={onTabsChange}>
            <TabsList data-testid="uptime-range-tabs">
              {RANGES.map((r) => (
                <TabsTrigger
                  key={r}
                  value={r}
                  data-testid={`uptime-range-${r}`}
                  disabled={!tabsEnabled}
                >
                  {t(RANGE_LABEL[r])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-6">
          <div
            data-testid="uptime-outage-filters"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <div
              data-testid="uptime-outage-from"
              className="flex min-w-0 flex-col gap-1.5"
            >
              <Label htmlFor="uptime-outage-from-input">
                {t("rangeFrom")}
              </Label>
              <DatePicker
                id="uptime-outage-from-input"
                value={customFrom}
                onChange={(value) => {
                  setCustomFrom(value);
                  setPage(1);
                  setOutagePage(1);
                }}
                placeholder={t("rangeFrom")}
                aria-label={t("rangeFrom")}
              />
            </div>
            <div
              data-testid="uptime-outage-to"
              className="flex min-w-0 flex-col gap-1.5"
            >
              <Label htmlFor="uptime-outage-to-input">{t("rangeTo")}</Label>
              <DatePicker
                id="uptime-outage-to-input"
                value={customTo}
                onChange={(value) => {
                  setCustomTo(value);
                  setPage(1);
                  setOutagePage(1);
                }}
                placeholder={t("rangeTo")}
                aria-label={t("rangeTo")}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="uptime-outage-clear">{t("rangeClear")}</Label>
              <Button
                id="uptime-outage-clear"
                type="button"
                variant="outline"
                data-testid="uptime-outage-clear"
                className="h-10 min-h-10"
                onClick={() => {
                  setCustomFrom("");
                  setCustomTo("");
                  setPage(1);
                  setOutagePage(1);
                }}
              >
                {t("rangeClear")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              {t("rangeCustomHint")}
            </p>
            {showRangeError && rangeError ? (
              <p
                data-testid="uptime-outage-range-error"
                className="text-xs text-destructive sm:col-span-3"
              >
                {rangeError}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div
        data-testid="uptime-detail-kpi"
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        {beyondSamples && customWindow.custom ? (
          <p
            data-testid="uptime-samples-retention-note"
            className="col-span-3 text-xs text-muted-foreground"
          >
            {t("samplesRetentionNote")}
          </p>
        ) : null}
        <DetailKpiTile
          label={t("rangeUptime")}
          value={pct == null ? "—" : `${pct}%`}
          emphasize
        />
        <DetailKpiTile label={t("rangeOk")} value={stats?.ok_count ?? "—"} />
        <DetailKpiTile
          label={t("rangeTotal")}
          value={stats?.total_count ?? "—"}
        />
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

      <Card data-testid="uptime-outages" className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border pb-4">
          <CardTitle className="text-sm tracking-wide">
            {t("outagesTitle")}
          </CardTitle>
          {outages.length > 0 ? (
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {outages.length}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className={outages.length === 0 ? "p-0" : undefined}>
          {eventsQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : outages.length === 0 ? (
            <div className="m-4 flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center">
              <Activity className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">{t("outagesEmpty")}</p>
            </div>
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
          {outages.length > outageSize ? (
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
        loading={samplesQ.isLoading && !beyondSamples}
        emptyHint={beyondSamples && customWindow.custom ? t("samplesRetentionNote") : undefined}
      />
      {!beyondSamples && sampleTotal > sampleSize ? (
        <Pagination className="mt-2" data-testid="uptime-sample-pagination">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                aria-disabled={safePage <= 1}
              />
            </PaginationItem>
            <PaginationItem>
              <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                {safePage}/{totalPages}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                aria-disabled={safePage >= totalPages}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
