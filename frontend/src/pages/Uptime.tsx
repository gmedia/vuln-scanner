import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  pauseMonitor,
  updateMonitor,
  type UptimeCreatePayload,
  type UptimeMonitor,
} from "@/api/uptime";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { UptimeFiltersSection } from "@/components/uptime/UptimeFiltersSection";
import { UptimeKpiRow } from "@/components/uptime/UptimeKpiRow";
import { UptimeMonitorListCard } from "@/components/uptime/UptimeMonitorList";
import { UptimeMonitorSheet } from "@/components/uptime/UptimeMonitorSheet";
import {
  type UptimeStateFilter,
  type UptimeTypeFilter,
} from "@/components/uptime/UptimeFilterBar";
import { toastUptimeApiError } from "@/components/uptime/uptimeErrors";
import { toUptimeUpdatePayload } from "@/components/uptime/uptimeForm";

export default function Uptime() {
  const { t } = useTranslation("uptime");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [heartbeatUrl, setHeartbeatUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UptimeMonitor | null>(null);
  const [stateFilter, setStateFilter] = useState<UptimeStateFilter>("all");
  const [typeFilter, setTypeFilter] = useState<UptimeTypeFilter>("all");
  const [search, setSearch] = useState("");

  const list = useQuery({
    queryKey: ["uptime"],
    queryFn: listMonitors,
    refetchInterval: (q) => {
      const rows = q.state.data ?? [];
      return rows.some((m) => m.enabled && m.state === "unknown") ? 4000 : false;
    },
  });
  const items = useMemo(() => list.data ?? [], [list.data]);
  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const enabledCount = items.filter((m) => m.enabled).length;
  const atCap = enabledCount >= limit;

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

  const closeSheet = () => {
    setEditing(null);
    setHeartbeatUrl(null);
    setOpen(false);
  };

  const fillFromMonitor = (m: UptimeMonitor) => {
    setEditing(m);
    setHeartbeatUrl(null);
    setOpen(true);
  };

  const onApiError = (err: { response?: { data?: { detail?: unknown } } }) => {
    toastUptimeApiError(err, t("limitReached"));
  };

  const createMut = useMutation({
    mutationFn: createMonitor,
    onSuccess: (created) => {
      const hb = created.heartbeat_url ?? null;
      void qc.invalidateQueries({ queryKey: ["uptime"] });
      setEditing(null);
      if (!hb) setOpen(false);
      else setHeartbeatUrl(hb);
    },
    onError: onApiError,
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
      return updateMonitor(id, toUptimeUpdatePayload(payload));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["uptime"] });
      closeSheet();
    },
    onError: onApiError,
  });

  const formBusy = createMut.isPending || updateMut.isPending;

  const stateLabel = (state: string) => {
    if (state === "up") return t("stateUp");
    if (state === "down") return t("stateDown");
    if (state === "degraded") return t("stateDegraded");
    return t("stateUnknown");
  };

  const openCreate = () => {
    setEditing(null);
    setHeartbeatUrl(null);
    setOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="uptime-page">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button
            data-testid="uptime-add"
            className="min-h-11 sm:min-h-10"
            disabled={atCap}
            onClick={() => {
              if (open) closeSheet();
              else openCreate();
            }}
          >
            {t("add")}
          </Button>
        }
      />

      {items.length > 0 ? (
        <UptimeKpiRow
          upCount={items.filter((m) => m.state === "up").length}
          downCount={items.filter((m) => m.state === "down").length}
          enabledCount={enabledCount}
          limit={limit}
          sku={sku}
        />
      ) : null}

      {items.length > 0 ? (
        <UptimeFiltersSection
          stateFilter={stateFilter}
          onStateFilter={setStateFilter}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          search={search}
          onSearch={setSearch}
          filtersActive={filtersActive}
          filteredCount={filtered.length}
          totalCount={items.length}
        />
      ) : null}

      <UptimeMonitorSheet
        open={open}
        editing={editing}
        busy={formBusy}
        heartbeatUrl={heartbeatUrl}
        onOpenChange={(next) => {
          if (!next) closeSheet();
          else setOpen(true);
        }}
        onSave={(payload) => {
          if (editing) updateMut.mutate({ id: editing.id, payload });
          else createMut.mutate(payload);
        }}
      />

      {list.isLoading && items.length === 0 ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-sm tracking-wide">
              {t("tableTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-4">
            <TableRowSkeleton rows={5} />
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card data-testid="uptime-empty" className="overflow-hidden">
          <div className="h-0.5 bg-primary" aria-hidden />
          <CardContent className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-16 text-center md:min-h-[16rem] md:py-20">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
              <Activity className="h-6 w-6 text-primary" aria-hidden />
            </span>
            <p className="text-balance text-sm font-medium text-foreground">
              {t("empty")}
            </p>
            <p className="max-w-md text-balance text-sm text-muted-foreground">
              {t("emptyHint")}
            </p>
            <Button
              className="mt-2 min-h-11"
              data-testid="uptime-empty-cta"
              disabled={atCap}
              onClick={openCreate}
            >
              {t("emptyCta")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <UptimeMonitorListCard
          monitors={filtered}
          totalCount={items.length}
          onHistory={(id) => navigate(`/uptime/${id}`)}
          onEdit={fillFromMonitor}
          onPause={(id) => pauseMut.mutate(id)}
          onDelete={(id) => {
            if (window.confirm(t("confirmDelete"))) delMut.mutate(id);
          }}
          stateLabel={stateLabel}
        />
      )}
    </div>
  );
}
