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
  type TagColorValue,
} from "@/api/assets";
import {
  TAG_COLOR_DOT,
  tagColorClass,
  tagColorHex,
  tagColorStyle,
} from "@/lib/tagColors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent } from "@/components/ui/Card";
import PageHeader from "@/components/layout/PageHeader";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { Progress } from "@/components/ui/Progress";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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

type TypeFilter = "all" | "ip" | "domain";

async function downloadPackJson() {
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
}

async function downloadPackHtml() {
  const blob = await fetchAssetPackHtml();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "assets-pack.html";
  a.click();
  URL.revokeObjectURL(url);
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
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

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
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      if (typeFilter !== "all" && a.scan_type !== typeFilter) return false;
      if (q) {
        const hay = `${a.name} ${a.target}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tagFilters.length === 0) return true;
      return (a.tags ?? []).some((tag) => tagFilters.includes(tag));
    });
  }, [items, tagFilters, search, typeFilter]);
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

  function clearFilters() {
    setTagFilters([]);
    setSearch("");
    setTypeFilter("all");
  }

  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const atCap = items.length >= limit;
  const quotaPct =
    limit > 0 ? Math.min(100, Math.round((items.length / limit) * 100)) : 0;

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
    mutationFn: (payload: Record<string, TagColorValue>) =>
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

  function saveAsset() {
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
  }

  function tagBadges(a: ScanAsset) {
    if ((a.tags ?? []).length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {a.tags.map((tag) => (
          <Button
            key={tag}
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-0"
            onClick={() => toggleTagFilter(tag)}
          >
            <Badge
              variant="default"
              data-testid={`asset-tag-${tag}`}
              className={tagColorClass(tag, colorMap)}
              style={tagColorStyle(tag, colorMap)}
            >
              {tag}
            </Badge>
          </Button>
        ))}
      </div>
    );
  }

  function rowMenu(a: ScanAsset) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-9 w-9 p-0"
            data-testid={`asset-menu-${a.id}`}
            aria-label={t("actionsMenu")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            data-testid={`asset-edit-${a.id}`}
            onSelect={() => startEdit(a)}
          >
            {t("edit")}
          </DropdownMenuItem>
          {!a.schedule_id ? (
            <DropdownMenuItem
              data-testid={`asset-schedule-${a.id}`}
              onSelect={() => schedMut.mutate(a.id)}
            >
              {t("schedule")}
            </DropdownMenuItem>
          ) : null}
          {a.scan_type === "domain" ? (
            <DropdownMenuItem asChild>
              <Link to="/uptime" data-testid="assets-watch-http">
                {t("watchHttp")}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            data-testid={`asset-delete-${a.id}`}
            onSelect={() => {
              if (window.confirm(t("confirmDelete"))) delMut.mutate(a.id);
            }}
          >
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function guardCell(a: ScanAsset) {
    if (!a.guard_agent_id) {
      return <span className="text-muted-foreground">—</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info" data-testid={`asset-guard-chip-${a.id}`}>
          {t("guardLinked", {
            name: a.guard_agent_name ?? a.guard_agent_id,
          })}
        </Badge>
        <Button variant="link" size="sm" className="h-auto p-0" asChild>
          <Link to="/guard">{t("openGuard")}</Link>
        </Button>
      </div>
    );
  }

  const formFields = (
    <div className="space-y-3 px-4">
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
          onValueChange={(value) => setScanType(value as "ip" | "domain")}
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
            <SelectItem value="domain">{t("typeDomain")}</SelectItem>
            <SelectItem value="ip">{t("typeIp")}</SelectItem>
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
    </div>
  );

  return (
    <div className="space-y-6" data-testid="assets-page">
      <PageHeader
        title={t("title")}
        description={
          <>
            <span className="block">{t("subtitle")}</span>
            <div className="mt-2 flex max-w-xs flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t("skuLabel", { sku, count: items.length, limit })}
              </span>
              <Progress value={quotaPct} className="h-1.5" />
            </div>
          </>
        }
        actions={
          <>
            {items.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="min-h-10">
                    {t("exportPack")}
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    data-testid="assets-pack"
                    onSelect={() => {
                      void downloadPackJson();
                    }}
                  >
                    {t("pack")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="assets-pack-html"
                    onSelect={() => {
                      void downloadPackHtml();
                    }}
                  >
                    {t("packHtml")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {items.length > 0 || open ? (
              <Button
                data-testid="assets-add"
                className="min-h-11 sm:min-h-10"
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
            ) : null}
          </>
        }
      />

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) resetForm();
          else setOpen(true);
        }}
      >
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? t("editTitle") : t("add")}</SheetTitle>
          </SheetHeader>
          {formFields}
          <SheetFooter>
            <Button
              data-testid="asset-save"
              disabled={
                !name.trim() ||
                (!editing && !target.trim()) ||
                createMut.isPending ||
                updateMut.isPending
              }
              onClick={saveAsset}
            >
              {t("save")}
            </Button>
            <Button variant="outline" onClick={resetForm}>
              {t("cancel")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {items.length > 0 ? (
        <div
          data-testid="assets-filters"
          className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="asset-search">{t("search")}</Label>
            <Input
              id="asset-search"
              data-testid="asset-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-10 min-h-10"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="asset-type-filter">{t("type")}</Label>
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as TypeFilter)}
            >
              <SelectTrigger
                id="asset-type-filter"
                data-testid="asset-type-filter"
                aria-label={t("type")}
                className="h-10 min-h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("typeAll")}</SelectItem>
                <SelectItem value="domain">{t("typeDomain")}</SelectItem>
                <SelectItem value="ip">{t("typeIp")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {allTags.length > 0 ? (
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
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}
          {allTags.length > 0 ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="asset-tag-colors-toggle">{t("manageColors")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="asset-tag-colors-toggle"
                    type="button"
                    variant="outline"
                    data-testid="asset-tag-colors-toggle"
                    className="h-10 min-h-10 w-full justify-start font-normal"
                    aria-label={t("manageColors")}
                  >
                    {t("manageColors")}
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
                          style={tagColorStyle(tag, colorMap)}
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
                              aria-label={t("tagColorPick", {
                                tag,
                                color: key,
                              })}
                              aria-pressed={(colorMap[tag] ?? "gray") === key}
                              onClick={() => colorMut.mutate({ [tag]: key })}
                            >
                              <span
                                className={`block h-3.5 w-3.5 rounded-full ${TAG_COLOR_DOT[key]} ${(colorMap[tag] ?? "gray") === key ? "ring-2 ring-ring ring-offset-1" : ""}`}
                              />
                            </Button>
                          ))}
                          <Label
                            htmlFor={`asset-tag-picker-${tag}`}
                            className="sr-only"
                          >
                            {t("tagColorPicker", { tag })}
                          </Label>
                          <input
                            id={`asset-tag-picker-${tag}`}
                            type="color"
                            className="h-6 w-6 cursor-pointer rounded-md border border-border bg-transparent p-0"
                            data-testid={`asset-tag-color-picker-${tag}`}
                            aria-label={t("tagColorPicker", { tag })}
                            value={tagColorHex(tag, colorMap)}
                            onChange={(e) =>
                              colorMut.mutate({
                                [tag]: e.target
                                  .value
                                  .toLowerCase() as TagColorValue,
                              })
                            }
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            </div>
          ) : null}
          {tagFilters.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 sm:col-span-2 lg:col-span-4">
              {tagFilters.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => toggleTagFilter(tag)}
                >
                  <Badge
                    variant="default"
                    className={tagColorClass(tag, colorMap)}
                    data-testid={`asset-tag-chip-${tag}`}
                  >
                    {tag} ×
                  </Badge>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {list.isLoading ? (
        <div data-testid="assets-loading">
          <TableRowSkeleton rows={5} />
        </div>
      ) : items.length === 0 ? (
        <Card data-testid="assets-empty">
          <CardContent className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-16 text-center md:min-h-[16rem] md:py-20">
            <p className="text-balance text-sm font-medium text-foreground">
              {t("empty")}
            </p>
            <p className="max-w-md text-balance text-sm text-muted-foreground">
              {t("emptyHint")}
            </p>
            <Button
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
        <Card data-testid="assets-no-match">
          <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("noTagMatch")}</p>
            <Button
              type="button"
              variant="outline"
              data-testid="assets-clear-filters"
              onClick={clearFilters}
            >
              {t("clearFilters")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("target")}</TableHead>
                  <TableHead>{t("tags")}</TableHead>
                  <TableHead>{t("colSchedule")}</TableHead>
                  <TableHead>{t("colGuard")}</TableHead>
                  <TableHead className="w-12 text-right">
                    <span className="sr-only">{t("colActions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((a: ScanAsset) => (
                  <TableRow key={a.id} className="h-12">
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.scan_type === "ip" ? t("typeIp") : t("typeDomain")}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {a.target}
                    </TableCell>
                    <TableCell>{tagBadges(a)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.schedule_id ? t("hasSchedule") : "—"}
                    </TableCell>
                    <TableCell>{guardCell(a)}</TableCell>
                    <TableCell className="text-right">{rowMenu(a)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
      )}
    </div>
  );
}
