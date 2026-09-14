import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  listSamples,
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
import { UptimeHistoryPanel } from "@/components/uptime/UptimeHistoryPanel";
import { UptimeKpiRow } from "@/components/uptime/UptimeKpiRow";
import { UptimeMonitorListCard } from "@/components/uptime/UptimeMonitorList";
import { UptimeMonitorSheet } from "@/components/uptime/UptimeMonitorSheet";
import {
  type UptimeStateFilter,
  type UptimeTypeFilter,
} from "@/components/uptime/UptimeFilterBar";
import { toastUptimeApiError } from "@/components/uptime/uptimeErrors";

export { explainUptimeError, mapUptimeError } from "@/components/uptime/uptimeErrors";

export default function Uptime() {
  const { t } = useTranslation("uptime");
  const qc = useQueryClient();
  const [heartbeatUrl, setHeartbeatUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UptimeMonitor | null>(null);
  const [stateFilter, setStateFilter] = useState<UptimeStateFilter>("all");
  const [typeFilter, setTypeFilter] = useState<UptimeTypeFilter>("all");
  const [search, setSearch] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["uptime"],
    queryFn: listMonitors,
    refetchInterval: (q) => {
      const rows = q.state.data ?? [];
      return rows.some((m) => m.enabled && m.state === "unknown") ? 4000 : false;
    },
  });
  const items = list.data ?? [];
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
      const { check_type: _checkType, target: _target, ...rest } = payload;
      return updateMonitor(id, rest);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["uptime"] });
      closeSheet();
    },
    onError: onApiError,
  });

  const historyQuery = useQuery({
    queryKey: ["uptime-samples", historyId],
    queryFn: () => listSamples(historyId as string),
    enabled: Boolean(historyId),
  });
  const historyMonitor = items.find((m) => m.id === historyId);
  const historyRows = (historyQuery.data ?? []).slice(0, 24);
  const formBusy = createMut.isPending || updateMut.isPending;

  const stateLabel = (state: string) => {
    if (state === "up") return t("stateUp");
    if (state === "down") return t("stateDown");
    if (state === "degraded") return t("stateDegraded");
    return t("stateUnknown");
  };

  return (
    <div className="space-y-6" data-testid="uptime-page">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Button
            data-testid="uptime-add"
            disabled={atCap}
            onClick={() => {
              if (open) closeSheet();
              else {
                setEditing(null);
                setHeartbeatUrl(null);
                setOpen(true);
              }
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
        <Card>
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
        <Card data-testid="uptime-empty">
          <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <p className="text-sm font-medium text-foreground">{t("empty")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("emptyHint")}
            </p>
            <Button
              className="mt-2"
              data-testid="uptime-empty-cta"
              disabled={atCap}
              onClick={() => {
                setEditing(null);
                setHeartbeatUrl(null);
                setOpen(true);
              }}
            >
              {t("emptyCta")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <UptimeMonitorListCard
          monitors={filtered}
          onHistory={(id) => setHistoryId((cur) => (cur === id ? null : id))}
          onEdit={fillFromMonitor}
          onPause={(id) => pauseMut.mutate(id)}
          onDelete={(id) => {
            if (window.confirm(t("confirmDelete"))) delMut.mutate(id);
          }}
          stateLabel={stateLabel}
        />
      )}

      {historyId && historyMonitor ? (
        <UptimeHistoryPanel
          monitor={historyMonitor}
          rows={historyRows}
          loading={historyQuery.isLoading}
        />
      ) : null}
    </div>
  );
}
