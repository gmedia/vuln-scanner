import { useMemo, useState } from "react";
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
  updateAsset,
  type ScanAsset,
} from "@/api/assets";
import { Badge } from "@/components/ui/Badge";
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

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

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
  const [tagsInput, setTagsInput] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScanAsset | null>(null);
  const [tagFilter, setTagFilter] = useState<string>("all");

  function resetForm() {
    setName("");
    setTarget("");
    setNotes("");
    setTagsInput("");
    setScanType("domain");
    setOpen(false);
    setEditing(null);
  }

  function startEdit(a: ScanAsset) {
    setEditing(a);
    setName(a.name);
    setTarget(a.target);
    setScanType(a.scan_type === "ip" ? "ip" : "domain");
    setNotes(a.notes ?? "");
    setTagsInput((a.tags ?? []).join(", "));
    setOpen(true);
  }

  const list = useQuery({ queryKey: ["assets"], queryFn: () => listAssets() });
  const items = list.data ?? [];
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const a of items) {
      for (const tag of a.tags ?? []) s.add(tag);
    }
    return [...s].sort();
  }, [items]);
  const visible = useMemo(() => {
    if (tagFilter === "all") return items;
    return items.filter((a) => (a.tags ?? []).includes(tagFilter));
  }, [items, tagFilter]);
  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const atCap = items.length >= limit;

  const createMut = useMutation({
    mutationFn: createAsset,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      resetForm();
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = String(err.response?.data?.detail ?? "");
      toast.error(
        mapAssetError(detail) === "limit" ? t("limitReached") : detail,
      );
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { name: string; notes?: string; tags: string[] };
    }) => updateAsset(id, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      resetForm();
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(String(err.response?.data?.detail ?? ""));
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
          <Button
            data-testid="assets-add"
            disabled={atCap}
            onClick={() => {
              if (open) resetForm();
              else {
                setEditing(null);
                setOpen(true);
              }
            }}
          >
            {t("add")}
          </Button>
        </div>
      </div>

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? t("editTitle") : t("add")}</CardTitle>
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
                  disabled={Boolean(editing)}
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
                disabled={Boolean(editing)}
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
            <div>
              <Label htmlFor="asset-tags">{t("tags")}</Label>
              <Input
                id="asset-tags"
                data-testid="asset-tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder={t("tagsHint")}
              />
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="asset-save"
                disabled={
                  !name.trim() ||
                  (!editing && !target.trim()) ||
                  createMut.isPending ||
                  updateMut.isPending
                }
                onClick={() => {
                  const tags = parseTags(tagsInput);
                  const notesVal = notes.trim() || undefined;
                  if (editing) {
                    updateMut.mutate({
                      id: editing.id,
                      payload: {
                        name: name.trim(),
                        notes: notesVal,
                        tags,
                      },
                    });
                    return;
                  }
                  createMut.mutate({
                    name: name.trim(),
                    scan_type: scanType,
                    target: target.trim(),
                    notes: notesVal,
                    tags,
                  });
                }}
              >
                {t("save")}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {items.length > 0 && allTags.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="asset-tag-filter">{t("filterTag")}</Label>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger
                id="asset-tag-filter"
                data-testid="asset-tag-filter"
                className="h-10 min-h-10"
                aria-label={t("filterTag")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTags")}</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
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
              className="mt-2 min-h-11"
              data-testid="assets-empty-cta"
              disabled={atCap}
              onClick={() => setOpen(true)}
            >
              {t("emptyCta")}
            </Button>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noTagMatch")}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((a: ScanAsset) => (
            <li key={a.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.scan_type} · {a.target}
                    </p>
                    {(a.tags ?? []).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="default"
                            data-testid={`asset-tag-${tag}`}
                            className="cursor-pointer"
                            onClick={() => setTagFilter(tag)}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
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
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`asset-edit-${a.id}`}
                      onClick={() => startEdit(a)}
                    >
                      {t("edit")}
                    </Button>
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
