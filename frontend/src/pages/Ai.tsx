import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
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
  createAiKey,
  getAiWallet,
  isAiDisabledError,
  listAiKeys,
  listAiModels,
  listAiUsage,
  revokeAiKey,
} from "@/api/ai";
import { useAuthStore } from "@/store/authStore";
import { useTranslation } from "react-i18next";

export default function Ai() {
  const { t } = useTranslation("ai");
  const orgId = useAuthStore((s) => s.activeOrgId);
  const qc = useQueryClient();
  const [keyName, setKeyName] = useState("sdk");
  const [onceKey, setOnceKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const walletQ = useQuery({
    queryKey: ["ai-wallet", orgId],
    queryFn: getAiWallet,
    enabled: Boolean(orgId),
    retry: false,
  });
  const keysQ = useQuery({
    queryKey: ["ai-keys", orgId],
    queryFn: listAiKeys,
    enabled: Boolean(orgId) && !isAiDisabledError(walletQ.error),
    retry: false,
  });
  const usageQ = useQuery({
    queryKey: ["ai-usage", orgId],
    queryFn: () => listAiUsage(50),
    enabled: Boolean(orgId) && !isAiDisabledError(walletQ.error),
    retry: false,
  });
  const modelsQ = useQuery({
    queryKey: ["ai-models", orgId],
    queryFn: listAiModels,
    enabled: Boolean(orgId) && !isAiDisabledError(walletQ.error),
    retry: false,
  });

  const createMut = useMutation({
    mutationFn: () => createAiKey(keyName.trim() || "sdk"),
    onSuccess: (row) => {
      setOnceKey(row.key ?? null);
      void qc.invalidateQueries({ queryKey: ["ai-keys"] });
    },
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeAiKey(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-keys"] }),
  });

  const baseUrl = `${window.location.origin}/v1`;

  if (!orgId) {
    return (
      <div className="w-full space-y-6">
        <Header />
        <Alert>
          <AlertDescription>{t("pickOrg")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isAiDisabledError(walletQ.error)) {
    return (
      <div className="w-full space-y-6">
        <Header />
        <Alert>
          <AlertDescription>{t("featureOff")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (walletQ.isError) {
    return (
      <div className="w-full space-y-6">
        <Header />
        <Alert>
          <AlertDescription>{t("loadFail")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Header />
      <Tabs defaultValue="wallet">
        <TabsList>
          <TabsTrigger value="wallet">{t("tabWallet")}</TabsTrigger>
          <TabsTrigger value="keys">{t("tabKeys")}</TabsTrigger>
          <TabsTrigger value="usage">{t("tabUsage")}</TabsTrigger>
          <TabsTrigger value="catalog">{t("tabCatalog")}</TabsTrigger>
        </TabsList>
        <TabsContent value="wallet">
          <Card>
            <CardHeader>
              <CardTitle>{t("tabWallet")}</CardTitle>
              <CardDescription>{t("baseUrlHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-2xl font-semibold tabular-nums">
                {walletQ.data?.balance_idr ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">{t("balance")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-xs">{baseUrl}</code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(baseUrl);
                    setCopied(true);
                  }}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  {copied ? t("copied") : t("copyBase")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="keys">
          <Card>
            <CardHeader>
              <CardTitle>{t("tabKeys")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-sm">
                <Label htmlFor="ai-key-name">{t("keyName")}</Label>
                <Input
                  id="ai-key-name"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
              >
                {t("createKey")}
              </Button>
              {onceKey ? (
                <Alert>
                  <AlertDescription>
                    {t("keyOnce")}: <code className="break-all">{onceKey}</code>
                  </AlertDescription>
                </Alert>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{t("colPrefix")}</TableHead>
                    <TableHead>{t("colActive")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(keysQ.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>{t("keysEmpty")}</TableCell>
                    </TableRow>
                  ) : (
                    (keysQ.data?.items ?? []).map((k) => (
                      <TableRow key={k.id}>
                        <TableCell>{k.name}</TableCell>
                        <TableCell className="font-mono text-xs">{k.prefix}</TableCell>
                        <TableCell>{String(k.is_active)}</TableCell>
                        <TableCell>
                          {k.is_active ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => revokeMut.mutate(k.id)}
                            >
                              {t("revoke")}
                            </Button>
                          ) : null}
                        </TableCell>
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
              <CardTitle>{t("tabUsage")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colModel")}</TableHead>
                    <TableHead>{t("colTokens")}</TableHead>
                    <TableHead>{t("colBilled")}</TableHead>
                    <TableHead>{t("colTime")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(usageQ.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>{t("usageEmpty")}</TableCell>
                    </TableRow>
                  ) : (
                    (usageQ.data?.items ?? []).map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>{u.model_public_id}</TableCell>
                        <TableCell>
                          {u.prompt_tokens}/{u.completion_tokens}
                        </TableCell>
                        <TableCell>{u.billed_idr}</TableCell>
                        <TableCell>{u.created_at}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="catalog">
          <Card>
            <CardHeader>
              <CardTitle>{t("tabCatalog")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colModel")}</TableHead>
                    <TableHead>{t("colIn")}</TableHead>
                    <TableHead>{t("colOut")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(modelsQ.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>{t("catalogEmpty")}</TableCell>
                    </TableRow>
                  ) : (
                    (modelsQ.data?.items ?? []).map((m) => (
                      <TableRow key={m.public_id}>
                        <TableCell>{m.public_id}</TableCell>
                        <TableCell>{m.price_idr_per_1k_in}</TableCell>
                        <TableCell>{m.price_idr_per_1k_out}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Header() {
  const { t } = useTranslation("ai");
  return (
    <div className="flex items-center gap-3">
      <Bot className="h-6 w-6 text-primary" />
      <div>
        <h2 className="text-lg font-bold tracking-wide text-foreground">{t("title")}</h2>
        <p className="text-[11px] text-muted-foreground">{t("subtitle")}</p>
      </div>
    </div>
  );
}
