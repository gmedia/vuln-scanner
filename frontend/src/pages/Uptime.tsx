import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  pauseMonitor,
  type UptimeMonitor,
} from "@/api/uptime";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

export function mapUptimeError(message: string): string {
  if (/seat limit/i.test(message)) return "limit";
  if (/already exists/i.test(message)) return "dup";
  if (/not allowed/i.test(message)) return "ssrf";
  return message;
}

export default function Uptime() {
  const { t } = useTranslation("uptime");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [checkType, setCheckType] = useState<"http" | "tcp">("http");
  const [open, setOpen] = useState(false);

  const list = useQuery({ queryKey: ["uptime"], queryFn: listMonitors });
  const items = list.data ?? [];
  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const enabledCount = items.filter((m) => m.enabled).length;
  const atCap = enabledCount >= limit;

  const createMut = useMutation({
    mutationFn: createMonitor,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["uptime"] });
      setName("");
      setTarget("");
      setOpen(false);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = String(err.response?.data?.detail ?? "");
      toast.error(mapUptimeError(detail) === "limit" ? t("limitReached") : detail);
    },
  });

  const delMut = useMutation({
    mutationFn: deleteMonitor,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["uptime"] }),
  });

  const pauseMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      pauseMonitor(id, enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["uptime"] }),
  });

  return (
    <div className="space-y-6 p-6" data-testid="uptime-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("skuLabel", { sku, count: enabledCount, limit })}
          </p>
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
                placeholder={checkType === "http" ? "https://example.com" : "example.com:443"}
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

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="uptime-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((m: UptimeMonitor) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
              data-testid="uptime-row"
            >
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.check_type} · {m.target} · {m.state}
                  {m.uptime_24h != null ? ` · ${m.uptime_24h}%` : ""}
                </p>
                {m.last_error ? (
                  <p className="text-xs text-destructive">{m.last_error}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pauseMut.mutate({ id: m.id, enabled: !m.enabled })}
                >
                  {m.enabled ? t("pause") : t("resume")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
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
