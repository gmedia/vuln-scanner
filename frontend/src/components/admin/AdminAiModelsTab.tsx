import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  createAiModel,
  deleteAiModel,
  getAiFx,
  refreshAiFx,
  setAiFxManual,
  updateAiModel,
  type AiModelAdmin,
  type AiProviderAdmin,
} from "@/api/admin";
import { parsePriceInput, type AiPriceUnit } from "@/components/admin/aiFormat";
import { Boxes } from "lucide-react";
import { AdminAiField } from "@/components/admin/AdminAiField";
import { AdminAiFxCard } from "@/components/admin/AdminAiFxCard";
import { AdminAiModelList } from "@/components/admin/AdminAiModelList";
import { AdminAiUpstreamSheet } from "@/components/admin/AdminAiUpstreamSheet";
import { Button } from "@/components/ui/Button";
import {
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

const AI_PRICE_UNIT_KEY = "sinexis.admin.aiPriceUnit";

function isAiPriceUnit(value: string): value is AiPriceUnit {
  return value === "idr_1k" || value === "usd_1m";
}

function readStoredPriceUnit(): AiPriceUnit {
  try {
    const raw = window.localStorage.getItem(AI_PRICE_UNIT_KEY);
    if (raw != null && isAiPriceUnit(raw)) return raw;
  } catch {
    // localStorage may be unavailable (private mode or a jsdom without storage).
  }
  return "idr_1k";
}

function writeStoredPriceUnit(unit: AiPriceUnit): void {
  try {
    window.localStorage.setItem(AI_PRICE_UNIT_KEY, unit);
  } catch {
    // Persisting is a nicety; the in-session toggle still works without it.
  }
}

function usdDraft(usd: number | null | undefined): string {
  if (usd == null) return "";
  return String(Number(usd.toFixed(4)));
}

function usdInput(raw: string): number {
  return parsePriceInput(raw) ?? 0;
}

export function AdminAiModelsTab({
  providers,
  models,
}: {
  readonly providers: readonly AiProviderAdmin[];
  readonly models: readonly AiModelAdmin[];
}) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [unit, setUnit] = useState<AiPriceUnit>(readStoredPriceUnit);
  const [publicId, setPublicId] = useState("sinexis/demo");
  const [upstreamId, setUpstreamId] = useState("openai/gpt-4o-mini");
  const [providerId, setProviderId] = useState("");
  const [priceIn, setPriceIn] = useState("0.15");
  const [priceOut, setPriceOut] = useState("0.60");
  const [hppIn, setHppIn] = useState("0");
  const [hppOut, setHppOut] = useState("0");
  const [editingModel, setEditingModel] = useState<AiModelAdmin | null>(null);
  const [upstreamTarget, setUpstreamTarget] = useState<AiModelAdmin | null>(
    null,
  );
  const [editPublicId, setEditPublicId] = useState("");
  const [editUpstreamId, setEditUpstreamId] = useState("");
  const [editPriceIn, setEditPriceIn] = useState("");
  const [editPriceOut, setEditPriceOut] = useState("");
  const [editHppIn, setEditHppIn] = useState("");
  const [editHppOut, setEditHppOut] = useState("");

  const fxQ = useQuery({
    queryKey: ["admin-ai-fx"],
    queryFn: getAiFx,
    retry: false,
  });

  const refreshFx = useMutation({
    mutationFn: () => refreshAiFx(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-ai-fx"] });
      toast.success(t("aiFxRefreshOk"));
    },
    onError: () => toast.error(t("aiFxRefreshFail")),
  });
  const saveManualFx = useMutation({
    mutationFn: (rate: number) => setAiFxManual(rate),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-ai-fx"] });
      toast.success(t("aiFxManualOk"));
    },
    onError: () => toast.error(t("aiFxManualFail")),
  });

  const changeUnit = (next: AiPriceUnit) => {
    if (next === unit) return;
    setUnit(next);
    writeStoredPriceUnit(next);
  };

  const addModel = useMutation({
    mutationFn: () =>
      createAiModel({
        provider_id: providerId,
        public_id: publicId,
        upstream_id: upstreamId,
        price_usd_per_1m_in: usdInput(priceIn),
        price_usd_per_1m_out: usdInput(priceOut),
        hpp_usd_per_1m_in: usdInput(hppIn),
        hpp_usd_per_1m_out: usdInput(hppOut),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-ai-models"] }),
  });
  const saveModel = useMutation({
    mutationFn: () => {
      if (!editingModel) throw new Error("no model");
      return updateAiModel(editingModel.id, {
        public_id: editPublicId,
        upstream_id: editUpstreamId,
        price_usd_per_1m_in: usdInput(editPriceIn),
        price_usd_per_1m_out: usdInput(editPriceOut),
        hpp_usd_per_1m_in: usdInput(editHppIn),
        hpp_usd_per_1m_out: usdInput(editHppOut),
      });
    },
    onSuccess: () => {
      setEditingModel(null);
      void qc.invalidateQueries({ queryKey: ["admin-ai-models"] });
    },
  });
  const delModel = useMutation({
    mutationFn: (id: string) => deleteAiModel(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-ai-models"] }),
  });

  const priceLabelIn = t(unit === "usd_1m" ? "aiPriceInUsd" : "aiPriceIn");
  const priceLabelOut = t(unit === "usd_1m" ? "aiPriceOutUsd" : "aiPriceOut");

  const handleUpstreamChanged = (updated: AiModelAdmin) => {
    qc.setQueryData<{ items: AiModelAdmin[]; total: number }>(
      ["admin-ai-models"],
      (old) =>
        old
          ? {
              ...old,
              items: old.items.map((m) => (m.id === updated.id ? updated : m)),
            }
          : old,
    );
  };

  return (
    <AdminShell tone="primary">
      <AdminShellHead icon={Boxes} title={t("aiTabModels")} />
      <AdminShellBody className="space-y-4">
        <AdminAiFxCard
          fx={fxQ.data}
          loading={fxQ.isLoading}
          refreshing={refreshFx.isPending}
          saving={saveManualFx.isPending}
          onRefresh={() => refreshFx.mutate()}
          onSaveManual={(rate) => saveManualFx.mutate(rate)}
          refreshDisabled={!fxQ.data?.auto_fetch_enabled}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ai-m-provider">{t("aiProviderId")}</Label>
            <Select value={providerId || undefined} onValueChange={setProviderId}>
              <SelectTrigger id="ai-m-provider" className="h-10 min-h-10">
                <SelectValue placeholder={t("aiSelectProvider")} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AdminAiField id="ai-m-pub" label={t("aiPublicId")} value={publicId} onChange={setPublicId} />
          <AdminAiField id="ai-m-up" label={t("aiUpstreamId")} value={upstreamId} onChange={setUpstreamId} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="ai-m-unit">{t("aiPriceUnit")}</Label>
            <Select
              value={unit}
              onValueChange={(value) => {
                if (isAiPriceUnit(value)) changeUnit(value);
              }}
            >
              <SelectTrigger id="ai-m-unit" className="h-10 min-h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="idr_1k">{t("aiPriceUnitIdr")}</SelectItem>
                <SelectItem value="usd_1m">{t("aiPriceUnitUsd")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <AdminAiField
              id="ai-m-in"
              label={t("aiPriceInUsd")}
              value={priceIn}
              onChange={setPriceIn}
            />
            <p className="text-xs text-muted-foreground">{t("aiFxChargeFollowsRate")}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <AdminAiField
              id="ai-m-out"
              label={t("aiPriceOutUsd")}
              value={priceOut}
              onChange={setPriceOut}
            />
          </div>
          <AdminAiField id="ai-m-hpp-in" label={t("aiHppInUsd")} value={hppIn} onChange={setHppIn} />
          <AdminAiField id="ai-m-hpp-out" label={t("aiHppOutUsd")} value={hppOut} onChange={setHppOut} />
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => addModel.mutate()}
          disabled={addModel.isPending || !providerId}
        >
          {t("aiAddModel")}
        </Button>
        <AdminAiModelList
          models={models}
          unit={unit}
          priceLabelIn={priceLabelIn}
          priceLabelOut={priceLabelOut}
          editingModel={editingModel}
          editPublicId={editPublicId}
          editUpstreamId={editUpstreamId}
          editPriceIn={editPriceIn}
          editPriceOut={editPriceOut}
          editHppIn={editHppIn}
          editHppOut={editHppOut}
          savePending={saveModel.isPending}
          onEditPublicId={setEditPublicId}
          onEditUpstreamId={setEditUpstreamId}
          onEditPriceIn={setEditPriceIn}
          onEditPriceOut={setEditPriceOut}
          onEditHppIn={setEditHppIn}
          onEditHppOut={setEditHppOut}
          onStartEdit={(m) => {
            setEditingModel(m);
            setEditPublicId(m.public_id);
            setEditUpstreamId(m.upstream_id);
            setEditPriceIn(usdDraft(m.price_usd_per_1m_in));
            setEditPriceOut(usdDraft(m.price_usd_per_1m_out));
            setEditHppIn(usdDraft(m.hpp_usd_per_1m_in));
            setEditHppOut(usdDraft(m.hpp_usd_per_1m_out));
          }}
          onCancelEdit={() => setEditingModel(null)}
          onSave={() => saveModel.mutate()}
          onDelete={(id) => delModel.mutate(id)}
          onManageUpstreams={setUpstreamTarget}
        />
        <AdminAiUpstreamSheet
          model={upstreamTarget}
          providers={providers}
          open={upstreamTarget !== null}
          onOpenChange={(next) => {
            if (!next) setUpstreamTarget(null);
          }}
          onChanged={handleUpstreamChanged}
        />
      </AdminShellBody>
    </AdminShell>
  );
}
