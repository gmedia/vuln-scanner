import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  adminAiChat,
  createAiModel,
  createAiProvider,
  deleteAiModel,
  deleteAiProvider,
  listAiModels,
  listAiProviders,
  listAiUsage,
  topupAiWallet,
  updateAiModel,
  updateAiProvider,
  type AiModelAdmin,
  type AiProviderAdmin,
  type AiUsageAdmin,
} from "@/api/admin";
import { isAiDisabledError } from "@/api/ai";
import PageHeader from "@/components/layout/PageHeader";
import { useTranslation } from "react-i18next";

function formatIdr(n: number | null | undefined): string {
  if (n == null) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export default function AdminAi() {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const providersQ = useQuery({
    queryKey: ["admin-ai-providers"],
    queryFn: listAiProviders,
    retry: false,
  });
  const modelsQ = useQuery({
    queryKey: ["admin-ai-models"],
    queryFn: () => listAiModels(),
    enabled: !isAiDisabledError(providersQ.error),
    retry: false,
  });
  const usageQ = useQuery({
    queryKey: ["admin-ai-usage"],
    queryFn: () => listAiUsage({ limit: 50 }),
    enabled: !isAiDisabledError(providersQ.error),
    retry: false,
  });

  const providers = providersQ.data?.items ?? [];
  const models = modelsQ.data?.items ?? [];

  const [provName, setProvName] = useState("OpenRouter");
  const [provUrl, setProvUrl] = useState("https://openrouter.ai/api/v1");
  const [provCred, setProvCred] = useState("");
  const [publicId, setPublicId] = useState("sinexis/demo");
  const [upstreamId, setUpstreamId] = useState("openai/gpt-4o-mini");
  const [providerId, setProviderId] = useState("");
  const [priceIn, setPriceIn] = useState("1000");
  const [priceOut, setPriceOut] = useState("3000");
  const [orgId, setOrgId] = useState("");
  const [amount, setAmount] = useState("10000");
  const [trialModel, setTrialModel] = useState("");
  const [trialPrompt, setTrialPrompt] = useState("ping");
  const [trialReply, setTrialReply] = useState("");
  const [editingProv, setEditingProv] = useState<AiProviderAdmin | null>(null);
  const [editProvName, setEditProvName] = useState("");
  const [editProvUrl, setEditProvUrl] = useState("");
  const [editProvCred, setEditProvCred] = useState("");
  const [editingModel, setEditingModel] = useState<AiModelAdmin | null>(null);
  const [editPublicId, setEditPublicId] = useState("");
  const [editUpstreamId, setEditUpstreamId] = useState("");
  const [editPriceIn, setEditPriceIn] = useState("");
  const [editPriceOut, setEditPriceOut] = useState("");
  const [openUsageId, setOpenUsageId] = useState<string | null>(null);

  const addProv = useMutation({
    mutationFn: () =>
      createAiProvider({
        name: provName,
        base_url: provUrl,
        credential: provCred,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-ai-providers"] }),
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
      void qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
    },
  });
  const delProv = useMutation({
    mutationFn: (id: string) => deleteAiProvider(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-ai-providers"] }),
  });
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
  const topupMut = useMutation({
    mutationFn: () => topupAiWallet(orgId.trim(), Number(amount)),
  });
  const chatMut = useMutation({
    mutationFn: () =>
      adminAiChat({
        model: trialModel,
        messages: [{ role: "user", content: trialPrompt }],
        max_tokens: 64,
      }),
    onSuccess: (data) => {
      const choices = data.choices as { message?: { content?: string } }[] | undefined;
      setTrialReply(choices?.[0]?.message?.content ?? JSON.stringify(data));
    },
  });

  if (isAiDisabledError(providersQ.error)) {
    return (
      <div className="w-full space-y-6">
        <Head />
        <Alert>
          <AlertDescription>{t("aiFeatureOff")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Head />
      <Tabs defaultValue="providers">
        <div className="max-w-full overflow-x-auto">
        <TabsList className="inline-flex h-auto min-w-max flex-nowrap justify-start">
          <TabsTrigger value="providers">{t("aiTabProviders")}</TabsTrigger>
          <TabsTrigger value="models">{t("aiTabModels")}</TabsTrigger>
          <TabsTrigger value="usage">{t("aiTabUsage")}</TabsTrigger>
          <TabsTrigger value="topup">{t("aiTabTopup")}</TabsTrigger>
          <TabsTrigger value="trial">{t("aiTabTrial")}</TabsTrigger>
        </TabsList>
        </div>
        <TabsContent value="providers">
          <Card>
            <CardHeader>
              <CardTitle>{t("aiTabProviders")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field id="ai-p-name" label={t("aiName")} value={provName} onChange={setProvName} />
                <Field id="ai-p-url" label={t("aiBaseUrl")} value={provUrl} onChange={setProvUrl} />
                <Field
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
              <div className="max-w-full overflow-x-auto">
              <Table className="min-w-[40rem]">
                 <TableHeader>
                   <TableRow>
                     <TableHead>{t("aiName")}</TableHead>
                     <TableHead>{t("aiBaseUrl")}</TableHead>
                    <TableHead>{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>{t("aiProvidersEmpty")}</TableCell>
                    </TableRow>
                  ) : (
                    providers.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          {editingProv?.id === p.id ? (
                            <Input
                              aria-label={t("aiName")}
                              value={editProvName}
                              onChange={(e) => setEditProvName(e.target.value)}
                            />
                          ) : (
                            p.name
                          )}
                        </TableCell>
                        <TableCell className="max-w-[18rem] font-mono text-xs">
                          {editingProv?.id === p.id ? (
                            <Input
                              aria-label={t("aiBaseUrl")}
                              value={editProvUrl}
                              onChange={(e) => setEditProvUrl(e.target.value)}
                            />
                          ) : (
                            <span className="block truncate" title={p.base_url}>
                              {p.base_url}
                            </span>
                          )}
                        </TableCell>
                         <TableCell className="whitespace-nowrap space-x-2">
                           {editingProv?.id === p.id ? (
                            <>
                              <Field
                                id="ai-p-edit-cred"
                                label={t("aiCredential")}
                                value={editProvCred}
                                onChange={setEditProvCred}
                                type="password"
                              />
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => saveProv.mutate()}
                                disabled={saveProv.isPending}
                              >
                                {t("aiSave")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingProv(null)}
                              >
                                {t("aiCancel")}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingProv(p);
                                  setEditProvName(p.name);
                                  setEditProvUrl(p.base_url);
                                  setEditProvCred("");
                                }}
                              >
                                {t("aiEdit")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => delProv.mutate(p.id)}
                              >
                                {t("aiDelete")}
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                 </TableBody>
               </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
         <TabsContent value="models">
          <Card>
            <CardHeader>
              <CardTitle>{t("aiTabModels")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="ai-m-provider">{t("aiProviderId")}</Label>
                  <Select
                    value={providerId || undefined}
                    onValueChange={setProviderId}
                  >
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
                <Field id="ai-m-pub" label={t("aiPublicId")} value={publicId} onChange={setPublicId} />
                <Field id="ai-m-up" label={t("aiUpstreamId")} value={upstreamId} onChange={setUpstreamId} />
                <Field id="ai-m-in" label={t("aiPriceIn")} value={priceIn} onChange={setPriceIn} />
                <Field id="ai-m-out" label={t("aiPriceOut")} value={priceOut} onChange={setPriceOut} />
              </div>
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => addModel.mutate()}
                disabled={addModel.isPending || !providerId}
              >
                {t("aiAddModel")}
              </Button>
              <div className="max-w-full overflow-x-auto">
              <Table className="min-w-[40rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("aiPublicId")}</TableHead>
                      <TableHead>{t("aiUpstreamId")}</TableHead>
                     <TableHead className="hidden md:table-cell">{t("aiPriceIn")}</TableHead>
                     <TableHead className="hidden md:table-cell">{t("aiPriceOut")}</TableHead>
                     <TableHead>{t("colActions")}</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {models.length === 0 ? (
                     <TableRow>
                       <TableCell colSpan={5}>{t("aiModelsEmpty")}</TableCell>
                     </TableRow>
                   ) : (
                    models.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          {editingModel?.id === m.id ? (
                            <Input
                              aria-label={t("aiPublicId")}
                              value={editPublicId}
                              onChange={(e) => setEditPublicId(e.target.value)}
                            />
                          ) : (
                            m.public_id
                          )}
                        </TableCell>
                        <TableCell>
                          {editingModel?.id === m.id ? (
                            <div className="space-y-2">
                              <Input
                                aria-label={t("aiUpstreamId")}
                                value={editUpstreamId}
                                onChange={(e) => setEditUpstreamId(e.target.value)}
                              />
                              <Field
                                id={`ai-m-edit-in-${m.id}`}
                                label={t("aiPriceIn")}
                                value={editPriceIn}
                                onChange={setEditPriceIn}
                              />
                              <Field
                                id={`ai-m-edit-out-${m.id}`}
                                label={t("aiPriceOut")}
                                value={editPriceOut}
                                onChange={setEditPriceOut}
                              />
                            </div>
                           ) : (
                             m.upstream_id
                           )}
                         </TableCell>
                         <TableCell className="hidden md:table-cell tabular-nums">
                           {formatIdr(m.price_idr_per_1k_in)}
                         </TableCell>
                         <TableCell className="hidden md:table-cell tabular-nums">
                           {formatIdr(m.price_idr_per_1k_out)}
                         </TableCell>
                          <TableCell className="whitespace-nowrap space-x-2">
                           {editingModel?.id === m.id ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => saveModel.mutate()}
                                disabled={saveModel.isPending}
                              >
                                {t("aiSave")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingModel(null)}
                              >
                                {t("aiCancel")}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingModel(m);
                                  setEditPublicId(m.public_id);
                                  setEditUpstreamId(m.upstream_id);
                                  setEditPriceIn(String(m.price_idr_per_1k_in));
                                  setEditPriceOut(String(m.price_idr_per_1k_out));
                                }}
                              >
                                {t("aiEdit")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => delModel.mutate(m.id)}
                              >
                                {t("aiDelete")}
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                 </TableBody>
               </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
         <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle>{t("aiTabUsage")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-full overflow-x-auto">
              <Table className="min-w-[40rem]">
                 <TableHeader>
                   <TableRow>
                      <TableHead>{t("aiPublicId")}</TableHead>
                      <TableHead>{t("aiSource")}</TableHead>
                     <TableHead>{t("aiBilled")}</TableHead>
                     <TableHead>{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usageQ.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>{t("aiUsageEmpty")}</TableCell>
                    </TableRow>
                  ) : (
                    (usageQ.data?.items ?? []).map((u) => (
                      <UsageRow
                        key={u.id}
                        u={u}
                        open={openUsageId === u.id}
                        onToggle={() =>
                          setOpenUsageId((cur) => (cur === u.id ? null : u.id))
                        }
                      />
                    ))
                  )}
                 </TableBody>
               </Table>
               </div>
             </CardContent>
           </Card>
         </TabsContent>
         <TabsContent value="topup">
          <Card>
            <CardHeader>
              <CardTitle>{t("aiTabTopup")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  id="ai-org"
                  label={t("aiOrgId")}
                  value={orgId}
                  onChange={setOrgId}
                  placeholder={t("aiOrgIdPlaceholder")}
                />
                <Field id="ai-amt" label={t("aiAmount")} value={amount} onChange={setAmount} />
              </div>
               <Button
                 type="button"
                 className="w-full sm:w-auto"
                 onClick={() => topupMut.mutate()}
                 disabled={topupMut.isPending}
               >
                 {t("aiTopup")}
               </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="trial">
          <Card>
            <CardHeader>
              <CardTitle>{t("aiTabTrial")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="ai-trial-provider">{t("aiProviderId")}</Label>
                  <Select
                    value={providerId || undefined}
                    onValueChange={(v) => {
                      setProviderId(v);
                      setTrialModel("");
                    }}
                  >
                    <SelectTrigger id="ai-trial-provider" className="h-10 min-h-10">
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
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="ai-tm">{t("aiTrialModel")}</Label>
                  <Select
                    value={trialModel || undefined}
                    onValueChange={setTrialModel}
                    disabled={!providerId}
                  >
                    <SelectTrigger id="ai-tm" className="h-10 min-h-10">
                      <SelectValue placeholder={t("aiSelectModel")} />
                    </SelectTrigger>
                    <SelectContent>
                      {models
                        .filter((m) => m.provider_id === providerId)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.public_id}>
                            {m.public_id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="ai-tp">{t("aiTrialPrompt")}</Label>
                <Textarea
                  id="ai-tp"
                  value={trialPrompt}
                  onChange={(e) => setTrialPrompt(e.target.value)}
                />
              </div>
               <Button
                 type="button"
                 className="w-full sm:w-auto"
                 onClick={() => chatMut.mutate()}
                 disabled={chatMut.isPending || !trialModel}
               >
                {t("aiTrialSend")}
              </Button>
              {trialReply ? (
                <p className="whitespace-pre-wrap text-sm">
                  {t("aiTrialReply")}: {trialReply}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsageRow({
  u,
  open,
  onToggle,
}: {
  u: AiUsageAdmin;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("admin");
  return (
    <>
      <TableRow>
        <TableCell>{u.model_public_id}</TableCell>
        <TableCell>{u.source}</TableCell>
        <TableCell>{formatIdr(u.billed_idr)}</TableCell>
        <TableCell className="whitespace-nowrap">
          <Button type="button" size="sm" variant="outline" onClick={onToggle}>
            {open ? t("aiCancel") : t("aiRequest")}
          </Button>
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell colSpan={4}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium">{t("aiRequest")}</p>
                <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
                  {u.request_payload
                    ? JSON.stringify(u.request_payload, null, 2)
                    : t("aiNoPayload")}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">{t("aiResponse")}</p>
                <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
                  {u.response_payload
                    ? JSON.stringify(u.response_payload, null, 2)
                    : t("aiNoPayload")}
                </pre>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function Head() {
  const { t } = useTranslation("admin");
  return (
    <PageHeader
      leading={<Bot className="h-6 w-6 shrink-0 text-primary" />}
      title={t("aiTitle")}
      description={t("aiSubtitle")}
    />
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
