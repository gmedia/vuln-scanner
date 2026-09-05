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
  adminAiChat,
  createAiModel,
  createAiProvider,
  listAiModels,
  listAiProviders,
  listAiUsage,
  topupAiWallet,
} from "@/api/admin";
import { isAiDisabledError } from "@/api/ai";
import { useTranslation } from "react-i18next";

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
  const [trialModel, setTrialModel] = useState("sinexis/demo");
  const [trialPrompt, setTrialPrompt] = useState("ping");
  const [trialReply, setTrialReply] = useState("");

  const addProv = useMutation({
    mutationFn: () =>
      createAiProvider({
        name: provName,
        base_url: provUrl,
        credential: provCred,
      }),
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
        <TabsList>
          <TabsTrigger value="providers">{t("aiTabProviders")}</TabsTrigger>
          <TabsTrigger value="models">{t("aiTabModels")}</TabsTrigger>
          <TabsTrigger value="usage">{t("aiTabUsage")}</TabsTrigger>
          <TabsTrigger value="topup">{t("aiTabTopup")}</TabsTrigger>
          <TabsTrigger value="trial">{t("aiTabTrial")}</TabsTrigger>
        </TabsList>
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
              <Button type="button" onClick={() => addProv.mutate()} disabled={addProv.isPending}>
                {t("aiAddProvider")}
              </Button>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("aiName")}</TableHead>
                    <TableHead>{t("aiBaseUrl")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(providersQ.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>{t("aiProvidersEmpty")}</TableCell>
                    </TableRow>
                  ) : (
                    (providersQ.data?.items ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.base_url}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
                <Field id="ai-m-pid" label={t("aiProviderId")} value={providerId} onChange={setProviderId} />
                <Field id="ai-m-pub" label={t("aiPublicId")} value={publicId} onChange={setPublicId} />
                <Field id="ai-m-up" label={t("aiUpstreamId")} value={upstreamId} onChange={setUpstreamId} />
                <Field id="ai-m-in" label={t("aiPriceIn")} value={priceIn} onChange={setPriceIn} />
                <Field id="ai-m-out" label={t("aiPriceOut")} value={priceOut} onChange={setPriceOut} />
              </div>
              <Button type="button" onClick={() => addModel.mutate()} disabled={addModel.isPending}>
                {t("aiAddModel")}
              </Button>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("aiPublicId")}</TableHead>
                    <TableHead>{t("aiUpstreamId")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(modelsQ.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2}>{t("aiModelsEmpty")}</TableCell>
                    </TableRow>
                  ) : (
                    (modelsQ.data?.items ?? []).map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.public_id}</TableCell>
                        <TableCell>{m.upstream_id}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle>{t("aiTabUsage")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("aiPublicId")}</TableHead>
                    <TableHead>source</TableHead>
                    <TableHead>billed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usageQ.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>{t("aiUsageEmpty")}</TableCell>
                    </TableRow>
                  ) : (
                    (usageQ.data?.items ?? []).map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.model_public_id}</TableCell>
                        <TableCell>{u.source}</TableCell>
                        <TableCell>{u.billed_idr}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
                <Field id="ai-org" label={t("aiOrgId")} value={orgId} onChange={setOrgId} />
                <Field id="ai-amt" label={t("aiAmount")} value={amount} onChange={setAmount} />
              </div>
              <Button type="button" onClick={() => topupMut.mutate()} disabled={topupMut.isPending}>
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
              <Field id="ai-tm" label={t("aiTrialModel")} value={trialModel} onChange={setTrialModel} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="ai-tp">{t("aiTrialPrompt")}</Label>
                <Textarea
                  id="ai-tp"
                  value={trialPrompt}
                  onChange={(e) => setTrialPrompt(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => chatMut.mutate()} disabled={chatMut.isPending}>
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

function Head() {
  const { t } = useTranslation("admin");
  return (
    <div className="flex items-center gap-3">
      <Bot className="h-6 w-6 text-primary" />
      <div>
        <h2 className="text-lg font-bold tracking-wide text-foreground">{t("aiTitle")}</h2>
        <p className="text-[11px] text-muted-foreground">{t("aiSubtitle")}</p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
