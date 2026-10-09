import { PowerOff, Siren, AlertTriangle, FolderOpen, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
} from "@/components/ui/Card";
import { Skeleton, TableRowSkeleton } from "@/components/ui/Skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabCount,
  TabsTrigger,
} from "@/components/ui/Tabs";
import { useTranslation } from "react-i18next";
import PageHeader from "@/components/layout/PageHeader";
import { SiemEmptyIsland } from "@/components/siem/SiemEmptyIsland";
import {
  OpsShell,
  OpsShellBody,
} from "@/components/ops/OpsShell";
import { SiemCasesPanel } from "@/components/siem/SiemCasesPanel";
import { SiemEventInspector } from "@/components/siem/SiemEventInspector";
import { SiemEventStream } from "@/components/siem/SiemEventStream";
import { SiemIndexerStrip } from "@/components/siem/SiemIndexerStrip";
import { SiemSearchFilters } from "@/components/siem/SiemSearchFilters";
import { apiDetail, isAuthSessionError } from "@/components/siem/siemErrors";
import { useSiemConsole } from "@/components/siem/useSiemConsole";

const SIEM_TABS = ["search", "cases"] as const;
type SiemTab = (typeof SIEM_TABS)[number];

function parseSiemTab(raw: string | null): SiemTab {
  for (const tab of SIEM_TABS) {
    if (tab === raw) return tab;
  }
  return "search";
}

export default function Siem() {
  const { t } = useTranslation("siem");
  const c = useSiemConsole(t);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseSiemTab(searchParams.get("tab"));
  const setTab = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "search") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );
  };
  const openCases = c.cases.filter((row) => row.status === "open").length;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {c.actionError ? (
        <Alert variant="destructive" className="border-destructive/40">
          <AlertTriangle />
          <AlertDescription>{c.actionError}</AlertDescription>
        </Alert>
      ) : null}

      {!c.activeOrgId ? (
        <p className="text-sm text-muted-foreground">{t("pickOrg")}</p>
      ) : null}

      {c.statusQ.isLoading ? (
        <OpsShell railClass="bg-border" testid="siem-loading">
          <OpsShellBody className="flex min-h-[8rem] items-center px-6 py-8">
            <TableRowSkeleton rows={2} className="w-full" />
          </OpsShellBody>
        </OpsShell>
      ) : null}

      {c.featureOff ? (
        <SiemEmptyIsland
          icon={PowerOff}
          title={t("featureOff")}
          testId="siem-feature-off"
        />
      ) : null}

      {c.statusQ.isError && !c.featureOff ? (
        <p className="text-sm text-destructive" data-testid="siem-status-error">
          {isAuthSessionError(c.statusQ.error)
            ? t("sessionExpired")
            : apiDetail(c.statusQ.error, t("loadStatusFail"))}
        </p>
      ) : null}

      {c.featureOn && c.statusQ.data ? (
        <>
          {c.agentsQ.isLoading ? (
            <div
              data-testid="siem-indexer-loading"
              className="grid grid-cols-2 gap-3 lg:grid-cols-4"
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[4.5rem] rounded-lg" />
              ))}
            </div>
          ) : (
            <SiemIndexerStrip
              status={c.statusQ.data}
              agentCount={c.agents.length}
              t={t}
            />
          )}

          {c.statusQ.data.degraded ? (
            <Alert className="border-amber-500/40 text-amber-800 dark:text-amber-300">
              <AlertTriangle />
              <AlertDescription>
                {t("indexerDegraded")}
                {c.statusQ.data.last_error
                  ? `: ${c.statusQ.data.last_error}`
                  : ""}
                .
              </AlertDescription>
            </Alert>
          ) : null}

          {c.agents.length === 0 && !c.agentsQ.isLoading ? (
            <SiemEmptyIsland
              icon={Siren}
              title={t("noAgents")}
              testId="siem-no-agents"
            />
          ) : null}

          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value="search" className="gap-1.5">
                <Search aria-hidden />
                {t("tabSearch")}
              </TabsTrigger>
              <TabsTrigger value="cases" className="gap-1.5">
                <FolderOpen aria-hidden />
                {t("tabCases")}
                <TabCount value={openCases} />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="search" className="mt-4 space-y-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)] xl:items-start">
                <Card data-testid="siem-search">
                  <CardContent className="space-y-4 pt-4">
                    <SiemSearchFilters
                      draft={c.draft}
                      agents={c.agents}
                      minLevelPlaceholder={String(
                        c.statusQ.data.search_min_level,
                      )}
                      onChange={c.setDraft}
                      onApply={c.applyFilters}
                      t={t}
                    />

                    {c.eventsQ.data?.degraded ? (
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        {t("partialResults")}
                        {c.eventsQ.data.last_error
                          ? `: ${c.eventsQ.data.last_error}`
                          : ""}
                      </p>
                    ) : null}

                    <SiemEventStream
                      events={c.events}
                      allCount={c.allEvents.length}
                      pageSize={c.pageSize}
                      page={c.safeEventPage + 1}
                      pageCount={c.eventPageCount}
                      onPrev={() =>
                        c.setEventPage((p) => Math.max(0, p - 1))
                      }
                      onNext={() =>
                        c.setEventPage((p) =>
                          Math.min(c.eventPageCount - 1, p + 1),
                        )
                      }
                      loading={c.eventsQ.isLoading}
                      isXl={c.isXl}
                      selectedKey={c.selectedKey}
                      onSelect={(id) => c.setSelectedId(id || null)}
                      canCreate={c.canCreate}
                      caseTitle={c.caseTitle}
                      onCaseTitleChange={c.setCaseTitle}
                      createPending={c.createMut.isPending}
                      onCreateCase={c.createCaseFrom}
                      t={t}
                    />
                  </CardContent>
                </Card>

                {c.isXl ? (
                  <SiemEventInspector
                    loading={c.eventsQ.isLoading}
                    selected={c.selected}
                    canCreate={c.canCreate}
                    caseTitle={c.caseTitle}
                    onCaseTitleChange={c.setCaseTitle}
                    createPending={c.createMut.isPending}
                    onCreateCase={() => {
                      if (!c.selected) return;
                      c.createCaseFrom(c.selected.external_id);
                    }}
                    t={t}
                  />
                ) : null}
              </div>
            </TabsContent>
            <TabsContent value="cases" className="mt-4">
              <SiemCasesPanel
                cases={c.cases}
                loading={c.casesQ.isLoading}
                activeCase={c.activeCase}
                onSelect={c.setActiveCaseId}
                canManage={c.canManage}
                canCreate={c.canCreate}
                patchPending={c.patchMut.isPending}
                onPatch={(id, status) => c.patchMut.mutate({ id, status })}
                noteBody={c.noteBody}
                onNoteBodyChange={c.setNoteBody}
                notePending={c.noteMut.isPending}
                onAddNote={() => {
                  if (!c.activeCase) return;
                  c.noteMut.mutate({
                    id: c.activeCase.id,
                    body: c.noteBody.trim(),
                  });
                }}
                t={t}
              />
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
