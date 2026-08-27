import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  listSamples,
  pauseMonitor,
  type UptimeMonitor,
  type UptimeSample,
} from "@/api/uptime";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
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

export function mapUptimeError(message: string): string {
  if (/seat limit/i.test(message)) return "limit";
  if (/already exists/i.test(message)) return "dup";
  if (/not allowed/i.test(message)) return "ssrf";
  return message;
}

type StateFilter = "all" | "up" | "down" | "unknown";
type TypeFilter = "all" | "http" | "tcp";

function Sparkline({
  monitorId,
  state,
}: {
  monitorId: string;
  state: string;
}) {
  const samples = useQuery({
    queryKey: ["uptime-samples", monitorId],
    queryFn: () => listSamples(monitorId),
  });
  const points = (samples.data ?? []).slice(0, 24).reverse();
  if (points.length < 2) return null;
  const w = 96;
  const h = 24;
  const maxLat = Math.max(
    ...points.map((p: UptimeSample) => p.latency_ms ?? 1),
    1,
  );
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.latency_ms ?? 0) / maxLat) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const strokeClass =
    state === "up"
      ? "text-primary"
      : state === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <svg
      width={w}
      height={h}
      className={strokeClass}
      data-testid="uptime-sparkline"
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function stateBadgeVariant(state: string) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  return "info" as const;
}

