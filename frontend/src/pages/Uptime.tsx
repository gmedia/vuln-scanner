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
  updateMonitor,
  type UptimeCheckType,
  type UptimeCreatePayload,
  type UptimeMonitor,
  type UptimeSample,
} from "@/api/uptime";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton, TableRowSkeleton } from "@/components/ui/Skeleton";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";

export function mapUptimeError(message: string): string {
  if (/seat limit/i.test(message)) return "limit";
  if (/already exists/i.test(message)) return "dup";
  if (/not allowed/i.test(message)) return "ssrf";
  return message;
}

export function explainUptimeError(
  error: string | null | undefined,
): string | null {
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.includes("111") || e.includes("connection refused")) return "hintRefused";
  if (e.includes("timed out") || e.includes("timeout")) return "hintTimeout";
  if (/\b403\b/.test(e)) return "hint403";
  if (/\b401\b/.test(e)) return "hint401";
  if (/\b5\d\d\b/.test(e)) return "hint5xx";
  if (/status \d+/.test(e) || e.startsWith("expected ")) return "hintStatus";
  if (
    e.includes("certificate") ||
    e.includes("ssl") ||
    e.includes("tls")
  ) {
    return "hintTls";
  }
  if (
    e.includes("name or service not known") ||
    e.includes("getaddrinfo") ||
    e.includes("nxdomain") ||
    e.includes("did not resolve")
  ) {
    return "hintDns";
  }
  return null;
}

