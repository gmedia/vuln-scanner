import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  createAsset,
  createAssetSchedule,
  deleteAsset,
  fetchTagColors,
  listAssets,
  patchTagColors,
  updateAsset,
  type ScanAsset,
  type TagColorValue,
} from "@/api/assets";
import {
  mapAssetError,
  parseScanType,
  parseTags,
  type AssetScanType,
  type TypeFilter,
} from "@/components/assets/assetChrome";

export function useAssetsPage() {
  const { t } = useTranslation("assets");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [scanType, setScanType] = useState<AssetScanType>("domain");
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

  function startEdit(asset: ScanAsset) {
    setEditing(asset);
    setName(asset.name);
    setTarget(asset.target);
    setScanType(parseScanType(asset.scan_type));
    setNotes(asset.notes ?? "");
    setTagsInput((asset.tags ?? []).join(", "));
    setOpen(true);
  }

  const list = useQuery({ queryKey: ["assets"], queryFn: () => listAssets() });
  const colorsQ = useQuery({
    queryKey: ["asset-tag-colors"],
    queryFn: fetchTagColors,
  });
  const colorMap = colorsQ.data ?? {};
  const items = useMemo(() => list.data ?? [], [list.data]);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const asset of items) {
      for (const tag of asset.tags ?? []) s.add(tag);
    }
    return [...s].sort();
  }, [items]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((asset) => {
      if (typeFilter !== "all" && asset.scan_type !== typeFilter) return false;
      if (q) {
        const hay = `${asset.name} ${asset.target}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tagFilters.length === 0) return true;
      return (asset.tags ?? []).some((tag) => tagFilters.includes(tag));
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

  function clearTagFilters() {
    setTagFilters([]);
  }

  function clearFilters() {
    setTagFilters([]);
    setSearch("");
    setTypeFilter("all");
  }

  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const atCap = items.length >= limit;
  const scheduled = items.filter((asset) => asset.schedule_id).length;
  const domains = items.filter((asset) => asset.scan_type === "domain").length;
  const ips = items.filter((asset) => asset.scan_type === "ip").length;

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
        payload: { name: name.trim(), notes: notesVal, tags },
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

  function openAdd() {
    if (open) {
      resetForm();
      return;
    }
    setEditing(null);
    setOpen(true);
  }

  return {
    t,
    name,
    target,
    scanType,
    notes,
    tagsInput,
    open,
    editing,
    tagFilters,
    tagQuery,
    search,
    typeFilter,
    colorMap,
    items,
    allTags,
    visible,
    tagOptions,
    sku,
    limit,
    atCap,
    scheduled,
    domains,
    ips,
    list,
    createMut,
    updateMut,
    setName,
    setTarget,
    setScanType,
    setNotes,
    setTagsInput,
    setTagQuery,
    setSearch,
    setTypeFilter,
    resetForm,
    startEdit,
    toggleTagFilter,
    clearTagFilters,
    clearFilters,
    saveAsset,
    openAdd,
    setOpen,
    delMut,
    colorMut,
    schedMut,
  };
}
