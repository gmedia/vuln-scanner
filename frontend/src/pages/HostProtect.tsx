import { useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { listGuardAgents } from "@/api/guard";
import {
  createHostSite,
  deleteHostSite,
  enqueueHostScan,
  isHostProtectDisabledError,
  ignoreHostHit,
  listHostHits,
  listHostScans,
  listHostSites,
  type HostScan,
  updateHostSite,
  quarantineHostHit,
  restoreHostHit,
  type HostSite,
} from "@/api/hostProtect";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Bug, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import {
  OpsShell,
  OpsShellBody,
} from "@/components/ops/OpsShell";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabCount,
  TabsTrigger,
} from "@/components/ui/Tabs";
import HostWafPanel from "@/components/host/HostWafPanel";
import HostKpiStrip from "@/components/host/HostKpiStrip";
import HostAddSiteSheet from "@/components/host/HostAddSiteSheet";
import HostInstallCard from "@/components/host/HostInstallCard";
import HostSiteCard from "@/components/host/HostSiteCard";
import { formatHelperPollAt, isHelperPollStale } from "@/lib/sinexisInstall";
import { useAuthStore } from "@/store/authStore";

const HOST_TABS = ["malware", "waf"] as const;
type HostTab = (typeof HOST_TABS)[number];

function parseHostTab(raw: string | null): HostTab {
  for (const tab of HOST_TABS) {
    if (tab === raw) return tab;
  }
  return "malware";
}

export function mapHostError(message: string): string {
  if (/limit/i.test(message)) return "limit";
  return message;
}