type StateFilter = "all" | "up" | "down" | "unknown" | "degraded";
type TypeFilter = "all" | UptimeCheckType;

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
  const [checkType, setCheckType] = useState<UptimeCheckType>("http");
  const [interval, setInterval] = useState("60");
  const [keyword, setKeyword] = useState("");
  const [keywordInvert, setKeywordInvert] = useState(false);
  const [httpMethod, setHttpMethod] = useState("GET");
  const [requestHeaders, setRequestHeaders] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [dnsRecord, setDnsRecord] = useState("A");
  const [expectedValues, setExpectedValues] = useState("");
  const [heartbeatUrl, setHeartbeatUrl] = useState<string | null>(null);
  const [notify, setNotify] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState("10");
  const [expectStatus, setExpectStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UptimeMonitor | null>(null);
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);

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

  const resetForm = () => {
    setName("");
    setTarget("");
    setCheckType("http");
    setKeyword("");
    setKeywordInvert(false);
    setHttpMethod("GET");
    setRequestHeaders("");
    setRequestBody("");
    setDnsRecord("A");
    setExpectedValues("");
    setNotify("");
    setInterval("60");
    setTimeoutSeconds("10");
    setExpectStatus("");
    setEditing(null);
    setHeartbeatUrl(null);
  };

  const fillFromMonitor = (m: UptimeMonitor) => {
    setName(m.name);
    setTarget(m.target);
    setCheckType((m.check_type as UptimeCheckType) || "http");
    setInterval(String(m.interval_seconds));
    setTimeoutSeconds(String(m.timeout_seconds ?? 10));
    setExpectStatus(m.expect_status != null ? String(m.expect_status) : "");
    setKeyword(m.keyword ?? "");
    setKeywordInvert(Boolean(m.keyword_invert));
    setHttpMethod(m.http_method ?? "GET");
    setRequestHeaders(
      m.request_headers ? JSON.stringify(m.request_headers) : "",
    );
    setRequestBody(m.request_body ?? "");
    setDnsRecord(m.dns_record ?? "A");
    setExpectedValues((m.expected_values ?? []).join(", "));
    setNotify(m.notify_email ?? "");
    setEditing(m);
    setOpen(true);
    setHeartbeatUrl(null);
  };

  const parseFormPayload = (): UptimeCreatePayload | null => {
    let headers: Record<string, string> | undefined;
    if (requestHeaders.trim()) {
      try {
        headers = JSON.parse(requestHeaders) as Record<string, string>;
      } catch {
        toast.error("Invalid headers JSON");
        return null;
      }
    }
    const timeout = Number(timeoutSeconds) || 10;
    const expectRaw = expectStatus.trim();
    const expectNum = expectRaw ? Number(expectRaw) : undefined;
    return {
      name: name.trim(),
      check_type: checkType,
      target:
        checkType === "heartbeat" ? "heartbeat://pending" : target.trim(),
      interval_seconds: Number(interval) || 60,
      timeout_seconds: checkType === "heartbeat" ? undefined : timeout,
      expect_status:
        checkType === "http" && expectNum != null && !Number.isNaN(expectNum)
          ? expectNum
          : undefined,
      keyword: keyword.trim() || undefined,
      keyword_invert: keywordInvert,
      http_method: checkType === "http" ? httpMethod : undefined,
      request_headers: headers,
      request_body: requestBody.trim() || undefined,
      dns_record: checkType === "dns" ? dnsRecord : undefined,
      expected_values: expectedValues.trim()
        ? expectedValues.split(",").map((s) => s.trim())
        : undefined,
      notify_email: notify.trim() || undefined,
    };
  };

  const createMut = useMutation({
    mutationFn: createMonitor,
    onSuccess: (created) => {
      const hb = created.heartbeat_url ?? null;
      void qc.invalidateQueries({ queryKey: ["uptime"] });
      resetForm();
      if (!hb) setOpen(false);
      else setHeartbeatUrl(hb);
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

  const updateMut = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UptimeCreatePayload;
    }) => {
      const { check_type, target, ...rest } = payload;
      void check_type;
      void target;
      return updateMonitor(id, rest);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["uptime"] });
      resetForm();
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

  const historyQuery = useQuery({
    queryKey: ["uptime-samples", historyId],
    queryFn: () => listSamples(historyId as string),
    enabled: Boolean(historyId),
  });
  const historyMonitor = items.find((m) => m.id === historyId);
  const historyRows = (historyQuery.data ?? []).slice(0, 24);

  const formBusy = createMut.isPending || updateMut.isPending;
  const advancedDefault =
    editing &&
    (Number(timeoutSeconds) !== 10 || Boolean(expectStatus.trim()))
      ? "advanced"
      : undefined;

  const stateLabel = (state: string) => {
    if (state === "up") return t("stateUp");
    if (state === "down") return t("stateDown");
    if (state === "degraded") return t("stateDegraded");
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
          onClick={() => {
            if (open) {
              resetForm();
              setOpen(false);
            } else {
              resetForm();
              setOpen(true);
            }
          }}
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
            <p
              className={
                downCount > 0
                  ? "mt-1 font-mono text-lg font-bold tabular-nums text-destructive"
                  : "mt-1 font-mono text-lg font-bold tabular-nums text-muted-foreground"
              }
            >
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
                <SelectItem value="degraded">{t("stateDegraded")}</SelectItem>
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
                <SelectItem value="heartbeat">heartbeat</SelectItem>
                <SelectItem value="dns">dns</SelectItem>
                <SelectItem value="ping">ping</SelectItem>
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
            <CardTitle>{editing ? t("edit") : t("add")}</CardTitle>
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
                disabled={Boolean(editing)}
                onValueChange={(value) =>
                  setCheckType(value as UptimeCheckType)
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
                  <SelectItem value="heartbeat">heartbeat</SelectItem>
                  <SelectItem value="dns">dns</SelectItem>
                  <SelectItem value="ping">ping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {checkType !== "heartbeat" ? (
              <div>
                <Label htmlFor="up-target">{t("target")}</Label>
                <Input
                  id="up-target"
                    data-testid="uptime-target"
                    value={target}
                    disabled={Boolean(editing)}
                    onChange={(e) => setTarget(e.target.value)}
                  placeholder={
                    checkType === "http"
                      ? "https://example.com"
                      : checkType === "tcp"
                        ? "example.com:443"
                        : "example.com"
                  }
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("heartbeatHint")}</p>
            )}
            {checkType === "ping" ? (
              <p className="text-sm text-muted-foreground">{t("pingDisabled")}</p>
            ) : null}
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
            <Accordion
              type="single"
              collapsible
              key={editing?.id ?? "create"}
              defaultValue={advancedDefault}
              className="rounded-md border border-border px-3"
              data-testid="uptime-advanced"
            >
              <AccordionItem value="advanced" className="border-b-0">
                <AccordionTrigger>{t("advanced")}</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {checkType !== "heartbeat" ? (
                    <div>
                      <Label htmlFor="up-timeout">{t("timeout")}</Label>
                      <Input
                        id="up-timeout"
                        data-testid="uptime-timeout"
                        className="h-10 min-h-10"
                        type="number"
                        min={1}
                        max={30}
                        value={timeoutSeconds}
                        onChange={(e) => setTimeoutSeconds(e.target.value)}
                      />
                    </div>
                  ) : null}
                  {checkType === "http" ? (
                    <>
                      <div>
                        <Label htmlFor="up-expect-status">
                          {t("expectStatus")}
                        </Label>
                        <Input
                          id="up-expect-status"
                          data-testid="uptime-expect-status"
                          className="h-10 min-h-10"
                          type="number"
                          min={100}
                          max={599}
                          placeholder="200"
                          value={expectStatus}
                          onChange={(e) => setExpectStatus(e.target.value)}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("expectStatusHint")}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="up-method">{t("httpMethod")}</Label>
                        <Select
                          value={httpMethod}
                          onValueChange={setHttpMethod}
                        >
                          <SelectTrigger
                            id="up-method"
                            className="h-10 min-h-10"
                            aria-label={t("httpMethod")}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="HEAD">HEAD</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                            <SelectItem value="PATCH">PATCH</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="up-keyword">{t("keyword")}</Label>
                        <Input
                          id="up-keyword"
                          data-testid="uptime-keyword"
                          className="h-10 min-h-10"
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="up-invert"
                          data-testid="uptime-keyword-invert"
                          type="checkbox"
                          checked={keywordInvert}
                          onChange={(e) => setKeywordInvert(e.target.checked)}
                        />
                        <Label htmlFor="up-invert">{t("keywordInvert")}</Label>
                      </div>
                      <div>
                        <Label htmlFor="up-headers">{t("requestHeaders")}</Label>
                        <Input
                          id="up-headers"
                          className="h-10 min-h-10"
                          value={requestHeaders}
                          onChange={(e) => setRequestHeaders(e.target.value)}
                          placeholder='{"Accept":"application/json"}'
                        />
                      </div>
                      {httpMethod !== "GET" && httpMethod !== "HEAD" ? (
                        <div>
                          <Label htmlFor="up-body">{t("requestBody")}</Label>
                          <Input
                            id="up-body"
                            className="h-10 min-h-10"
                            value={requestBody}
                            onChange={(e) => setRequestBody(e.target.value)}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            {checkType === "dns" ? (
              <>
                <div>
                  <Label htmlFor="up-dns">{t("dnsRecord")}</Label>
                  <Select value={dnsRecord} onValueChange={setDnsRecord}>
                    <SelectTrigger id="up-dns" aria-label={t("dnsRecord")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="AAAA">AAAA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="up-expect">{t("expectedValues")}</Label>
                  <Input
                    id="up-expect"
                    value={expectedValues}
                    onChange={(e) => setExpectedValues(e.target.value)}
                  />
                </div>
              </>
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
                disabled={
                  !name.trim() ||
                  (checkType !== "heartbeat" && !target.trim()) ||
                  formBusy
                }
                onClick={() => {
                  const payload = parseFormPayload();
                  if (!payload) return;
                  if (editing) {
                    updateMut.mutate({ id: editing.id, payload });
                  } else {
                    createMut.mutate(payload);
                  }
                }}
              >
                {t("save")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  setOpen(false);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
            {heartbeatUrl ? (
              <p
                className="break-all font-mono text-xs"
                data-testid="uptime-heartbeat-url"
              >
                {t("heartbeatUrl")}: {heartbeatUrl}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {list.isLoading && items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm tracking-wide">
              {t("tableTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TableRowSkeleton rows={5} />
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card data-testid="uptime-empty">
          <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
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
      ) : (
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
              <>
              <div className="space-y-2 p-3 md:hidden">
                {filtered.map((m: UptimeMonitor) => (
                  <div
                    key={m.id}
                    className="rounded-lg border border-border bg-card p-3 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-all font-medium text-foreground">
                        {m.name}
                      </p>
                      <Badge variant={stateBadgeVariant(m.state)}>
                        {stateLabel(m.state)}
                      </Badge>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {m.check_type} · {m.target}
                    </p>
                    <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                      {m.uptime_24h != null ? `${m.uptime_24h}%` : "—"}
                      {m.last_latency_ms != null
                        ? ` · ${m.last_latency_ms}ms`
                        : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setHistoryId((cur) => (cur === m.id ? null : m.id))
                        }
                      >
                        {t("history")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fillFromMonitor(m)}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => pauseMut.mutate(m.id)}
                      >
                        {m.enabled ? t("pause") : t("resume")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          if (window.confirm(t("confirmDelete")))
                            delMut.mutate(m.id);
                        }}
                      >
                        {t("delete")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
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
                          <div className="mt-1 max-w-md space-y-1">
                            <p className="truncate text-xs text-destructive">
                              <span className="text-muted-foreground">
                                {t("lastError")}:{" "}
                              </span>
                              {m.last_error}
                            </p>
                            {explainUptimeError(m.last_error) ? (
                              <p className="text-xs text-muted-foreground">
                                {t(explainUptimeError(m.last_error) as string)}
                              </p>
                            ) : null}
                          </div>
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
                            data-testid="uptime-history"
                            onClick={() =>
                              setHistoryId((cur) =>
                                cur === m.id ? null : m.id,
                              )
                            }
                          >
                            {t("history")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid="uptime-edit"
                            onClick={() => fillFromMonitor(m)}
                          >
                            {t("edit")}
                          </Button>
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
              </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {historyId && historyMonitor ? (
        <Card data-testid="uptime-history-panel">
          <CardHeader>
            <CardTitle className="text-sm tracking-wide">
              {t("historyTitle", { name: historyMonitor.name })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("probeRule")}</p>
            {historyQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : historyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("colTime")}</TableHead>
                      <TableHead>{t("colStatus")}</TableHead>
                      <TableHead className="text-right">{t("latency")}</TableHead>
                      <TableHead>{t("lastError")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.map((s) => (
                      <TableRow key={s.id} data-testid="uptime-history-row">
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {new Date(s.checked_at).toISOString().replace("T", " ").slice(0, 19)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.ok ? "completed" : "critical"}>
                            {s.ok
                              ? t("stateUp")
                              : s.status_code != null
                                ? String(s.status_code)
                                : t("stateDown")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {s.latency_ms != null ? `${s.latency_ms}ms` : "—"}
                        </TableCell>
                        <TableCell className="max-w-md text-xs">
                          {s.error ? (
                            <div className="space-y-0.5">
                              <p className="truncate text-destructive">{s.error}</p>
                              {explainUptimeError(s.error) ? (
                                <p className="text-muted-foreground">
                                  {t(explainUptimeError(s.error) as string)}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
