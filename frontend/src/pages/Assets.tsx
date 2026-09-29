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
  updateAsset,
  type ScanAsset,
  type TagColorValue,
} from "@/api/assets";
import { tagColorClass, tagColorStyle } from "@/lib/tagColors";
import { AssetFilters } from "@/components/assets/AssetFilters";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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

  function tagBadges(a: ScanAsset, testIdPrefix = "asset-tag") {
    if ((a.tags ?? []).length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {a.tags.map((tag) => (
          <Button
            key={tag}
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto min-h-11 p-0 md:min-h-0"
            onClick={() => toggleTagFilter(tag)}
          >
            <Badge
              variant="default"
              data-testid={`${testIdPrefix}-${tag}`}
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

  function rowMenu(a: ScanAsset, surface: "card" | "row" = "row") {
    const tid = (base: string) =>
      surface === "card" ? `${base}-card` : base;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-11 w-11 min-h-11 min-w-11 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
            data-testid={tid(`asset-menu-${a.id}`)}
            aria-label={t("actionsMenu")}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            data-testid={tid(`asset-edit-${a.id}`)}
            onSelect={() => startEdit(a)}
          >
            {t("edit")}
          </DropdownMenuItem>
          {!a.schedule_id ? (
            <DropdownMenuItem
              data-testid={tid(`asset-schedule-${a.id}`)}
              onSelect={() => schedMut.mutate(a.id)}
            >
              {t("schedule")}
            </DropdownMenuItem>
          ) : null}
          {a.scan_type === "domain" ? (
            <DropdownMenuItem asChild>
              <Link to="/uptime" data-testid={tid("assets-watch-http")}>
                {t("watchHttp")}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            data-testid={tid(`asset-delete-${a.id}`)}
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
            {items.length > 0 ? (
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

      {list.isLoading ? (
        <Card data-testid="assets-loading">
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
      ) : (
        <Card data-testid="assets-list">
          <CardHeader className="flex flex-col gap-0 space-y-0 border-b border-border p-3">
            <CardTitle className="sr-only">{t("tableTitle")}</CardTitle>
            <AssetFilters
              search={search}
              typeFilter={typeFilter}
              allTags={allTags}
              tagOptions={tagOptions}
              tagFilters={tagFilters}
              tagQuery={tagQuery}
              colorMap={colorMap}
              onSearch={setSearch}
              onTypeFilter={setTypeFilter}
              onToggleTag={toggleTagFilter}
              onClearTags={() => setTagFilters([])}
              onTagQuery={setTagQuery}
              onPickColor={(tag, color) => colorMut.mutate({ [tag]: color })}
              onClearAll={clearFilters}
              counts={{ shown: visible.length, total: items.length }}
            />
          </CardHeader>
          <CardContent className="p-0">
            {visible.length === 0 ? (
              <div
                className="flex min-h-[8rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center"
                data-testid="assets-no-match"
              >
                <p className="text-sm text-muted-foreground">{t("noTagMatch")}</p>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="assets-clear-filters"
                  onClick={clearFilters}
                >
                  {t("clearFilters")}
                </Button>
              </div>
            ) : (
              <>
               <div className="space-y-2 p-3 md:hidden" data-testid="assets-list-mobile">
                {visible.map((a: ScanAsset) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-border bg-card p-3"
                    data-testid={`asset-card-${a.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-medium text-foreground">
                        {a.name}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {a.scan_type === "ip" ? t("typeIp") : t("typeDomain")}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs tabular-nums text-muted-foreground">
                      {a.target}
                    </p>
                    {(a.tags ?? []).length > 0 || a.guard_agent_id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {tagBadges(a, "asset-tag-card")}
                        {a.guard_agent_id ? (
                          <>
                            <Badge
                              variant="info"
                              data-testid={`asset-guard-chip-${a.id}-card`}
                            >
                              {t("guardLinked", {
                                name: a.guard_agent_name ?? a.guard_agent_id,
                              })}
                            </Badge>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto min-h-11 p-0 md:min-h-0"
                              asChild
                            >
                              <Link to="/guard">{t("openGuard")}</Link>
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{a.schedule_id ? t("hasSchedule") : "—"}</span>
                      {rowMenu(a, "card")}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block" data-testid="assets-list-desktop">
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
              </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
