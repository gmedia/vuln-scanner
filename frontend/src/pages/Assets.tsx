import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  createAsset,
  createAssetSchedule,
  deleteAsset,
  fetchAssetPack,
  listAssets,
  type ScanAsset,
} from "@/api/assets";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

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
    <div className="space-y-6 p-6" data-testid="assets-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("skuLabel", { sku, count: items.length, limit })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            data-testid="assets-pack"
            disabled={items.length === 0}
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
            data-testid="assets-add"
            disabled={atCap}
            onClick={() => setOpen((v) => !v)}
          >
            {t("add")}
          </Button>
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
              <select
                id="asset-type"
                data-testid="asset-type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={scanType}
                onChange={(e) => setScanType(e.target.value as "ip" | "domain")}
              >
                <option value="domain">domain</option>
                <option value="ip">ip</option>
              </select>
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
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
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
