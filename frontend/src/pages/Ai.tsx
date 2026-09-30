import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, WalletCards } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  createAiKey,
  getAiWallet,
  isAiDisabledError,
  listAiKeys,
  listAiModels,
  listAiUsage,
  revokeAiKey,
} from "@/api/ai";
import { formatIdr } from "@/components/admin/aiFormat";
import { AiCatalogPanel } from "@/components/ai/AiCatalogPanel";
import { AiKeysPanel } from "@/components/ai/AiKeysPanel";
import { AiUsagePanel } from "@/components/ai/AiUsagePanel";
import { useAuthStore } from "@/store/authStore";
import { useTranslation } from "react-i18next";

export default function Ai() {
  const { t } = useTranslation("ai");
  const orgId = useAuthStore((s) => s.activeOrgId);
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const qc = useQueryClient();
  const [keyName, setKeyName] = useState("sdk");
  const [onceKey, setOnceKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("wallet");
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

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
  const activeKeys = (keysQ.data?.items ?? []).filter((k) => k.is_active).length;
  const periodBilled = (usageQ.data?.items ?? []).reduce(
    (sum, row) => sum + (row.billed_idr || 0),
    0,
  );
  const walletEmpty =
    walletQ.data?.balance_idr == null || walletQ.data.balance_idr === 0;

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
        <Alert data-testid="ai-feature-off">
          <Bot className="text-muted-foreground" aria-hidden />
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
      <Tabs value={tab} onValueChange={setTab}>
        <div className="max-w-full overflow-x-auto">
          <TabsList className="inline-flex h-auto min-w-max flex-nowrap justify-start">
            <TabsTrigger value="wallet" data-testid="ai-tab-wallet">
              {t("tabWallet")}
            </TabsTrigger>
            <TabsTrigger value="keys" data-testid="ai-tab-keys">
              {t("tabKeys")}
            </TabsTrigger>
            <TabsTrigger value="usage" data-testid="ai-tab-usage">
              {t("tabUsage")}
            </TabsTrigger>
            <TabsTrigger value="catalog" data-testid="ai-tab-catalog">
              {t("tabCatalog")}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="wallet" className="mt-4">
          <Card>
            <CardHeader className="gap-1">
              <CardTitle className="text-base tracking-tight">
                {t("tabWallet")}
              </CardTitle>
              <CardDescription>{t("baseUrlHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile
                  label={t("balance")}
                  value={
                    walletQ.isLoading ? (
                      <Skeleton className="h-7 w-28" />
                    ) : (
                      formatIdr(walletQ.data?.balance_idr)
                    )
                  }
                />
                <StatTile
                  label={t("statKeys")}
                  value={
                    keysQ.isLoading ? (
                      <Skeleton className="h-7 w-12" />
                    ) : (
                      String(activeKeys)
                    )
                  }
                />
                <StatTile
                  label={t("statPeriod")}
                  value={
                    usageQ.isLoading ? (
                      <Skeleton className="h-7 w-24" />
                    ) : (usageQ.data?.items.length ?? 0) > 0 ? (
                      formatIdr(periodBilled)
                    ) : (
                      "—"
                    )
                  }
                />
              </div>

              {walletEmpty && !walletQ.isLoading ? (
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <WalletCards
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <p className="text-sm text-muted-foreground">{t("walletEmpty")}</p>
                  </div>
                  <Button type="button" size="sm" asChild className="shrink-0">
                    <Link to={isAdmin ? "/admin/ai" : "/guide"}>
                      {t("walletTopUp")}
                    </Link>
                  </Button>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("endpoint")}
                </p>
                <div className="flex max-sm:flex-col flex-wrap items-start sm:items-center gap-2">
                  <code className="max-w-full min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
                    {baseUrl}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      void navigator.clipboard.writeText(baseUrl);
                      setCopied(true);
                      if (copiedTimer.current != null) {
                        window.clearTimeout(copiedTimer.current);
                      }
                      copiedTimer.current = window.setTimeout(() => {
                        setCopied(false);
                        copiedTimer.current = null;
                      }, 2000);
                    }}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {copied ? t("copied") : t("copyBase")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="keys" className="mt-4">
          <AiKeysPanel
            keys={keysQ.data?.items ?? []}
            keyName={keyName}
            onKeyName={setKeyName}
            onceKey={onceKey}
            createPending={createMut.isPending}
            onCreate={() => createMut.mutate()}
            onRevoke={(id) => revokeMut.mutate(id)}
          />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <AiUsagePanel
            items={usageQ.data?.items ?? []}
            onSeeCatalog={() => setTab("catalog")}
          />
        </TabsContent>
        <TabsContent value="catalog" className="mt-4">
          <AiCatalogPanel models={modelsQ.data?.items ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function Header() {
  const { t } = useTranslation("ai");
  return <PageHeader title={t("title")} description={t("subtitle")} />;
}
