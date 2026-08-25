import { useState } from "react";
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

export function mapUptimeError(message: string): string {
  if (/seat limit/i.test(message)) return "limit";
  if (/already exists/i.test(message)) return "dup";
  if (/not allowed/i.test(message)) return "ssrf";
  return message;
}

function Sparkline({ monitorId }: { monitorId: string }) {
  const samples = useQuery({
    queryKey: ["uptime-samples", monitorId],
    queryFn: () => listSamples(monitorId),
  });
  const points = (samples.data ?? []).slice(0, 24).reverse();
  if (points.length < 2) return null;
  const w = 96;
  const h = 24;
  const maxLat = Math.max(...points.map((p: UptimeSample) => p.latency_ms ?? 1), 1);
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p.latency_ms ?? 0) / maxLat) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      className="text-muted-foreground"
      data-testid="uptime-sparkline"
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
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

  const list = useQuery({ queryKey: ["uptime"], queryFn: listMonitors });
  const items = list.data ?? [];
  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const enabledCount = items.filter((m) => m.enabled).length;
  const atCap = enabledCount >= limit;
  const upCount = items.filter((m) => m.state === "up").length;
  const downCount = items.filter((m) => m.state === "down").length;

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

  return (
    <div className="space-y-6" data-testid="uptime-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("skuLabel", { sku, count: enabledCount, limit })}
          </p>
          {items.length > 0 ? (
            <p className="mt-2 flex flex-wrap gap-2 text-xs" data-testid="uptime-kpi">
              <Badge variant="completed">{t("stateUp")} {upCount}</Badge>
              <Badge variant="critical">{t("stateDown")} {downCount}</Badge>
            </p>
          ) : null}
        </div>
        <Button
          data-testid="uptime-add"
          disabled={atCap}
          onClick={() => setOpen((v) => !v)}
        >
          {t("add")}
        </Button>
      </div>

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
              <select
                id="up-type"
                data-testid="uptime-type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={checkType}
                onChange={(e) => setCheckType(e.target.value as "http" | "tcp")}
              >
                <option value="http">http</option>
                <option value="tcp">tcp</option>
              </select>
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
        <ul className="space-y-2">
          {items.map((m: UptimeMonitor) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              data-testid="uptime-row"
            >
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {m.name}
                  <Badge
                    variant={
                      m.state === "up"
                        ? "completed"
                        : m.state === "down"
                          ? "critical"
                          : "info"
                    }
                  >
                    {m.state === "up"
                      ? t("stateUp")
                      : m.state === "down"
                        ? t("stateDown")
                        : t("stateUnknown")}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.check_type} · {m.target} · {m.state}
                  {m.uptime_24h != null ? ` · ${m.uptime_24h}%` : ""}
                  {m.last_latency_ms != null
                    ? ` · ${t("latency")} ${m.last_latency_ms}ms`
                    : ""}
                </p>
                {m.last_error ? (
                  <p className="text-xs text-destructive">{m.last_error}</p>
                ) : null}
                <Sparkline monitorId={m.id} />
              </div>
              <div className="flex gap-2">
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
                  data-testid="uptime-delete"
                  onClick={() => {
                    if (window.confirm(t("confirmDelete"))) delMut.mutate(m.id);
                  }}
                >
                  {t("delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
