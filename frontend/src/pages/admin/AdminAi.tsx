import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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

export default function AdminAi() {
  const { t } = useTranslation("admin");
  const [openUsageId, setOpenUsageId] = useState<string | null>(null);
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
