import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Bot, Boxes, MessageSquare, ScrollText, Server, Wallet, TriangleAlert } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import {
  AdminShell,
  AdminShellBody,
  AdminShellHead,
} from "@/components/admin/AdminShell";
import { listAiModels, listAiProviders, listAiUsage } from "@/api/admin";
import { isAiDisabledError } from "@/api/ai";
import PageHeader from "@/components/layout/PageHeader";
import { useTranslation } from "react-i18next";
import { AdminAiModelsTab } from "@/components/admin/AdminAiModelsTab";
import { AdminAiProvidersTab } from "@/components/admin/AdminAiProvidersTab";
import { AdminAiTopupTab } from "@/components/admin/AdminAiTopupTab";
import { AdminAiTrialTab } from "@/components/admin/AdminAiTrialTab";
import { AdminAiUsageList } from "@/components/admin/AdminAiUsageList";

const USAGE_PAGE_SIZE = 20;

const ADMIN_AI_TABS = ["providers", "models", "usage", "topup", "trial"] as const;
type AdminAiTab = (typeof ADMIN_AI_TABS)[number];

function parseAdminAiTab(raw: string | null): AdminAiTab {
  for (const tab of ADMIN_AI_TABS) {
    if (tab === raw) return tab;
  }
  return "providers";
}

export default function AdminAi() {
  const { t } = useTranslation("admin");
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAdminAiTab(searchParams.get("tab"));
  const setTab = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "providers") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );
  };
  const [openUsageId, setOpenUsageId] = useState<string | null>(null);
  const [usagePage, setUsagePage] = useState(1);
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
    queryKey: ["admin-ai-usage", usagePage],
    queryFn: () => listAiUsage({ page: usagePage, limit: USAGE_PAGE_SIZE }),
    enabled: !isAiDisabledError(providersQ.error),
    retry: false,
    placeholderData: keepPreviousData,
  });
  const usageTotal = usageQ.data?.total ?? 0;
  const usagePages = Math.ceil(usageTotal / USAGE_PAGE_SIZE);

  const providers = providersQ.data?.items ?? [];
  const models = modelsQ.data?.items ?? [];

  if (isAiDisabledError(providersQ.error)) {
    return (
      <div className="w-full space-y-6">
        <Head />
        <AdminShell tone="warn" testid="admin-ai-feature-off">
          <AdminShellHead icon={TriangleAlert} title={t("aiTitle")} />
          <AdminShellBody>
            <p className="max-w-prose text-xs text-muted-foreground">
              {t("aiFeatureOff")}
            </p>
          </AdminShellBody>
        </AdminShell>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Head />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="providers" className="gap-1.5">
            <Server aria-hidden />
            {t("aiTabProviders")}
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-1.5">
            <Boxes aria-hidden />
            {t("aiTabModels")}
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <ScrollText aria-hidden />
            {t("aiTabUsage")}
          </TabsTrigger>
          <TabsTrigger value="topup" className="gap-1.5">
            <Wallet aria-hidden />
            {t("aiTabTopup")}
          </TabsTrigger>
          <TabsTrigger value="trial" className="gap-1.5">
            <MessageSquare aria-hidden />
            {t("aiTabTrial")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="mt-4">
          <AdminAiProvidersTab providers={providers} />
        </TabsContent>
        <TabsContent value="models" className="mt-4">
          <AdminAiModelsTab providers={providers} models={models} />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <AdminShell tone="primary" testid="admin-ai-usage-shell">
            <AdminShellHead icon={ScrollText} title={t("aiTabUsage")} />
            <AdminShellBody>
              <AdminAiUsageList
                items={usageQ.data?.items ?? []}
                openUsageId={openUsageId}
                onToggle={(id) => setOpenUsageId((cur) => (cur === id ? null : id))}
              />
              {usagePages > 1 ? (
                <Pagination className="mt-4" data-testid="admin-ai-usage-pagination">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => {
                          setOpenUsageId(null);
                          setUsagePage((p) => Math.max(1, p - 1));
                        }}
                        disabled={usagePage === 1}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                        {t("pageOf", { page: usagePage, total: usagePages })}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => {
                          setOpenUsageId(null);
                          setUsagePage((p) => Math.min(usagePages, p + 1));
                        }}
                        disabled={usagePage === usagePages}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              ) : null}
            </AdminShellBody>
          </AdminShell>
        </TabsContent>
        <TabsContent value="topup" className="mt-4">
          <AdminAiTopupTab />
        </TabsContent>
        <TabsContent value="trial" className="mt-4">
          <AdminAiTrialTab providers={providers} models={models} />
        </TabsContent>
      </Tabs>
    </div>
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
