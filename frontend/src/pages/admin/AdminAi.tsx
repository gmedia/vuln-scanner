import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
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

export default function AdminAi() {
  const { t } = useTranslation("admin");
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
          <AdminAiProvidersTab providers={providers} />
        </TabsContent>
        <TabsContent value="models">
          <AdminAiModelsTab providers={providers} models={models} />
        </TabsContent>
        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle>{t("aiTabUsage")}</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="topup">
          <AdminAiTopupTab />
        </TabsContent>
        <TabsContent value="trial">
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