export default function HostProtect() {
  const { t } = useTranslation("host");
  const qc = useQueryClient();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [searchParams, setSearchParams] = useSearchParams();
  const hostTab = parseHostTab(searchParams.get("tab"));
  const setHostTab = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === "malware") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );
  };
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [agentId, setAgentId] = useState("");
  const [cmsHint, setCmsHint] = useState<"wordpress" | "laravel" | "unknown">(
    "unknown",
  );
  const [scanInterval, setScanInterval] = useState<"daily" | "hourly">("daily");
  const [autoQuarantine, setAutoQuarantine] = useState(false);
  const [watchOnWrite, setWatchOnWrite] = useState(false);
  const [showIgnoredBySite, setShowIgnoredBySite] = useState<
    Record<string, boolean>
  >({});

  const sitesQ = useQuery({
    queryKey: ["host", activeOrgId, "sites"],
    queryFn: listHostSites,
    enabled: !!activeOrgId,
    retry: false,
  });

  const featureOff = sitesQ.isError && isHostProtectDisabledError(sitesQ.error);
  const featureOn = sitesQ.isSuccess;

  const agentsQ = useQuery({
    queryKey: ["guard", activeOrgId, "agents"],
    queryFn: listGuardAgents,
    enabled: !!activeOrgId && featureOn,
    refetchInterval: 30_000,
  });

  const items = sitesQ.data ?? [];

  const scansQueries = useQueries({
    queries: items.map((s) => ({
      queryKey: ["host", activeOrgId, "scans", s.id],
      queryFn: () => listHostScans(s.id),
      enabled: !!activeOrgId && featureOn,
      refetchInterval: (q: { state: { data?: HostScan[] } }) =>
        q.state.data?.[0]?.status === "queued" ? 4000 : false,
    })),
  });

  const waitingAgent = scansQueries.some(
    (q) => q.data?.[0]?.status === "queued",
  );

  const hitsQ = useQuery({
    queryKey: ["host", activeOrgId, "hits"],
    queryFn: () => listHostHits(),
    enabled: !!activeOrgId && featureOn,
    refetchInterval: waitingAgent ? 4000 : false,
  });
  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const atCap = items.length >= limit;
  const agents = agentsQ.data ?? [];
  const selectedAgentId = agentId || agents[0]?.id || "";
  const fleetPollIso = agents.reduce<string | null>((latest, a) => {
    const iso = a.last_helper_poll_at;
    if (!iso) return latest;
    if (!latest) return iso;
    return Date.parse(iso) > Date.parse(latest) ? iso : latest;
  }, null);
  const fleetWhen = formatHelperPollAt(fleetPollIso);
  const fleetStale = isHelperPollStale(fleetPollIso);
  const overviewNeedsDecision = (hitsQ.data ?? []).filter(
    (h) => h.engine !== "mock" && h.status !== "ignored",
  ).length;

  const createMut = useMutation({
    mutationFn: createHostSite,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["host"] });
      setName("");
      setRootPath("");
      setAgentId("");
      setScanInterval("daily");
      setAutoQuarantine(false);
      setWatchOnWrite(false);
      setOpen(false);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = String(err.response?.data?.detail ?? "");
      toast.error(
        mapHostError(detail) === "limit"
          ? t("limitReached")
          : detail || t("createFail"),
      );
    },
  });

  const delMut = useMutation({
    mutationFn: deleteHostSite,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });

  const intervalMut = useMutation({
    mutationFn: ({
      id,
      scan_interval,
    }: {
      id: string;
      scan_interval: "daily" | "hourly";
    }) => updateHostSite(id, { scan_interval }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });

  const autoQuarantineMut = useMutation({
    mutationFn: ({
      id,
      auto_quarantine,
    }: {
      id: string;
      auto_quarantine: boolean;
    }) => updateHostSite(id, { auto_quarantine }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });

  const watchMut = useMutation({
    mutationFn: ({
      id,
      watch_on_write,
    }: {
      id: string;
      watch_on_write: boolean;
    }) => updateHostSite(id, { watch_on_write }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });

  const enabledMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateHostSite(id, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });

  const scanMut = useMutation({
    mutationFn: enqueueHostScan,
    onSuccess: () => {
      toast.success(t("scanEnqueued"));
      void qc.invalidateQueries({ queryKey: ["host"] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(String(err.response?.data?.detail ?? t("scanFail")));
    },
  });

  const qMut = useMutation({
    mutationFn: quarantineHostHit,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });
  const rMut = useMutation({
    mutationFn: restoreHostHit,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });
  const iMut = useMutation({
    mutationFn: ignoreHostHit,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });

  const openCreate = () => setOpen(true);

  if (!activeOrgId) {
    return (
      <div className="space-y-6" data-testid="host-page">
        <PageHeader title={t("title")} />
        <p className="text-sm text-muted-foreground">{t("pickOrg")}</p>
      </div>
    );
  }

  if (featureOff) {
    return (
      <div className="space-y-6" data-testid="host-page">
        <PageHeader title={t("title")} description={t("subtitle")} />
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/40 px-6 py-16 text-center md:min-h-[16rem] md:py-20">
          <Shield className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-balance text-sm font-medium text-foreground">
            {t("title")}
          </p>
          <p
            className="max-w-md text-balance text-sm text-muted-foreground"
            data-testid="host-feature-off"
          >
            {t("featureOff")}
          </p>
          <Button variant="outline" className="mt-2 min-h-11" asChild>
            <Link to="/guide">Guide</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="host-page">
      <PageHeader
        title={t("title")}
        description={
          <div className="space-y-1">
            <p data-testid="host-page-subtitle">
              {t(hostTab === "waf" ? "subtitleWaf" : "subtitle")}
            </p>
            <p className="text-xs">{t("honestyHint")}</p>
          </div>
        }
        actions={
          <Button
            data-testid="host-add"
            className="min-h-11 sm:min-h-10"
            disabled={atCap || agents.length === 0}
            onClick={() => setOpen((v) => !v)}
          >
            {t("add")}
          </Button>
        }
      />
      <HostKpiStrip
        sku={sku}
        count={items.length}
        limit={limit}
        agentsCount={agents.length}
        needsDecision={overviewNeedsDecision}
        waiting={waitingAgent}
        fleetStale={fleetStale}
        featureOn={featureOn}
      />

      <HostInstallCard />

      {agents.length === 0 && !agentsQ.isLoading ? (
        <div
          data-testid="host-no-agents"
          className="flex min-h-[8rem] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/40 px-6 py-12 text-center"
        >
          <Shield className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-balance text-sm font-medium text-foreground">
            {t("noAgents")}
          </p>
          <p className="max-w-md text-balance text-sm text-muted-foreground">
            {t("emptyHint")}
          </p>
          <Button variant="outline" className="mt-1 min-h-11" asChild>
            <Link to="/guard">{t("openGuard")}</Link>
          </Button>
        </div>
      ) : null}

      {featureOn && agents.length > 0 && fleetStale ? (
        <Alert variant="destructive" data-testid="host-helper-fleet">
          <AlertTriangle />
          <AlertDescription>
            {fleetWhen
              ? t("helperFleetStale", { when: fleetWhen })
              : t("helperFleetNever")}
          </AlertDescription>
        </Alert>
      ) : null}

      <HostAddSiteSheet
        open={open}
        onOpenChange={setOpen}
        name={name}
        onNameChange={setName}
        rootPath={rootPath}
        onRootPathChange={setRootPath}
        agents={agents}
        selectedAgentId={selectedAgentId}
        onAgentChange={setAgentId}
        cmsHint={cmsHint}
        onCmsHintChange={setCmsHint}
        scanInterval={scanInterval}
        onScanIntervalChange={setScanInterval}
        autoQuarantine={autoQuarantine}
        onAutoQuarantineChange={setAutoQuarantine}
        watchOnWrite={watchOnWrite}
        onWatchOnWriteChange={setWatchOnWrite}
        saving={createMut.isPending}
        onSave={() =>
          createMut.mutate({
            name: name.trim(),
            root_path: rootPath.trim(),
            guard_agent_id: selectedAgentId,
            cms_hint: cmsHint,
            scan_interval: scanInterval,
            auto_quarantine: autoQuarantine,
            watch_on_write: watchOnWrite,
          })
        }
      />

      <Tabs value={hostTab} onValueChange={setHostTab}>
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger
            value="malware"
            data-testid="host-tab-malware"
            className="gap-1.5"
          >
            <Bug aria-hidden />
            {t("tabMalware")}
            <TabCount value={overviewNeedsDecision} />
          </TabsTrigger>
          <TabsTrigger
            value="waf"
            data-testid="host-tab-waf"
            className="gap-1.5"
          >
            <Shield aria-hidden />
            {t("tabWaf")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="malware" className="mt-4 space-y-6">
          {sitesQ.isLoading && items.length === 0 ? (
            <OpsShell railClass="bg-border" testid="host-sites-loading">
              <OpsShellBody className="px-4 py-4">
                <TableRowSkeleton rows={4} />
              </OpsShellBody>
            </OpsShell>
          ) : items.length === 0 && !sitesQ.isLoading && agents.length > 0 ? (
            <div
              data-testid="host-empty"
              className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/40 px-6 py-16 text-center md:min-h-[16rem] md:py-20"
            >
              <Shield className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-balance text-sm font-medium text-foreground">
                {t("empty")}
              </p>
              <p className="max-w-md text-balance text-sm text-muted-foreground">
                {t("emptyHint")}
              </p>
              <Button
                className="mt-2 min-h-11"
                data-testid="host-empty-cta"
                disabled={atCap || agents.length === 0}
                onClick={openCreate}
              >
                {t("emptyCta")}
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((s: HostSite, idx: number) => {
                const siteRows = (hitsQ.data ?? []).filter(
                  (h) => h.site_id === s.id && h.engine !== "mock",
                );
                const activeHits = siteRows.filter(
                  (h) => h.status !== "ignored",
                );
                const ignoredHits = siteRows.filter(
                  (h) => h.status === "ignored",
                );
                const showIgnored = Boolean(showIgnoredBySite[s.id]);
                const lastScan = scansQueries[idx]?.data?.[0];
                const siteAgent = agents.find((a) => a.id === s.guard_agent_id);
                return (
                  <li key={s.id}>
                    <HostSiteCard
                      site={s}
                      lastScan={lastScan}
                      helperPollAt={siteAgent?.last_helper_poll_at ?? null}
                      activeHits={activeHits}
                      ignoredHits={ignoredHits}
                      showIgnored={showIgnored}
                      scanPending={scanMut.isPending}
                      onToggleIgnored={() =>
                        setShowIgnoredBySite((prev) => ({
                          ...prev,
                          [s.id]: !showIgnored,
                        }))
                      }
                      onScan={() => scanMut.mutate(s.id)}
                      onDelete={() => delMut.mutate(s.id)}
                      onEnabled={(enabled) =>
                        enabledMut.mutate({ id: s.id, enabled })
                      }
                      onInterval={(scan_interval) =>
                        intervalMut.mutate({ id: s.id, scan_interval })
                      }
                      onAutoQuarantine={(auto_quarantine) =>
                        autoQuarantineMut.mutate({
                          id: s.id,
                          auto_quarantine,
                        })
                      }
                      onWatch={(watch_on_write) =>
                        watchMut.mutate({ id: s.id, watch_on_write })
                      }
                      onQuarantine={(id) => qMut.mutate(id)}
                      onRestore={(id) => rMut.mutate(id)}
                      onIgnore={(id) => iMut.mutate(id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="waf" className="mt-4">
          <HostWafPanel sites={items} agents={agents} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
