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
import {
  formatIdr,
  idrPer1kToUsdPer1m,
  parsePriceInput,
  usdPer1mToIdrPer1k,
  type AiPriceUnit,
} from "@/components/admin/aiFormat";
import { Boxes } from "lucide-react";
import { AdminAiField } from "@/components/admin/AdminAiField";
import { AdminAiFxCard } from "@/components/admin/AdminAiFxCard";
import { AdminAiModelList } from "@/components/admin/AdminAiModelList";
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

function formatUsdDraft(idrPer1k: number, usdIdr: number): string {
  return String(Number(idrPer1kToUsdPer1m(idrPer1k, usdIdr).toFixed(4)));
}

/** Re-expresses an in-progress draft in the newly selected unit; invalid input becomes empty. */
function convertDraft(
  raw: string,
  from: AiPriceUnit,
  to: AiPriceUnit,
  usdIdr: number,
): string {
  if (from === to) return raw;
  const parsed = parsePriceInput(raw);
  if (parsed == null) return "";
  return to === "usd_1m"
    ? formatUsdDraft(parsed, usdIdr)
    : String(usdPer1mToIdrPer1k(parsed, usdIdr));
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
  // A persisted USD unit has no FX rate at mount yet, so start those drafts empty
  // instead of showing IDR defaults under a USD label.
  const [priceIn, setPriceIn] = useState(() => (unit === "usd_1m" ? "" : "1000"));
  const [priceOut, setPriceOut] = useState(() => (unit === "usd_1m" ? "" : "3000"));
  const [editingModel, setEditingModel] = useState<AiModelAdmin | null>(null);
  const [editPublicId, setEditPublicId] = useState("");
  const [editUpstreamId, setEditUpstreamId] = useState("");
  const [editPriceIn, setEditPriceIn] = useState("");
  const [editPriceOut, setEditPriceOut] = useState("");

  const fxQ = useQuery({
    queryKey: ["admin-ai-fx"],
    queryFn: getAiFx,
    retry: false,
  });
  const usdIdr = fxQ.data?.rate ?? 0;
  const fxReady = usdIdr > 0;

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

  /** Storage is integer IDR per 1K, so a USD draft is converted (and rounded) before it is sent. */
  const toStoredPrice = (raw: string): number => {
    if (unit !== "usd_1m") return Number(raw);
    const parsed = parsePriceInput(raw);
    return parsed == null ? 0 : usdPer1mToIdrPer1k(parsed, usdIdr);
  };
  const toDisplayDraft = (idrPer1k: number): string => {
    if (unit !== "usd_1m") return String(idrPer1k);
    if (!fxReady) return "";
    return formatUsdDraft(idrPer1k, usdIdr);
  };
  const savedAsHint = (raw: string): string | null => {
    if (unit !== "usd_1m" || !fxReady) return null;
    const parsed = parsePriceInput(raw);
    if (parsed == null) return null;
    return t("aiFxSavedAs", {
      idr: formatIdr(usdPer1mToIdrPer1k(parsed, usdIdr)),
    });
  };
  const changeUnit = (next: AiPriceUnit) => {
    if (next === unit) return;
    const previous = unit;
    setUnit(next);
    writeStoredPriceUnit(next);
    if (!fxReady) return;
    const convert = (raw: string) => convertDraft(raw, previous, next, usdIdr);
    setPriceIn(convert(priceIn));
    setPriceOut(convert(priceOut));
    setEditPriceIn(convert(editPriceIn));
    setEditPriceOut(convert(editPriceOut));
  };

  const addModel = useMutation({
    mutationFn: () =>
      createAiModel({
        provider_id: providerId,
        public_id: publicId,
        upstream_id: upstreamId,
        price_idr_per_1k_in: toStoredPrice(priceIn),
        price_idr_per_1k_out: toStoredPrice(priceOut),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-ai-models"] }),
  });
  const saveModel = useMutation({
    mutationFn: () => {
      if (!editingModel) throw new Error("no model");
      return updateAiModel(editingModel.id, {
        public_id: editPublicId,
        upstream_id: editUpstreamId,
        price_idr_per_1k_in: toStoredPrice(editPriceIn),
        price_idr_per_1k_out: toStoredPrice(editPriceOut),
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
  const savedHintIn = savedAsHint(priceIn);
  const savedHintOut = savedAsHint(priceOut);

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
              disabled={!fxReady}
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
              label={priceLabelIn}
              value={priceIn}
              onChange={setPriceIn}
            />
            {savedHintIn ? (
              <p className="text-xs text-muted-foreground">{savedHintIn}</p>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <AdminAiField
              id="ai-m-out"
              label={priceLabelOut}
              value={priceOut}
              onChange={setPriceOut}
            />
            {savedHintOut ? (
              <p className="text-xs text-muted-foreground">{savedHintOut}</p>
            ) : null}
          </div>
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
          usdIdr={usdIdr}
          priceLabelIn={priceLabelIn}
          priceLabelOut={priceLabelOut}
          editingModel={editingModel}
          editPublicId={editPublicId}
          editUpstreamId={editUpstreamId}
          editPriceIn={editPriceIn}
          editPriceOut={editPriceOut}
          savePending={saveModel.isPending}
          onEditPublicId={setEditPublicId}
          onEditUpstreamId={setEditUpstreamId}
          onEditPriceIn={setEditPriceIn}
          onEditPriceOut={setEditPriceOut}
          onStartEdit={(m) => {
            setEditingModel(m);
            setEditPublicId(m.public_id);
            setEditUpstreamId(m.upstream_id);
            setEditPriceIn(toDisplayDraft(m.price_idr_per_1k_in));
            setEditPriceOut(toDisplayDraft(m.price_idr_per_1k_out));
          }}
          onCancelEdit={() => setEditingModel(null)}
          onSave={() => saveModel.mutate()}
          onDelete={(id) => delModel.mutate(id)}
        />
      </AdminShellBody>
    </AdminShell>
  );
}
