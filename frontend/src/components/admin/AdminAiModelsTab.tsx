import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  createAiModel,
  deleteAiModel,
  updateAiModel,
  type AiModelAdmin,
  type AiProviderAdmin,
} from "@/api/admin";
import { AdminAiField } from "@/components/admin/AdminAiField";
import { AdminAiModelList } from "@/components/admin/AdminAiModelList";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

export function AdminAiModelsTab({
  providers,
  models,
}: {
  readonly providers: readonly AiProviderAdmin[];
  readonly models: readonly AiModelAdmin[];
}) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [publicId, setPublicId] = useState("sinexis/demo");
  const [upstreamId, setUpstreamId] = useState("openai/gpt-4o-mini");
  const [providerId, setProviderId] = useState("");
  const [priceIn, setPriceIn] = useState("1000");
  const [priceOut, setPriceOut] = useState("3000");
  const [editingModel, setEditingModel] = useState<AiModelAdmin | null>(null);
  const [editPublicId, setEditPublicId] = useState("");
  const [editUpstreamId, setEditUpstreamId] = useState("");
  const [editPriceIn, setEditPriceIn] = useState("");
  const [editPriceOut, setEditPriceOut] = useState("");

  const addModel = useMutation({
    mutationFn: () =>
      createAiModel({
        provider_id: providerId,
        public_id: publicId,
        upstream_id: upstreamId,
        price_idr_per_1k_in: Number(priceIn),
        price_idr_per_1k_out: Number(priceOut),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-ai-models"] }),
  });
  const saveModel = useMutation({
    mutationFn: () => {
      if (!editingModel) throw new Error("no model");
      return updateAiModel(editingModel.id, {
        public_id: editPublicId,
        upstream_id: editUpstreamId,
        price_idr_per_1k_in: Number(editPriceIn),
        price_idr_per_1k_out: Number(editPriceOut),
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("aiTabModels")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <AdminAiField id="ai-m-in" label={t("aiPriceIn")} value={priceIn} onChange={setPriceIn} />
          <AdminAiField id="ai-m-out" label={t("aiPriceOut")} value={priceOut} onChange={setPriceOut} />
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
            setEditPriceIn(String(m.price_idr_per_1k_in));
            setEditPriceOut(String(m.price_idr_per_1k_out));
          }}
          onCancelEdit={() => setEditingModel(null)}
          onSave={() => saveModel.mutate()}
          onDelete={(id) => delModel.mutate(id)}
        />
      </CardContent>
    </Card>
  );
}
