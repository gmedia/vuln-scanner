import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { apiErrorMessage } from "@/api/apiErrors";
import {
  createAiProvider,
  deleteAiProvider,
  updateAiProvider,
  type AiProviderAdmin,
} from "@/api/admin";
import { Server } from "lucide-react";
import { AdminAiField } from "@/components/admin/AdminAiField";
import { AdminAiProviderList } from "@/components/admin/AdminAiProviderList";
import { Button } from "@/components/ui/Button";
import {
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";

export function AdminAiProvidersTab({
  providers,
}: {
  readonly providers: readonly AiProviderAdmin[];
}) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const [provName, setProvName] = useState("OpenRouter");
  const [provUrl, setProvUrl] = useState("https://openrouter.ai/api/v1");
  const [provCred, setProvCred] = useState("");
  const [editingProv, setEditingProv] = useState<AiProviderAdmin | null>(null);
  const [editProvName, setEditProvName] = useState("");
  const [editProvUrl, setEditProvUrl] = useState("");
  const [editProvCred, setEditProvCred] = useState("");

  const addProv = useMutation({
    mutationFn: () =>
      createAiProvider({
        name: provName,
        base_url: provUrl,
        credential: provCred,
      }),
    onSuccess: () => {
      toast.success(t("aiProviderCreated"));
      void qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("aiProviderCreateFail"))),
  });
  const saveProv = useMutation({
    mutationFn: () => {
      if (!editingProv) throw new Error("no provider");
      return updateAiProvider(editingProv.id, {
        name: editProvName,
        base_url: editProvUrl,
        ...(editProvCred.trim() ? { credential: editProvCred } : {}),
      });
    },
    onSuccess: () => {
      setEditingProv(null);
      toast.success(t("aiProviderSaved"));
      void qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("aiProviderSaveFail"))),
  });
  const delProv = useMutation({
    mutationFn: (id: string) => deleteAiProvider(id),
    onSuccess: () => {
      toast.success(t("aiProviderDeleted"));
      void qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("aiProviderDeleteFail"))),
  });
  const toggleProv = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { enabled: boolean; status?: string } }) =>
      updateAiProvider(id, body),
    onSuccess: () => {
      toast.success(t("aiProviderToggled"));
      void qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, t("aiProviderUpdateFail"))),
  });

  return (
    <AdminShell tone="primary">
      <AdminShellHead icon={Server} title={t("aiTabProviders")} />
      <AdminShellBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AdminAiField id="ai-p-name" label={t("aiName")} value={provName} onChange={setProvName} />
          <AdminAiField id="ai-p-url" label={t("aiBaseUrl")} value={provUrl} onChange={setProvUrl} />
          <AdminAiField
            id="ai-p-cred"
            label={t("aiCredential")}
            value={provCred}
            onChange={setProvCred}
            type="password"
          />
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => addProv.mutate()}
          disabled={addProv.isPending}
        >
          {t("aiAddProvider")}
        </Button>
        <AdminAiProviderList
          providers={providers}
          editingProv={editingProv}
          editProvName={editProvName}
          editProvUrl={editProvUrl}
          editProvCred={editProvCred}
          savePending={saveProv.isPending}
          togglePending={toggleProv.isPending}
          onEditName={setEditProvName}
          onEditUrl={setEditProvUrl}
          onEditCred={setEditProvCred}
          onStartEdit={(p) => {
            setEditingProv(p);
            setEditProvName(p.name);
            setEditProvUrl(p.base_url);
            setEditProvCred("");
          }}
          onCancelEdit={() => setEditingProv(null)}
          onSave={() => saveProv.mutate()}
          onToggleEnabled={(p, enabled) =>
            toggleProv.mutate({
              id: p.id,
              body: enabled
                ? { enabled: true, ...(p.status === "disabled" ? { status: "ok" } : {}) }
                : { enabled: false },
            })
          }
          onDelete={(id) => delProv.mutate(id)}
        />
      </AdminShellBody>
    </AdminShell>
  );
}