export default function Uptime() {
  const { t } = useTranslation("uptime");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [checkType, setCheckType] = useState<"http" | "tcp">("http");
  const [interval, setInterval] = useState("60");
  const [keyword, setKeyword] = useState("");
  const [notify, setNotify] = useState("");
  const [open, setOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");

  const list = useQuery({
    queryKey: ["uptime"],
    queryFn: listMonitors,
    refetchInterval: (q) => {
      const rows = q.state.data ?? [];
      return rows.some((m) => m.enabled && m.state === "unknown") ? 4000 : false;
    },
  });
  const items = list.data ?? [];
  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const enabledCount = items.filter((m) => m.enabled).length;
  const atCap = enabledCount >= limit;
  const upCount = items.filter((m) => m.state === "up").length;
  const downCount = items.filter((m) => m.state === "down").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((m) => {
      if (stateFilter !== "all" && m.state !== stateFilter) return false;
      if (typeFilter !== "all" && m.check_type !== typeFilter) return false;
      if (q) {
        const hay = `${m.name} ${m.target}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, stateFilter, typeFilter, search]);

  const filtersActive =
    stateFilter !== "all" || typeFilter !== "all" || Boolean(search.trim());

  const createMut = useMutation({
    mutationFn: createMonitor,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["uptime"] });
      setName("");
      setTarget("");
      setKeyword("");
      setNotify("");
      setInterval("60");
      setOpen(false);
    },
    onError: (err: { response?: { data?: { detail?: unknown } } }) => {
      const raw = err.response?.data?.detail;
      const detail =
        typeof raw === "string"
          ? raw
          : Array.isArray(raw)
            ? raw
                .map((item) =>
                  typeof item === "string"
                    ? item
                    : String((item as { msg?: string }).msg ?? item),
                )
                .join("; ")
            : String(raw ?? "");
      toast.error(
        mapUptimeError(detail) === "limit" ? t("limitReached") : detail,
      );
    },
  });

  const delMut = useMutation({
    mutationFn: deleteMonitor,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["uptime"] }),
  });

  const pauseMut = useMutation({
    mutationFn: (id: string) => pauseMonitor(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["uptime"] }),
  });

  const stateLabel = (state: string) => {
    if (state === "up") return t("stateUp");
    if (state === "down") return t("stateDown");
    return t("stateUnknown");
  };

  return (
    <div className="space-y-6" data-testid="uptime-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          data-testid="uptime-add"
          disabled={atCap}
          onClick={() => setOpen((v) => !v)}
        >
          {t("add")}
        </Button>
      </div>

      {items.length > 0 ? (
        <div
          data-testid="uptime-kpi"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("statUp")}
            </p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-primary">
              {upCount}
            </p>
          </div>
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("statDown")}
            </p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-destructive">
              {downCount}
            </p>
          </div>
          <div className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("statSku")}
            </p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
              {t("skuShort", { count: enabledCount, limit, sku })}
            </p>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div
          data-testid="uptime-filters"
          className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="uptime-filter-status">{t("filterStatus")}</Label>
            <Select
              value={stateFilter}
              onValueChange={(value) => setStateFilter(value as StateFilter)}
            >
              <SelectTrigger
                id="uptime-filter-status"
                aria-label={t("filterStatus")}
                className="h-10 min-h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterAll")}</SelectItem>
                <SelectItem value="up">{t("stateUp")}</SelectItem>
                <SelectItem value="down">{t("stateDown")}</SelectItem>
                <SelectItem value="unknown">{t("stateUnknown")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="uptime-filter-type">{t("filterProtocol")}</Label>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as TypeFilter)}
            >
              <SelectTrigger
                id="uptime-filter-type"
                aria-label={t("filterProtocol")}
                className="h-10 min-h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterAll")}</SelectItem>
                <SelectItem value="http">http</SelectItem>
                <SelectItem value="tcp">tcp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="uptime-filter-search">{t("filterSearch")}</Label>
            <Input
              id="uptime-filter-search"
              className="h-10 min-h-10"
              placeholder={t("filterSearchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            {filtersActive
              ? t("filterShowing", {
                  shown: filtered.length,
                  total: items.length,
                })
              : t("filterHint")}
          </p>
        </div>
      ) : null}

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("add")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="up-name">{t("name")}</Label>
              <Input
                id="up-name"
                data-testid="uptime-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="up-type">{t("type")}</Label>
              <Select
                value={checkType}
                onValueChange={(value) =>
                  setCheckType(value as "http" | "tcp")
                }
              >
                <SelectTrigger
                  id="up-type"
                  data-testid="uptime-type"
                  aria-label={t("type")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="tcp">tcp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="up-target">{t("target")}</Label>
              <Input
                id="up-target"
                data-testid="uptime-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={
                  checkType === "http"
                    ? "https://example.com"
                    : "example.com:443"
                }
              />
            </div>
            <div>
              <Label htmlFor="up-interval">{t("interval")}</Label>
              <Input
                id="up-interval"
                data-testid="uptime-interval"
                type="number"
                min={60}
                max={900}
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              />
            </div>
            {checkType === "http" ? (
              <div>
                <Label htmlFor="up-keyword">{t("keyword")}</Label>
                <Input
                  id="up-keyword"
                  data-testid="uptime-keyword"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="up-notify">{t("notify")}</Label>
              <Input
                id="up-notify"
                data-testid="uptime-notify"
                type="email"
                value={notify}
                onChange={(e) => setNotify(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="uptime-save"
                disabled={!name.trim() || !target.trim() || createMut.isPending}
                onClick={() =>
                  createMut.mutate({
                    name: name.trim(),
                    check_type: checkType,
                    target: target.trim(),
                    interval_seconds: Number(interval) || 60,
                    keyword: keyword.trim() || undefined,
                    notify_email: notify.trim() || undefined,
                  })
                }
              >
                {t("save")}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {items.length === 0 && !list.isLoading ? (
        <Card data-testid="uptime-empty">
          <CardContent className="flex min-h-[24rem] flex-col items-center justify-center gap-2 px-6 py-16 text-center 2xl:min-h-[32rem]">
            <p className="text-sm font-medium text-foreground">{t("empty")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("emptyHint")}
            </p>
            <Button
              className="mt-2"
              data-testid="uptime-empty-cta"
              disabled={atCap}
              onClick={() => setOpen(true)}
            >
              {t("emptyCta")}
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm tracking-wide">
              {t("tableTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                {t("filterEmpty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead>{t("colTarget")}</TableHead>
                    <TableHead className="text-right">{t("colUptime")}</TableHead>
                    <TableHead className="text-right">{t("latency")}</TableHead>
                    <TableHead>{t("colSpark")}</TableHead>
                    <TableHead className="text-right">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m: UptimeMonitor) => (
                    <TableRow
                      key={m.id}
                      data-testid="uptime-row"
                      className={
                        m.state === "down"
                          ? "border-l-2 border-l-destructive"
                          : undefined
                      }
                    >
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <Badge variant={stateBadgeVariant(m.state)}>
                          {stateLabel(m.state)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-sm text-foreground">
                          {m.check_type} · {m.target}
                        </p>
                        {m.last_error ? (
                          <p className="mt-1 max-w-md truncate text-xs text-destructive">
                            <span className="text-muted-foreground">
                              {t("lastError")}:{" "}
                            </span>
                            {m.last_error}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {m.uptime_24h != null ? `${m.uptime_24h}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {m.last_latency_ms != null
                          ? `${m.last_latency_ms}ms`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Sparkline monitorId={m.id} state={m.state} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid="uptime-pause"
                            onClick={() => pauseMut.mutate(m.id)}
                          >
                            {m.enabled ? t("pause") : t("resume")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive"
                            data-testid="uptime-delete"
                            onClick={() => {
                              if (window.confirm(t("confirmDelete")))
                                delMut.mutate(m.id);
                            }}
                          >
                            {t("delete")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
