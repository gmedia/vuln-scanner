import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, KeyRound, Library, ScrollText, Wallet } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { AiCatalogPanel } from "@/components/ai/AiCatalogPanel";
import { AiKeysPanel } from "@/components/ai/AiKeysPanel";
import { AiUsagePanel } from "@/components/ai/AiUsagePanel";
import { AiWalletPanel } from "@/components/ai/AiWalletPanel";
import { useAuthStore } from "@/store/authStore";
import { useTranslation } from "react-i18next";

const AI_TABS = ["wallet", "keys", "usage", "catalog"] as const;
type AiTab = (typeof AI_TABS)[number];

function parseAiTab(raw: string | null): AiTab {
  for (const tab of AI_TABS) {
    if (tab === raw) return tab;
  }
  return "wallet";
}

function TabCount({ value }: { readonly value: number }) {
  if (value <= 0) return null;
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      {value}
    </span>
  );
}

export default function Ai() {
  const { t } = useTranslation("ai");
  const orgId = useAuthStore((s) => s.activeOrgId);
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAiTab(searchParams.get("tab"));
  const [keyName, setKeyName] = useState("sdk");
  const [onceKey, setOnceKey] = useState<string | null>(null);

  const setTab = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "wallet") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );
  };

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

  const activeKeys = (keysQ.data?.items ?? []).filter((k) => k.is_active).length;
  const usageCount = usageQ.data?.items.length ?? 0;
  const periodBilled = (usageQ.data?.items ?? []).reduce(
    (sum, row) => sum + (row.billed_idr || 0),
    0,
  );

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
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="wallet" data-testid="ai-tab-wallet" className="gap-1.5">
            <Wallet aria-hidden />
            {t("tabWallet")}
          </TabsTrigger>
          <TabsTrigger value="keys" data-testid="ai-tab-keys" className="gap-1.5">
            <KeyRound aria-hidden />
            {t("tabKeys")}
            <TabCount value={activeKeys} />
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="ai-tab-usage" className="gap-1.5">
            <ScrollText aria-hidden />
            {t("tabUsage")}
            <TabCount value={usageCount} />
          </TabsTrigger>
          <TabsTrigger value="catalog" data-testid="ai-tab-catalog" className="gap-1.5">
            <Library aria-hidden />
            {t("tabCatalog")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="wallet" className="mt-4">
          <AiWalletPanel
            balanceIdr={walletQ.data?.balance_idr}
            activeKeys={activeKeys}
            periodBilled={periodBilled}
            usageCount={usageCount}
            walletLoading={walletQ.isLoading}
            keysLoading={keysQ.isLoading}
            usageLoading={usageQ.isLoading}
            isAdmin={isAdmin}
          />
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

function Header() {
  const { t } = useTranslation("ai");
  return <PageHeader title={t("title")} description={t("subtitle")} />;
}
