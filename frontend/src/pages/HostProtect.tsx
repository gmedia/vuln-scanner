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
import { Link } from "react-router-dom";
import { AlertTriangle, Download, Shield, Terminal } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Label } from "@/components/ui/Label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import HostWafPanel from "@/components/host/HostWafPanel";
import HostOverview from "@/components/host/HostOverview";
import HostAddSiteSheet from "@/components/host/HostAddSiteSheet";
import {
  SINEXIS_INSTALL_RAW_URL,
  SINEXIS_INSTALL_WGET,
  formatHelperPollAt,
  isHelperPollStale,
} from "@/lib/sinexisInstall";
import { useAuthStore } from "@/store/authStore";

export function mapHostError(message: string): string {
  if (/limit/i.test(message)) return "limit";
  return message;
}

export default function HostProtect() {
  const { t } = useTranslation("host");
  const qc = useQueryClient();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
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
  const [hostTab, setHostTab] = useState("malware");

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
        <PageHeader title={t("title")} />
        <Card>
          <CardContent className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <Shield className="h-10 w-10 text-foreground/50" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("title")}</p>
            <p
              className="max-w-md text-sm text-muted-foreground"
              data-testid="host-feature-off"
            >
              {t("featureOff")}
            </p>
            <Button variant="outline" asChild>
              <Link to="/guide">Guide</Link>
            </Button>
          </CardContent>
        </Card>
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
            <p className="text-xs">{t("skuLabel", { sku, count: items.length, limit })}</p>
            <p className="text-xs">{t("honestyHint")}</p>
          </div>
        }
        actions={
          <Button
            data-testid="host-add"
            disabled={atCap || agents.length === 0}
            onClick={() => setOpen((v) => !v)}
          >
            {t("add")}
          </Button>
        }
      />
      <HostOverview
        sku={sku}
        count={items.length}
        limit={limit}
        agentsCount={agents.length}
        needsDecision={overviewNeedsDecision}
        waiting={waitingAgent}
        fleetStale={fleetStale}
        featureOn={featureOn}
      />

      <Card data-testid="host-install-card">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
            aria-hidden
          >
            <Terminal className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <CardTitle className="text-sm">{t("installDetails")}</CardTitle>
            <CardDescription className="mt-0.5">
              {t("installHint")}
            </CardDescription>
          </span>
          <Button variant="outline" size="sm" asChild className="shrink-0">
            <a
              href={SINEXIS_INSTALL_RAW_URL}
              download="sinexis-install.sh"
              rel="noreferrer"
              data-testid="host-install-download"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t("installDownload")}
            </a>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <pre
            className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
            data-testid="host-install-wget"
          >
            {SINEXIS_INSTALL_WGET}
          </pre>
          <p className="text-xs text-muted-foreground">{t("installCheck")}</p>
        </CardContent>
      </Card>

      {agents.length === 0 && !agentsQ.isLoading ? (
        <Card data-testid="host-no-agents">
          <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <Shield className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("noAgents")}</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {t("emptyHint")}
            </p>
            <Button variant="outline" size="sm" className="mt-1" asChild>
              <Link to="/guard">{t("openGuard")}</Link>
            </Button>
          </CardContent>
        </Card>
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
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:min-w-[22rem]">
          <TabsTrigger value="malware" data-testid="host-tab-malware">
            {t("tabMalware")}
            {overviewNeedsDecision > 0 ? (
              <Badge variant="critical" className="ml-2">
                {overviewNeedsDecision}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="waf" data-testid="host-tab-waf">
            {t("tabWaf")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="malware" className="space-y-6">
          {items.length === 0 && !sitesQ.isLoading && agents.length > 0 ? (
            <Card data-testid="host-empty">
              <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                <Shield className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium text-foreground">
                  {t("empty")}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {t("emptyHint")}
                </p>
                <Button
                  variant="outline"
                  className="mt-2 min-h-11"
                  data-testid="host-empty-cta"
                  disabled={atCap || agents.length === 0}
                  onClick={() => setOpen(true)}
                >
                  {t("emptyCta")}
                </Button>
              </CardContent>
            </Card>
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
                const siteHits = showIgnored
                  ? [...activeHits, ...ignoredHits]
                  : activeHits;
                const lastScan = scansQueries[idx]?.data?.[0];
                const lastCount = lastScan?.hit_count ?? 0;
                const siteAgent = agents.find((a) => a.id === s.guard_agent_id);
                const helperWhen = formatHelperPollAt(
                  siteAgent?.last_helper_poll_at ?? null,
                );
                const helperStale = isHelperPollStale(
                  siteAgent?.last_helper_poll_at ?? null,
                );
                const emptyHitsCopy =
                  lastScan?.status === "queued"
                    ? t("hitsWaitingAgent")
                    : lastScan?.status === "failed"
                      ? t("hitsUnreachable")
                      : helperStale
                        ? t("hitsUnreachable")
                        : lastScan?.status === "completed" &&
                            activeHits.length === 0 &&
                            ignoredHits.length > 0
                          ? t("hitsHidden")
                          : lastScan?.status === "completed" &&
                              activeHits.length === 0 &&
                              ignoredHits.length === 0
                            ? t("hitsClean")
                            : t("hitsEmpty");
                const scanStatusCopy =
                  lastScan?.status === "queued"
                    ? t("scanQueued")
                    : lastScan?.status === "failed"
                      ? t("scanFailed", {
                          error: lastScan.error || "failed",
                        })
                      : lastScan?.status === "completed" &&
                          lastCount === 0 &&
                          helperStale
                        ? t("hitsUnreachable")
                        : lastScan?.status === "completed" &&
                            activeHits.length > 0
                          ? t("scanCompleted", { count: activeHits.length })
                          : lastScan?.status === "completed" &&
                              activeHits.length === 0 &&
                              ignoredHits.length > 0
                            ? t("scanCompletedIgnored", {
                                count: ignoredHits.length,
                              })
                            : lastScan?.status === "completed"
                              ? t("scanCompletedNone")
                              : null;
                const needsDecision = activeHits.length > 0;
                const isWaiting = lastScan?.status === "queued";
                const isFailed = lastScan?.status === "failed";
                const siteBadgeVariant = needsDecision
                  ? ("critical" as const)
                  : isWaiting
                    ? ("running" as const)
                    : isFailed || helperStale
                      ? ("failed" as const)
                      : lastScan?.status === "completed"
                        ? ("completed" as const)
                        : ("pending" as const);
                const siteBadgeLabel = scanStatusCopy ?? emptyHitsCopy;
                const hitStatusVariant = (
                  status: string,
                ): "critical" | "high" | "completed" | "pending" | "running" | "default" =>
                  status === "open" || status === "restored"
                    ? "critical"
                    : status === "quarantined"
                      ? "completed"
                      : status === "pending_quarantine"
                        ? "pending"
                        : status === "pending_restore"
                          ? "running"
                          : status === "ignored"
                            ? "default"
                            : "default";
                const hitStatusLabel = (status: string): string =>
                  status === "pending_quarantine"
                    ? t("statusPendingQuarantine")
                    : status === "pending_restore"
                      ? t("statusPendingRestore")
                      : status === "ignored"
                        ? t("statusIgnored")
                        : status;
                const hitClassVariant = (
                  cls: string,
                ): "critical" | "default" =>
                  cls === "webshell" || cls === "backdoor"
                    ? "critical"
                    : "default";
                return (
                <li key={s.id}>
                  <Card data-testid={`host-site-card-${s.id}`}>
                    <CardHeader className="space-y-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base leading-tight">
                              {s.name}
                            </CardTitle>
                            <Badge
                              variant={siteBadgeVariant}
                              data-testid={`host-site-badge-${s.id}`}
                            >
                              {siteBadgeLabel}
                            </Badge>
                            {activeHits.length > 0 ? (
                              <Badge variant="critical">
                                {activeHits.length} {t("overviewFilesSuffix")}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">
                            {s.root_path}
                          </p>
                          <p
                            className="mt-1 break-all font-mono text-xs text-muted-foreground"
                            data-testid="host-site-id"
                          >
                            {t("siteId")}: {s.id}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              data-testid="host-copy-site-id"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(s.id)
                                  .then(() => toast.success(t("copySiteIdOk")))
                                  .catch(() => toast.error(t("copySiteIdFail")));
                              }}
                            >
                              {t("copySiteId")}
                            </Button>
                            <span
                              className={
                                helperStale
                                  ? "text-xs font-medium text-destructive"
                                  : "text-xs text-muted-foreground"
                              }
                              data-testid="host-helper-poll"
                            >
                              {helperWhen
                                ? helperStale
                                  ? t("helperStale", { when: helperWhen })
                                  : t("helperPolled", { when: helperWhen })
                                : t("helperNeverPolled")}
                            </span>
                          </div>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:shrink-0">
                          <Button
                            size="sm"
                            className="w-full sm:flex-1 lg:w-auto"
                            data-testid="host-scan"
                            disabled={scanMut.isPending}
                            onClick={() => scanMut.mutate(s.id)}
                          >
                            {t("scanNow")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-destructive hover:text-destructive sm:flex-1 lg:w-auto"
                            onClick={() => {
                              if (window.confirm(t("confirmDelete")))
                                delMut.mutate(s.id);
                            }}
                          >
                            {t("delete")}
                          </Button>
                        </div>
                      </div>
                      {scanStatusCopy ? (
                        <p
                          className="max-w-prose text-xs text-muted-foreground"
                          data-testid="host-scan-status"
                        >
                          {scanStatusCopy}
                        </p>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`host-enabled-${s.id}`}>
                            {t("siteEnabled")}
                          </Label>
                          <Select
                            value={s.enabled ? "on" : "off"}
                            onValueChange={(v) =>
                              enabledMut.mutate({
                                id: s.id,
                                enabled: v === "on",
                              })
                            }
                          >
                            <SelectTrigger
                              id={`host-enabled-${s.id}`}
                              data-testid="host-enabled-existing"
                              aria-label={t("siteEnabled")}
                              className="h-10 min-h-10"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="on">
                                {t("siteEnabledOn")}
                              </SelectItem>
                              <SelectItem value="off">
                                {t("siteEnabledOff")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {t("siteEnabledHint")}
                          </p>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`host-interval-${s.id}`}>
                            {t("scanInterval")}
                          </Label>
                          <Select
                            value={s.scan_interval ?? "daily"}
                            onValueChange={(v) =>
                              intervalMut.mutate({
                                id: s.id,
                                scan_interval: v as "daily" | "hourly",
                              })
                            }
                          >
                            <SelectTrigger
                              id={`host-interval-${s.id}`}
                              data-testid="host-interval-existing"
                              aria-label={t("scanInterval")}
                              className="h-10 min-h-10"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">
                                {t("intervalDaily")}
                              </SelectItem>
                              <SelectItem value="hourly">
                                {t("intervalHourly")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {t("intervalHint")}
                          </p>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`host-auto-quarantine-${s.id}`}>
                            {t("autoQuarantine")}
                          </Label>
                          <Select
                            value={s.auto_quarantine ? "on" : "off"}
                            onValueChange={(v) =>
                              autoQuarantineMut.mutate({
                                id: s.id,
                                auto_quarantine: v === "on",
                              })
                            }
                          >
                            <SelectTrigger
                              id={`host-auto-quarantine-${s.id}`}
                              data-testid="host-auto-quarantine-existing"
                              aria-label={t("autoQuarantine")}
                              className="h-10 min-h-10"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="off">
                                {t("autoQuarantineOff")}
                              </SelectItem>
                              <SelectItem value="on">
                                {t("autoQuarantineOn")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {t("autoQuarantineHint")}
                          </p>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`host-watch-${s.id}`}>
                            {t("watchTitle")}
                          </Label>
                          <Select
                            value={(s.watch_on_write ?? false) ? "on" : "off"}
                            onValueChange={(v) =>
                              watchMut.mutate({
                                id: s.id,
                                watch_on_write: v === "on",
                              })
                            }
                          >
                            <SelectTrigger
                              id={`host-watch-${s.id}`}
                              data-testid="host-watch-existing"
                              aria-label={t("watchTitle")}
                              className="h-10 min-h-10"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="off">
                                {t("watchOff")}
                              </SelectItem>
                              <SelectItem value="on">
                                {t("watchOn")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {t("watchHint")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                    <CardContent className="pt-0">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium tracking-wide">
                          {t("hitsTitle")}
                        </p>
                        {ignoredHits.length > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid="host-show-ignored"
                            onClick={() =>
                              setShowIgnoredBySite((prev) => ({
                                ...prev,
                                [s.id]: !showIgnored,
                              }))
                            }
                          >
                            {showIgnored
                              ? t("hideIgnored")
                              : t("showIgnored")}
                          </Button>
                        ) : null}
                      </div>
                      {siteHits.length === 0 ? (
                        <p
                          className="text-sm text-muted-foreground"
                          data-testid="host-hits-empty"
                        >
                          {emptyHitsCopy}
                        </p>
                      ) : (
                        <div data-testid="host-hits">
                          <div className="space-y-2 md:hidden">
                            {siteHits.map((h) => (
                              <div
                                key={h.id}
                                className="rounded-lg border border-border bg-card p-3"
                              >
                                <p className="min-w-0 break-all font-mono text-xs font-medium text-foreground">
                                  {h.rel_path}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <Badge variant={hitClassVariant(h.class)}>
                                    {h.class}
                                  </Badge>
                                  <Badge variant="default" className="font-mono">
                                    {h.engine}
                                  </Badge>
                                  <Badge variant={hitStatusVariant(h.status)}>
                                    {hitStatusLabel(h.status)}
                                  </Badge>
                                </div>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                  {(h.status === "open" ||
                                    h.status === "restored") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full sm:w-auto"
                                      data-testid={`host-quarantine-m-${h.id}`}
                                      onClick={() => qMut.mutate(h.id)}
                                    >
                                      {t("quarantine")}
                                    </Button>
                                  )}
                                  {h.status === "quarantined" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full sm:w-auto"
                                      data-testid={`host-restore-m-${h.id}`}
                                      onClick={() => rMut.mutate(h.id)}
                                    >
                                      {t("restore")}
                                    </Button>
                                  )}
                                  {h.status === "open" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="w-full sm:w-auto"
                                      data-testid={`host-ignore-m-${h.id}`}
                                      onClick={() => iMut.mutate(h.id)}
                                    >
                                      {t("ignore")}
                                    </Button>
                                  )}
                                  {(h.class === "webshell" ||
                                    h.class === "backdoor") && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="w-full sm:w-auto"
                                      asChild
                                    >
                                      <Link to="/guard">{t("openGuard")}</Link>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="hidden overflow-x-auto md:block">
                            <div className="overflow-hidden rounded-md border border-border bg-card">
                              <Table className="table-fixed">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-[40%]">
                                      {t("colPath")}
                                    </TableHead>
                                    <TableHead className="w-[15%]">
                                      {t("colClass")}
                                    </TableHead>
                                    <TableHead className="w-[15%]">
                                      {t("colEngine")}
                                    </TableHead>
                                    <TableHead className="w-[15%]">
                                      {t("colStatus")}
                                    </TableHead>
                                    <TableHead className="w-[15%]" />
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {siteHits.map((h) => (
                                    <TableRow key={h.id}>
                                      <TableCell className="break-all font-mono text-xs">
                                        {h.rel_path}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={hitClassVariant(h.class)}
                                        >
                                          {h.class}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant="default"
                                          className="font-mono"
                                        >
                                          {h.engine}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={hitStatusVariant(h.status)}
                                        >
                                          {hitStatusLabel(h.status)}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-wrap gap-2">
                                          {(h.status === "open" ||
                                            h.status === "restored") && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              data-testid="host-quarantine"
                                              onClick={() => qMut.mutate(h.id)}
                                            >
                                              {t("quarantine")}
                                            </Button>
                                          )}
                                          {h.status === "quarantined" && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              data-testid="host-restore"
                                              onClick={() => rMut.mutate(h.id)}
                                            >
                                              {t("restore")}
                                            </Button>
                                          )}
                                          {h.status === "open" && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              data-testid="host-ignore"
                                              onClick={() => iMut.mutate(h.id)}
                                            >
                                              {t("ignore")}
                                            </Button>
                                          )}
                                          {(h.class === "webshell" ||
                                            h.class === "backdoor") && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              asChild
                                            >
                                              <Link to="/guard">
                                                {t("openGuard")}
                                              </Link>
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="waf">
          <HostWafPanel sites={items} agents={agents} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
