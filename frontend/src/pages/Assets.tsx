import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  createAsset,
  createAssetSchedule,
  deleteAsset,
  fetchAssetPack,
  fetchAssetPackHtml,
  listAssets,
  type ScanAsset,
} from "@/api/assets";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

export function mapAssetError(message: string): string {
  if (/Asset limit/i.test(message)) return "limit";
  if (/already exists/i.test(message)) return "dup";
  if (/already has a schedule/i.test(message)) return "sched";
  return message;
}

export default function Assets() {
  const { t } = useTranslation("assets");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [scanType, setScanType] = useState<"ip" | "domain">("domain");
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);

  const list = useQuery({ queryKey: ["assets"], queryFn: listAssets });
  const items = list.data ?? [];
  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const atCap = items.length >= limit;

  const createMut = useMutation({
    mutationFn: createAsset,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      setName("");
      setTarget("");
      setNotes("");
      setOpen(false);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = String(err.response?.data?.detail ?? "");
      toast.error(
        mapAssetError(detail) === "limit" ? t("limitReached") : detail,
      );
    },
  });

  const delMut = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["assets"] }),
  });

  const schedMut = useMutation({
    mutationFn: (id: string) => createAssetSchedule(id, { cadence: "weekly" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["assets"] }),
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(String(err.response?.data?.detail ?? ""));
    },
  });

  return (
    <div className="space-y-6" data-testid="assets-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("skuLabel", { sku, count: items.length, limit })}
          </p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 ? (
            <>
              <Button
                variant="outline"
                data-testid="assets-pack"
                onClick={async () => {
                  const pack = await fetchAssetPack();
                  const blob = new Blob([JSON.stringify(pack, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "assets-pack.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                {t("pack")}
              </Button>
              <Button
                variant="outline"
                data-testid="assets-pack-html"
                onClick={async () => {
                  const blob = await fetchAssetPackHtml();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "assets-pack.html";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                {t("packHtml")}
              </Button>
            </>
          ) : null}
          {items.length > 0 || open ? (
            <Button
              data-testid="assets-add"
              disabled={atCap}
              onClick={() => setOpen((v) => !v)}
            >
              {t("add")}
            </Button>
          ) : null}
        </div>
      </div>

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("add")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="asset-name">{t("name")}</Label>
              <Input
                id="asset-name"
                data-testid="asset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="asset-type">{t("type")}</Label>
              <Select
                value={scanType}
                onValueChange={(value) =>
                  setScanType(value as "ip" | "domain")
                }
              >
                <SelectTrigger
                  id="asset-type"
                  data-testid="asset-type"
                  aria-label={t("type")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="domain">domain</SelectItem>
                  <SelectItem value="ip">ip</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="asset-target">{t("target")}</Label>
              <Input
                id="asset-target"
                data-testid="asset-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="asset-notes">{t("notes")}</Label>
              <Input
                id="asset-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="asset-save"
                disabled={!name.trim() || !target.trim() || createMut.isPending}
                onClick={() =>
                  createMut.mutate({
                    name: name.trim(),
                    scan_type: scanType,
                    target: target.trim(),
                    notes: notes.trim() || undefined,
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
        <Card data-testid="assets-empty">
          <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <p className="text-balance text-sm font-medium text-foreground">
              {t("empty")}
            </p>
            <p className="max-w-md text-balance text-sm text-muted-foreground">
              {t("emptyHint")}
            </p>
            <Button
              variant="outline"
              className="mt-2"
              data-testid="assets-empty-cta"
              disabled={atCap}
              onClick={() => setOpen(true)}
            >
              {t("emptyCta")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((a: ScanAsset) => (
            <li key={a.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.scan_type} · {a.target}
                    </p>
                    {a.schedule_id ? (
                      <p className="text-xs text-muted-foreground">
                        {t("hasSchedule")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {a.scan_type === "domain" ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/uptime"
                          data-testid="assets-watch-http"
                        >
                          {t("watchHttp")}
                        </Link>
                      </Button>
                    ) : null}
                    {!a.schedule_id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => schedMut.mutate(a.id)}
                      >
                        {t("schedule")}
                      </Button>
                    ) : null}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(t("confirmDelete")))
                          delMut.mutate(a.id);
                      }}
                    >
                      {t("delete")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
