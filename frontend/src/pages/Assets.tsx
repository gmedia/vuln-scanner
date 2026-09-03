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
  fetchTagColors,
  listAssets,
  patchTagColors,
  TAG_COLOR_KEYS,
  updateAsset,
  type ScanAsset,
  type TagColorKey,
} from "@/api/assets";
import { TAG_COLOR_DOT, tagColorClass } from "@/lib/tagColors";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";

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
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");

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
  const colorsQ = useQuery({
    queryKey: ["asset-tag-colors"],
    queryFn: fetchTagColors,
  });
  const colorMap = colorsQ.data ?? {};
  const items = list.data ?? [];
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const a of items) {
      for (const tag of a.tags ?? []) s.add(tag);
    }
    return [...s].sort();
  }, [items]);
  const visible = useMemo(() => {
    if (tagFilters.length === 0) return items;
    return items.filter((a) =>
      (a.tags ?? []).some((tag) => tagFilters.includes(tag)),
    );
  }, [items, tagFilters]);
  const tagOptions = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return allTags;
    return allTags.filter((tag) => tag.includes(q));
  }, [allTags, tagQuery]);

  function toggleTagFilter(tag: string) {
    setTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );
  }
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

  const colorMut = useMutation({
    mutationFn: (payload: Record<string, TagColorKey>) =>
      patchTagColors(payload),
    onSuccess: (data) => {
      qc.setQueryData(["asset-tag-colors"], data);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(String(err.response?.data?.detail ?? ""));
    },
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="asset-tag-filter">{t("filterTag")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="asset-tag-filter"
                  type="button"
                  variant="outline"
                  data-testid="asset-tag-filter"
                  className="h-10 min-h-10 w-full justify-start font-normal"
                  aria-label={t("filterTag")}
                >
                  {tagFilters.length === 0
                    ? t("allTags")
                    : t("filterTagCount", { count: tagFilters.length })}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(24rem,calc(100vw-2rem))] p-3"
              >
                <Input
                  data-testid="asset-tag-filter-search"
                  value={tagQuery}
                  onChange={(e) => setTagQuery(e.target.value)}
                  placeholder={t("filterTagSearch")}
                  aria-label={t("filterTagSearch")}
                  className="h-10 min-h-10"
                />
                <ul
                  className="mt-2 max-h-56 overflow-y-auto"
                  data-testid="asset-tag-filter-list"
                >
                  {tagOptions.length === 0 ? (
                    <li className="px-1 py-2 text-sm text-muted-foreground">
                      {t("filterTagNone")}
                    </li>
                  ) : (
                    tagOptions.map((tag) => {
                      const on = tagFilters.includes(tag);
                      return (
                        <li key={tag}>
                          <Button
                            type="button"
                            variant={on ? "outline" : "ghost"}
                            className="h-9 w-full justify-start font-normal"
                            data-testid={`asset-tag-filter-opt-${tag}`}
                            aria-pressed={on}
                            onClick={() => toggleTagFilter(tag)}
                          >
                            {tag}
                          </Button>
                        </li>
                      );
                    })
                  )}
                </ul>
                {tagFilters.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    data-testid="asset-tag-filter-clear"
                    onClick={() => setTagFilters([])}
                  >
                    {t("clearTagFilter")}
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>
            {tagFilters.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tagFilters.map((tag) => (
                  <Badge
                    key={tag}
                    variant="default"
                    className={`cursor-pointer ${tagColorClass(tag, colorMap)}`}
                    data-testid={`asset-tag-chip-${tag}`}
                    onClick={() => toggleTagFilter(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="asset-tag-colors-toggle">{t("tagColors")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="asset-tag-colors-toggle"
                  type="button"
                  variant="outline"
                  data-testid="asset-tag-colors-toggle"
                  className="h-10 min-h-10 w-full justify-start font-normal"
                  aria-label={t("tagColors")}
                >
                  {t("tagColors")}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(24rem,calc(100vw-2rem))] p-3"
              >
                <ul
                  className="flex flex-col gap-2"
                  data-testid="asset-tag-colors"
                >
                  {allTags.map((tag) => (
                    <li
                      key={tag}
                      className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1"
                    >
                      <Badge
                        variant="default"
                        className={tagColorClass(tag, colorMap)}
                      >
                        {tag}
                      </Badge>
                      <div
                        className="flex gap-1"
                        role="group"
                        aria-label={t("tagColorFor", { tag })}
                      >
                        {TAG_COLOR_KEYS.map((key) => (
                          <Button
                            key={key}
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 min-h-6 p-0"
                            data-testid={`asset-tag-color-${tag}-${key}`}
                            aria-label={t("tagColorPick", { tag, color: key })}
                            aria-pressed={(colorMap[tag] ?? "gray") === key}
                            onClick={() =>
                              colorMut.mutate({ [tag]: key })
                            }
                          >
                            <span
                              className={`block h-3.5 w-3.5 rounded-full ${TAG_COLOR_DOT[key]} ${(colorMap[tag] ?? "gray") === key ? "ring-2 ring-ring ring-offset-1" : ""}`}
                            />
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
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
                            className={`cursor-pointer ${tagColorClass(tag, colorMap)}`}
                            onClick={() => toggleTagFilter(tag)}
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
